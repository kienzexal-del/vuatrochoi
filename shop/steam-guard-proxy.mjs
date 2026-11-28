// Steam Guard Proxy & Slot Quota Management Engine
// Staging prototype for Vuatrochoi Steam Offline accounts.
// Strictly shields userCard cookie server-side.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_USER_CARD =
  '21DVkRqH3S7KzN/QDp9MuxSTCefhYb5P0aha/vnfPnFXOa4ZpWyllsVPMqY33Au0XjnqvRj1mb/sZmTQnee4fA==';
export const UPSTREAM_ENDPOINT = 'https://a.zuhaox.cn/addons/cms/api/getEmail';
export const DAILY_QUOTA_LIMIT = 5;
export const COOLDOWN_SECONDS = 3;

// Translate upstream error messages to user-friendly Vietnamese, ensuring zero Chinese characters leak
export function translateUpstreamError(rawMsg) {
  if (!rawMsg || typeof rawMsg !== 'string') {
    return 'Hệ thống Steam đang bận hoặc gặp lỗi tạm thời. Vui lòng thử lại sau hoặc liên hệ Admin.';
  }

  if (rawMsg.includes('租用记录不存在')) {
    return 'Đơn hàng chưa được kích hoạt hoặc đã hết hạn thuê. Vui lòng kiểm tra lại hoặc liên hệ Admin.';
  }
  if (
    rawMsg.includes('卡密已过期') ||
    rawMsg.includes('卡密不存在') ||
    rawMsg.includes('过期') ||
    rawMsg.includes('不存在')
  ) {
    return 'Tài khoản hiện đang bảo trì hoặc hết hạn thẻ. Vui lòng liên hệ Admin để đổi tài khoản mới.';
  }
  if (rawMsg.includes('频繁') || rawMsg.includes('过于频繁')) {
    return 'Thao tác quá nhanh. Vui lòng đợi ít phút trước khi lấy lại mã.';
  }
  if (
    rawMsg.includes('密码错误') ||
    rawMsg.includes('账号错误') ||
    rawMsg.includes('封禁') ||
    rawMsg.includes('冻结')
  ) {
    return 'Tài khoản đang được cập nhật hoặc đổi mật khẩu. Vui lòng liên hệ Admin để được hỗ trợ.';
  }
  if (
    rawMsg.includes('验证码') ||
    rawMsg.includes('获取失败') ||
    rawMsg.includes('未收到')
  ) {
    return 'Chưa nhận được mã xác nhận từ Steam. Vui lòng đợi vài giây và thử lại.';
  }

  // Fallback: If string contains any Chinese character, return friendly Vietnamese fallback
  if (/[\u4e00-\u9fa5]/.test(rawMsg)) {
    return 'Hệ thống Steam đang bận hoặc tài khoản đang được cập nhật, vui lòng liên hệ Admin.';
  }

  return rawMsg;
}

// 31 AAA Games in the Mega Combo Account (Matched 100% to live Steam Library)
export const COMBO_31_GAMES = [
  'Black Myth: Wukong',
  'Elden Ring',
  "Baldur's Gate 3",
  'Phantom Blade Zero (Bóng Ma Đao: Khởi Nguyên)',
  'Cyberpunk 2077',
  'The Last of Us Part I',
  'The Last of Us Part II Remastered',
  'Hitman: World of Assassination',
  'Resident Evil 4 Remake',
  'Resident Evil 2 Remake',
  'Resident Evil Village (RE 8)',
  'Resident Evil 7: Biohazard',
  'Resident Evil Re:Verse',
  'Slay the Spire 2',
  'No Rest for the Wicked',
  'Detroit: Become Human',
  'Hades',
  'Borderlands 4',
  'Borderlands 3',
  'Valheim',
  'They Are Billions',
  'Blasphemous II',
  'Blasphemous',
  'Project Zomboid',
  'Tainted Grail: Fall of Avalon',
  'Tainted Grail',
  'Dyson Sphere Program',
  'Two Point Hospital',
  'Ori and the Will of the Wisps',
  'The Last Spell',
  'Mandragora'
];

// Product Catalog Definitions with rich game metadata (Banner, Story, PC Requirements, Trailer)
export const STEAM_CATALOG = {
  combo: {
    id: 'combo_31',
    title: 'Gói Siêu Combo: 31 Game Bom Tấn AAA Trong 1 Tài Khoản',
    subtitle: '🔥 SIÊU PHẨM COMBO ĐỘC QUYỀN • TIẾT KIỆM 95%',
    price: 100000,
    originalPrice: 1550000,
    banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2358720/header.jpg',
    games: COMBO_31_GAMES,
    badges: [
      '31 Game Bom Tấn',
      'Có Phantom Blade Zero & Wukong',
      'Lấy mã Steam Guard 1s',
      'Tải trực tiếp từ Steam',
      'Bảo hành đổi tài khoản'
    ],
    story: 'Sở hữu ngay trọn bộ 31 siêu phẩm game bom tấn AAA đình đám nhất thế giới trong một tài khoản duy nhất: Hắc Thoại Ngộ Không (Black Myth: Wukong), Elden Ring, Baldur\'s Gate 3, Phantom Blade Zero, The Last of Us I & II, Cyberpunk 2077, trọn bộ Resident Evil 2, 4, 7, 8 Village, Hitman, Hades, Borderlands 3 & 4... Tải game chính hãng trực tiếp từ máy chủ Steam với tốc độ tối đa.',
    specs: {
      min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i5-8400 / AMD Ryzen 5 1600 | RAM: 16 GB | VGA: NVIDIA GTX 1060 6GB / AMD RX 580 | Ổ cứng: SSD 150 GB',
      rec: 'HĐH: Windows 10/11 64-bit | CPU: Intel Core i7-10700 / AMD Ryzen 7 5700X | RAM: 16-32 GB | VGA: NVIDIA RTX 3060 / 4060 | Ổ cứng: SSD M.2 NVMe'
    },
    trailer: '7vIqKz_3QpY'
  },
  singles: [
    {
      id: 'cod_mw',
      title: 'Call of Duty: Modern Warfare III (MW4)',
      category: 'Bắn Súng / Chiến Tranh',
      tag: 'Chiến dịch Campaign Task Force 141 đỉnh cao',
      price: 50000,
      originalPrice: 1650000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1938090/header.jpg',
      icon: '🎖️',
      story: 'Đại úy John Price cùng lực lượng đặc nhiệm Task Force 141 phải đối mặt với mối đe dọa tối thượng: trùm khủng bố Vladimir Makarov đang mở rộng bàn tay tội ác ra toàn cầu. Trải nghiệm chiến dịch điện ảnh đỉnh cao, đồ họa siêu thực và những pha đọ súng nghẹt thở.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i5-6600 / AMD Ryzen 5 1400 | RAM: 8 GB | VGA: NVIDIA GeForce GTX 960 / GTX 1650 | Ổ cứng: SSD 65 GB',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Intel Core i7-6700K / AMD Ryzen 5 1600X | RAM: 16 GB | VGA: NVIDIA GeForce RTX 3060 / GTX 1080Ti | Ổ cứng: SSD 149 GB'
      },
      trailer: 'mHDEDDrGYvo'
    },
    {
      id: 'cyberpunk_2077',
      title: 'Cyberpunk 2077: Ultimate Edition',
      category: 'Hành Động / RPG',
      tag: 'Đầy đủ DLC Phantom Liberty & Đồ họa đỉnh',
      price: 50000,
      originalPrice: 1450000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg',
      icon: '🌆',
      story: 'Vào vai V - một lính đánh thuê ngoài vòng pháp luật ở Night City, siêu đô thị tương lai bị ám ảnh bởi quyền lực, sự xa hoa và việc cải tạo cơ thể bằng công nghệ sinh học. Bản Ultimate gồm trọn vẹn bản mở rộng cốt truyện Phantom Liberty và vũ khí huyền thoại.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Core i7-6700 / Ryzen 5 1600 | RAM: 12 GB | VGA: GTX 1060 6GB / RX 580 | Ổ cứng: SSD 70 GB',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Core i7-12700 / Ryzen 7 7800X | RAM: 16 GB | VGA: RTX 2060 Super / RX 5700 XT | Ổ cứng: SSD 70 GB'
      },
      trailer: 'qIcTM8WXFjk'
    },
    {
      id: 'god_of_war',
      title: 'God of War: Ragnarök',
      category: 'Hành Động / Phiêu Lưu',
      tag: 'Siêu phẩm PlayStation lên PC',
      price: 50000,
      originalPrice: 1499000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2322010/header.jpg',
      icon: '🪓',
      story: 'Kratos và Atreus phải dấn thân vào từng Cõi trong Chín Cõi để tìm kiếm câu trả lời trước thềm trận chiến định mệnh Ragnarök. Một thiên anh hùng ca cảm động về tình cha con và những trận chiến thần thoại Bắc Âu tàn khốc.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel i5-4670K / AMD Ryzen 3 1200 | RAM: 8 GB | VGA: GTX 1060 (6GB) / RX 5500 XT | Ổ cứng: SSD 190 GB',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Intel i5-8600 / AMD Ryzen 5 3600 | RAM: 16 GB | VGA: RTX 2060 Super / RX 5700 | Ổ cứng: SSD 190 GB'
      },
      trailer: 'EE-4GvjKcfs'
    },
    {
      id: 'spiderman_miles',
      title: "Marvel's Spider-Man: Miles Morales",
      category: 'Hành Động / Thế Giới Mở',
      tag: 'Người nhện New York đồ họa đỉnh',
      price: 50000,
      originalPrice: 1159000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1817190/header.jpg',
      icon: '🕸️',
      story: 'Trải nghiệm hành trình vươn lên thành siêu anh hùng của chàng thiếu niên Miles Morales theo chân người thầy Peter Parker. Khám phá thành phố New York mùa đông tuyết phủ với sức mạnh nọc độc điện sinh học và khả năng tàng hình độc nhất.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Core i3-4160 | RAM: 8 GB | VGA: GTX 950 / RX 470 | Ổ cứng: 75 GB trống',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Core i5-4670 / Ryzen 5 1600 | RAM: 16 GB | VGA: GTX 1060 6GB / RX 580 | Ổ cứng: SSD 75 GB'
      },
      trailer: 'NTqB9e3uYn8'
    },
    {
      id: 'hitman_woa',
      title: 'Hitman: World of Assassination',
      category: 'Ám Sát / Lén Lút',
      tag: 'Trọn bộ sát thủ 47 (Hitman 1,2,3)',
      price: 50000,
      originalPrice: 1350000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1659040/header.jpg',
      icon: '🎯',
      story: 'Trở thành Sát Thủ 47 - cỗ máy giết người hoàn hảo nhất thế giới. Trọn bộ 3 phần Hitman 1, 2 và 3 đưa bạn du hành khắp địa cầu từ các tòa nhà chọc trời Dubai đến các biệt thự cổ kính ở Anh Quốc.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Core i5-2500K / Phenom II X4 | RAM: 8 GB | VGA: GTX 660 / HD 7870 | Ổ cứng: 60 GB trống',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Core i7-4790 / Ryzen 5 1600 | RAM: 16 GB | VGA: GTX 1070 / RX Vega 56 | Ổ cứng: SSD 60 GB'
      },
      trailer: '9o_JjGv7JgU'
    },
    {
      id: 'crimson_desert',
      title: 'Crimson Desert',
      category: 'Thế Giới Mở / RPG',
      tag: 'Bản Deluxe Full DLC Đồ Họa Next-Gen',
      price: 50000,
      originalPrice: 1690000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3290450/header.jpg',
      icon: '⚔️',
      story: 'Một câu chuyện sử thi về những người lính đánh thuê đấu tranh sinh tồn trên lục địa Pywel rộng lớn và tàn khốc. Thế giới mở đồ họa next-gen chân thực với các trận công thành tráng lệ.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel i7-8700K / Ryzen 5 3600 | RAM: 16 GB | VGA: RTX 2060 / RX 5700 | Ổ cứng: SSD 100 GB',
        rec: 'HĐH: Windows 11 64-bit | CPU: Intel i7-13700K / Ryzen 7 7800X3D | RAM: 32 GB | VGA: RTX 4070 / RX 7800 XT | Ổ cứng: SSD 100 GB'
      },
      trailer: 'V_e1uGz3uGk'
    },
    {
      id: 'onimusha',
      title: 'Onimusha: Warlords',
      category: 'Hành Động Samurai / Capcom',
      tag: 'Bản Remaster đồ họa HD kinh điển',
      price: 50000,
      originalPrice: 450000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/761620/header.jpg',
      icon: '👹',
      story: 'Huyền thoại hành động samurai kinh điển của Capcom. Kiếm sĩ Samanosuke Akechi dấn thân vào lâu đài Inabayama giải cứu công chúa Yuki khỏi sự xâm chiếm của binh đoàn quỷ dữ Genma.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i3 Dual Core | RAM: 4 GB | VGA: NVIDIA GeForce GTX 760 | Ổ cứng: 12 GB trống',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Intel Core i7 3770 | RAM: 8 GB | VGA: NVIDIA GeForce GTX 960 | Ổ cứng: 12 GB trống'
      },
      trailer: 'kFwJ73b1q2A'
    },
    {
      id: 'civ_6',
      title: 'Sid Meier’s Civilization VI Anthology',
      category: 'Chiến Thuật / 4X',
      tag: 'Trọn bộ Full DLC & Expansion',
      price: 50000,
      originalPrice: 1980000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/289070/header.jpg',
      icon: '🏛️',
      story: 'Tựa game chiến thuật đỉnh cao đoạt nhiều giải thưởng. Xây dựng một đế chế trường tồn trước thử thách của thời gian từ thời kỳ đồ đá cho đến kỷ nguyên thám hiểm vũ trụ.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i3 2.5 Ghz | RAM: 4 GB | VGA: GeForce 450 / Radeon HD 5570 | Ổ cứng: 12 GB trống',
        rec: 'HĐH: Windows 10 64-bit | CPU: Intel Core i5 2.5 Ghz | RAM: 8 GB | VGA: GeForce 770 / Radeon 7970 | Ổ cứng: 12 GB trống'
      },
      trailer: '5KdE0p2joJw'
    },
    {
      id: 'brotato',
      title: 'Brotato',
      category: 'Bắn Súng / Roguelite',
      tag: 'Siêu gây nghiện, cực nhẹ mượt mọi máy',
      price: 50000,
      originalPrice: 70000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1942280/header.jpg',
      icon: '🥔',
      story: 'Vào vai củ khoai tây chiến binh duy nhất sống sót sau vụ tai nạn phi thuyền ngoài hành tinh. Sử dụng cùng lúc tới 6 loại vũ khí để chống lại làn sóng quái vật hung hãn trong các hiệp đấu 20-30 phút siêu cuốn hút.',
      specs: {
        min: 'HĐH: Windows 10 | CPU: 2 Ghz Dual Core | RAM: 2 GB | VGA: Card đồ họa tích hợp 128MB | Ổ cứng: 200 MB trống',
        rec: 'HĐH: Windows 10/11 | CPU: 2.5 Ghz Quad Core | RAM: 4 GB | VGA: Bất kỳ card đồ họa nào | Ổ cứng: 500 MB trống'
      },
      trailer: '48_C1Q1W95k'
    },
    {
      id: 'silent_hill',
      title: 'Silent Hill 2 Remake',
      category: 'Kinh Dị / Sinh Tồn',
      tag: 'Ám ảnh tâm lý kinh điển Unreal Engine 5',
      price: 50000,
      originalPrice: 1690000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2124490/header.jpg',
      icon: '🌫️',
      story: 'Nhận được một bức thư từ người vợ quá cố Mary, James Sunderland tìm đến thị trấn Silent Hill chìm trong sương mù dày đặc và những ký ức kinh hoàng. Kiệt tác tâm lý kinh dị với đồ họa Unreal Engine 5 đỉnh cao.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i7-6700K / Ryzen 5 3600 | RAM: 16 GB | VGA: GTX 1080 / RX 5700 | Ổ cứng: SSD 50 GB',
        rec: 'HĐH: Windows 11 64-bit | CPU: Intel Core i7-8700K / Ryzen 5 3600X | RAM: 16 GB | VGA: RTX 2080 / RX 6800 XT | Ổ cứng: SSD 50 GB'
      },
      trailer: 'pyC_qiEv0oU'
    },
    {
      id: 'magicraft',
      title: 'Magicraft',
      category: 'Phép Thuật / Roguelike',
      tag: 'Sáng tạo ghép phép thuật tự do',
      price: 50000,
      originalPrice: 220000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2103140/header.jpg',
      icon: '🪄',
      story: 'Tựa game Roguelike phép thuật sáng tạo đột phá. Tự do ghép nối các phép thuật, tạo ra các chuỗi đạn bay biến ảo vô tận để tiêu diệt các thực thể cổ đại xâm lăng thế giới.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Core i3 | RAM: 4 GB | VGA: Card tích hợp Intel HD 4000 | Ổ cứng: 2 GB trống',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Core i5 | RAM: 8 GB | VGA: GTX 1050 | Ổ cứng: 2 GB trống'
      },
      trailer: '3vK1Q_3X9zY'
    },
    {
      id: 'stormgate',
      title: 'Stormgate (Cựu Binh StarCraft 2)',
      category: 'Chiến Thuật Thời Gian Thực',
      tag: 'Kế thừa tinh hoa RTS Blizzard',
      price: 50000,
      originalPrice: 450000,
      banner: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2012510/header.jpg',
      icon: '⚡',
      story: 'Tựa game chiến thuật thời gian thực (RTS) kế thừa tinh hoa của Warcraft 3 và StarCraft 2 từ các cựu binh Blizzard. Trận chiến sinh tồn giữa loài người, quỷ địa ngục và thiên sứ công nghệ cao.',
      specs: {
        min: 'HĐH: Windows 10 64-bit | CPU: Intel Core i5-7400 | RAM: 16 GB | VGA: GeForce GTX 1060 | Ổ cứng: SSD 15 GB',
        rec: 'HĐH: Windows 10/11 64-bit | CPU: Intel Core i7-10700 | RAM: 16 GB | VGA: GeForce RTX 2060 | Ổ cứng: SSD 15 GB'
      },
      trailer: 'Qk_kIu0d5_w'
    }
  ]
};

// Initial multi-slot registry (Held strictly server-side)
export const INITIAL_SLOTS = [
  // Mega Combo 31 AAA Games: Multi-slot Hitman combo accounts
  {
    id: 'slot-combo-1',
    gameId: 'combo_31',
    account: 'whkzw21078',
    password: 'yamvd58819',
    yzid: '28951',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-combo-2',
    gameId: 'combo_31',
    account: "whkzw21078",
    password: "yamvd58819",
    yzid: '9041',
    active: true,
    timestamps: []
  },

  // Onimusha Warlords: 3-slot rotation pool
  {
    id: 'slot-onimusha-1',
    gameId: 'onimusha',
    account: 'xiaofang215',
    password: 'xiaofang215',
    yzid: '15052',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-onimusha-2',
    gameId: 'onimusha',
    account: "xiaofang215",
    password: "11681168",
    yzid: '8885',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-onimusha-3',
    gameId: 'onimusha',
    account: "songjiefeng2",
    password: "27782778",
    yzid: '8530',
    active: true,
    timestamps: []
  },

  // Hitman single game: Multi-slot pool shared with combo or distinct
  {
    id: 'slot-hitman-1',
    gameId: 'hitman_woa',
    account: 'whkzw21078',
    password: 'yamvd58819',
    yzid: '28951',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-hitman-2',
    gameId: 'hitman_woa',
    account: "whkzw21078",
    password: "yamvd58819",
    yzid: '9041',
    active: true,
    timestamps: []
  },

  // Remaining Single Games
  {
    id: 'slot-cyberpunk',
    gameId: 'cyberpunk_2077',
    account: 'shuaihua20251001',
    password: '18621862',
    yzid: '28715',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-gow',
    gameId: 'god_of_war',
    account: 'Aereww111',
    password: 'Aereww111',
    yzid: '18159',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-spiderman',
    gameId: 'spiderman_miles',
    account: '5z8uk9iff',
    password: '5z8u43AA',
    yzid: '27630',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-cod',
    gameId: 'cod_mw',
    account: 'smzh44444',
    password: '27392739',
    yzid: '21810',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-crimson',
    gameId: 'crimson_desert',
    account: 'kbe140289',
    password: 'kbe140289',
    yzid: '18309',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-civ6',
    gameId: 'civ_6',
    account: 'frq844042',
    password: 'frq844042',
    yzid: '12273',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-brotato',
    gameId: 'brotato',
    account: 'frq844042',
    password: 'frq844042',
    yzid: '13604',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-silenthill',
    gameId: 'silent_hill',
    account: 'Qingning0115',
    password: 'ojqzEE63',
    yzid: '9746',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-magicraft',
    gameId: 'magicraft',
    account: 'kwxmktz49',
    password: 'kwxmktz49',
    yzid: '10371',
    active: true,
    timestamps: []
  },
  {
    id: 'slot-stormgate',
    gameId: 'stormgate',
    account: 'vxl557811',
    password: 'vxl557811',
    yzid: '13594',
    active: true,
    timestamps: []
  }
];

// Official Bank Account for VietQR and SePay Verification
export const BANK_CONFIG = {
  bank: 'MB',
  bankName: 'MB Bank (Quân Đội)',
  account: '0000125042003',
  name: 'NGUYEN VAN KIEN'
};

// Mapping numeric Steam App IDs and aliases to internal slot game slugs
export const STEAM_ID_TO_SLOT_GAME = {
  2322010: 'god_of_war',       // God of War: Ragnarök
  1938090: 'cod_mw',           // Call of Duty: Modern Warfare III
  1091500: 'cyberpunk_2077',   // Cyberpunk 2077
  1817190: 'spiderman_miles',  // Marvel's Spider-Man: Miles Morales
  1659040: 'hitman_woa',       // Hitman: World of Assassination
  3290450: 'crimson_desert',   // Crimson Desert
  3321460: 'crimson_desert',
  761620: 'onimusha',          // Onimusha: Warlords
  2638890: 'onimusha',
  289070: 'civ_6',             // Civilization VI
  1942280: 'brotato',          // Brotato
  2124490: 'silent_hill',      // Silent Hill 2
  1636440: 'silent_hill',
  2103140: 'magicraft',        // Magicraft
  2012510: 'stormgate',        // Stormgate
  combo_31: 'combo_31',
  combo: 'combo_31'
};

// Helper: Resolve any gameId representation (numeric Steam ID, game_XXXX, or slug) to slot gameId
export function resolveGameSlug(gameId) {
  if (gameId === undefined || gameId === null) return null;
  const raw = String(gameId).trim();
  const cleaned = raw.replace(/^(game_|item_)/, '');

  if (STEAM_ID_TO_SLOT_GAME[cleaned]) return STEAM_ID_TO_SLOT_GAME[cleaned];
  if (STEAM_ID_TO_SLOT_GAME[raw]) return STEAM_ID_TO_SLOT_GAME[raw];

  const num = Number(cleaned);
  if (!Number.isNaN(num) && STEAM_ID_TO_SLOT_GAME[num]) {
    return STEAM_ID_TO_SLOT_GAME[num];
  }

  if (cleaned === 'combo_31' || raw === 'combo_31' || cleaned === 'combo') {
    return 'combo_31';
  }

  const foundSingle = STEAM_CATALOG.singles.find(s => s.id === cleaned || s.id === raw);
  if (foundSingle) return foundSingle.id;

  return cleaned || raw;
}

export class SteamGuardProxy {
  constructor(options = {}) {
    this.userCard = options.userCard || process.env.ZUHAOX_USER_CARD || DEFAULT_USER_CARD;
    this.upstreamEndpoint = options.upstreamEndpoint || UPSTREAM_ENDPOINT;
    this.stateFilePath = options.stateFilePath || null;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.dailyQuotaLimit = options.dailyQuotaLimit || DAILY_QUOTA_LIMIT;
    this.cooldownSeconds = options.cooldownSeconds || COOLDOWN_SECONDS;
    this.cooldownMs = this.cooldownSeconds * 1000;
    this.slots = JSON.parse(JSON.stringify(INITIAL_SLOTS));
    this.orders = [];
    this.initialized = false;
    this._initPromise = null;
  }

  // Load state from staging persistence file if provided
  async init() {
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      if (this.stateFilePath && existsSync(this.stateFilePath)) {
        try {
          const raw = await readFile(this.stateFilePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.slots) && data.slots.length > 0) {
            // Merge timestamps from saved slots to avoid losing schema updates
            const savedMap = new Map(data.slots.map(s => [s.id, s]));
            for (const slot of this.slots) {
              const saved = savedMap.get(slot.id);
              if (saved && Array.isArray(saved.timestamps)) {
                slot.timestamps = saved.timestamps;
                if (saved.active !== undefined) slot.active = saved.active;
              }
            }
          }
          if (Array.isArray(data.orders)) {
            this.orders = data.orders;
          }
        } catch (err) {
          console.warn('[SteamGuardProxy] Failed to load state file, using defaults:', err.message);
        }
      }
      this.initialized = true;
    })();
    return this._initPromise;
  }

  // Persist state to JSON file
  async persist() {
    if (!this.stateFilePath) return;
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        slots: this.slots,
        orders: this.orders
      };
      await writeFile(this.stateFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SteamGuardProxy] Failed to persist state:', err.message);
    }
  }

  // Clean old timestamps (> 24 hours) and compute usage count
  getSlotUsage(slot, windowMs = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - windowMs;
    slot.timestamps = (slot.timestamps || []).filter(ts => ts > cutoff);
    return slot.timestamps.length;
  }

  // Compute effective usage count including in-flight requests
  getEffectiveSlotUsage(slot, windowMs = 24 * 60 * 60 * 1000) {
    return this.getSlotUsage(slot, windowMs) + (slot.inFlight || 0);
  }

  // Check remaining quota for a slot (max 5/day)
  getSlotRemainingQuota(slot) {
    const effectiveUsed = this.getEffectiveSlotUsage(slot);
    return Math.max(0, this.dailyQuotaLimit - effectiveUsed);
  }

  // Find all active slots for a given gameId
  getSlotsForGame(gameId) {
    const slug = resolveGameSlug(gameId) || gameId;
    return this.slots.filter(s => (s.gameId === slug || s.gameId === gameId) && s.active);
  }

  // Get available slots count for a game
  getAvailableSlotCountForGame(gameId) {
    const slots = this.getSlotsForGame(gameId);
    return slots.filter(s => this.getSlotRemainingQuota(s) > 0).length;
  }

  // Check if a game is in stock (has at least 1 slot with remaining daily quota)
  isGameInStock(gameId) {
    return this.getAvailableSlotCountForGame(gameId) > 0;
  }

  // Get sanitized catalog for client (never exposes yzid, userCard, or credentials)
  async getCatalog() {
    await this.init();
    const comboSlots = this.getSlotsForGame('combo_31');
    const comboAvailable = comboSlots.filter(s => this.getSlotRemainingQuota(s) > 0).length;
    const comboInStock = comboAvailable > 0;

    const singles = STEAM_CATALOG.singles.map(item => {
      const slots = this.getSlotsForGame(item.id);
      const availableSlots = slots.filter(s => this.getSlotRemainingQuota(s) > 0).length;
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        tag: item.tag,
        price: item.price,
        icon: item.icon,
        inStock: availableSlots > 0,
        availableSlots
      };
    });

    return {
      ok: true,
      combo: {
        ...STEAM_CATALOG.combo,
        inStock: comboInStock,
        availableSlots: comboAvailable
      },
      singles
    };
  }

  // Allocate an active slot for an order
  allocateSlotForGame(gameId) {
    const slots = this.getSlotsForGame(gameId);
    // Find slot with quota remaining, prioritizing lowest usage
    const availableSlots = slots
      .map(s => ({ slot: s, remaining: this.getSlotRemainingQuota(s) }))
      .filter(item => item.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);

    return availableSlots.length > 0 ? availableSlots[0].slot : null;
  }

  // Create an order after demo / QR checkout (supports pending or instant paid)
  async createOrder({ gameId, customerName = 'Khách trải nghiệm', pending = false, status } = {}) {
    await this.init();
    if (!gameId) {
      return { ok: false, error: 'INVALID_REQUEST', message: 'Vui lòng cung cấp gameId.' };
    }

    const resolvedGameId = resolveGameSlug(gameId) || gameId;
    const isCombo = resolvedGameId === 'combo_31';
    let productTitle = '';
    let productPrice = 50000;

    if (isCombo) {
      productTitle = STEAM_CATALOG.combo.title;
      productPrice = STEAM_CATALOG.combo.price;
    } else {
      const item = STEAM_CATALOG.singles.find(s => s.id === resolvedGameId || s.id === gameId);
      if (!item) {
        return { ok: false, error: 'PRODUCT_NOT_FOUND', message: 'Sản phẩm không tồn tại.' };
      }
      productTitle = item.title;
      productPrice = item.price;
    }

    const isPending = Boolean(pending || status === 'PENDING');

    // Allocate available slot or check stock
    const slot = this.allocateSlotForGame(resolvedGameId);
    if (!slot) {
      return {
        ok: false,
        error: 'OUT_OF_STOCK',
        status: 'OUT_OF_STOCK',
        message: 'tạm hết hàng, vui lòng đợi. Tất cả các tài khoản cho tựa game này đã đạt giới hạn 5 lần/ngày. Vui lòng liên hệ Admin qua Zalo/Telegram để được hỗ trợ.'
      };
    }

    const orderId = `VTCH-OFF-${Math.floor(10000 + Math.random() * 90000)}`;
    const order = {
      orderId,
      gameId: resolvedGameId,
      rawGameId: gameId,
      title: productTitle,
      price: productPrice,
      account: isPending ? undefined : slot.account,
      password: isPending ? undefined : slot.password,
      slotId: isPending ? undefined : slot.id,
      customerName,
      status: isPending ? 'PENDING' : 'PAID',
      createdAt: Date.now(),
      lastFetchTime: 0,
      inFlight: false,
      paymentInfo: {
        bank: BANK_CONFIG.bank,
        bankName: BANK_CONFIG.bankName,
        account: BANK_CONFIG.account,
        name: BANK_CONFIG.name,
        amount: productPrice,
        memo: orderId,
        qrUrl: `https://img.vietqr.io/image/${BANK_CONFIG.bank}-${BANK_CONFIG.account}-compact2.png?amount=${productPrice}&addInfo=${orderId}&accountName=${encodeURIComponent(BANK_CONFIG.name)}`
      }
    };

    this.orders.unshift(order);
    await this.persist();

    return {
      ok: true,
      order: this.sanitizeOrder(order)
    };
  }

  // Fulfill an order upon payment confirmation (SePay Webhook or Simulation)
  async fulfillOrder(orderId) {
    await this.init();
    const order = this.orders.find(o => o.orderId === orderId);
    if (!order) {
      return { ok: false, error: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng.' };
    }

    if (order.status === 'PAID') {
      return { ok: true, order: this.sanitizeOrder(order) };
    }

    const slot = this.allocateSlotForGame(order.gameId);
    if (!slot) {
      return {
        ok: false,
        error: 'OUT_OF_STOCK',
        status: 'OUT_OF_STOCK',
        message: 'tạm hết hàng, vui lòng đợi. Tất cả các tài khoản cho tựa game này đã đạt giới hạn 5 lần/ngày. Vui lòng liên hệ Admin qua Zalo/Telegram để được hỗ trợ.'
      };
    }

    order.account = slot.account;
    order.password = slot.password;
    order.slotId = slot.id;
    order.status = 'PAID';
    await this.persist();

    return {
      ok: true,
      order: this.sanitizeOrder(order)
    };
  }

  // Retrieve an existing order by ID
  async getOrder(orderId) {
    await this.init();
    const order = this.orders.find(o => o.orderId === orderId);
    if (!order) return null;
    return this.sanitizeOrder(order);
  }

  // Sanitize order output: NEVER leak internal yzid or sensitive tokens
  sanitizeOrder(order) {
    const sanitized = {
      orderId: order.orderId,
      gameId: order.gameId,
      title: order.title,
      price: order.price,
      status: order.status,
      customerName: order.customerName,
      createdAt: order.createdAt,
      paymentInfo: order.paymentInfo
    };
    if (order.status === 'PAID') {
      sanitized.account = order.account;
      sanitized.password = order.password;
      sanitized.slotId = order.slotId;
    }
    return sanitized;
  }

  // Request Steam Guard verification code with auto-rotation & quota enforcement
  async fetchGuardCode(orderId) {
    await this.init();
    const order = this.orders.find(o => o.orderId === orderId);
    if (!order) {
      return { ok: false, error: 'ORDER_NOT_FOUND', message: 'Đơn hàng không tồn tại.' };
    }

    if (order.status !== 'PAID') {
      return {
        ok: false,
        error: 'ORDER_NOT_PAID',
        message: 'Đơn hàng chưa được thanh toán. Vui lòng thanh toán trước khi lấy mã Steam Guard.'
      };
    }

    const now = Date.now();
    // Immediate pre-flight cooldown lock
    if (order.inFlight) {
      return {
        ok: false,
        error: 'COOLDOWN_ACTIVE',
        wait: this.cooldownSeconds,
        message: `Vui lòng chờ ${this.cooldownSeconds} giây trước khi lấy lại mã.`
      };
    }
    const elapsed = now - (order.lastFetchTime || 0);
    if (elapsed < this.cooldownMs) {
      const waitRemaining = Math.max(1, Math.ceil((this.cooldownMs - elapsed) / 1000));
      return {
        ok: false,
        error: 'COOLDOWN_ACTIVE',
        wait: waitRemaining,
        message: `Vui lòng chờ ${waitRemaining} giây trước khi lấy lại mã.`
      };
    }

    // Lock order immediately before any asynchronous window
    order.inFlight = true;
    order.lastFetchTime = now;

    let reservedSlot = null;
    try {
      // Locate current slot
      let slot = this.slots.find(s => s.id === order.slotId);
      let slotRotated = false;

      // Check if slot quota is full (effective usage >= dailyQuotaLimit)
      if (!slot || this.getSlotRemainingQuota(slot) <= 0) {
        // Find alternate active slot with remaining quota for the same game
        const alternateSlots = this.getSlotsForGame(order.gameId)
          .filter(s => s.id !== (slot ? slot.id : null) && this.getSlotRemainingQuota(s) > 0)
          .sort((a, b) => this.getSlotRemainingQuota(b) - this.getSlotRemainingQuota(a));

        if (alternateSlots.length > 0) {
          // Auto-rotate order to alternate slot!
          slot = alternateSlots[0];
          order.slotId = slot.id;
          order.account = slot.account;
          order.password = slot.password;
          slotRotated = true;
        } else {
          // All slots for this game have exhausted their 5 daily requests!
          return {
            ok: false,
            error: 'OUT_OF_QUOTA',
            status: 'OUT_OF_STOCK',
            message: 'tạm hết hàng, vui lòng đợi. Tất cả các slot tài khoản hôm nay đã đạt giới hạn lấy mã tối đa (5 lần/ngày). Vui lòng liên hệ Admin qua Zalo/Telegram để được mở thêm slot mới.'
          };
        }
      }

      // In-flight slot reservation
      reservedSlot = slot;
      slot.inFlight = (slot.inFlight || 0) + 1;

      // Call upstream Zuhaox API
      const upstreamRes = await this.callUpstream(slot.yzid);
      if (upstreamRes.code === 1) {
        // Record timestamp
        slot.timestamps.push(Date.now());
        order.lastFetchTime = Date.now();

        // Release in-flight reservation before computing remaining calls
        slot.inFlight = Math.max(0, (slot.inFlight || 0) - 1);
        reservedSlot = null;

        await this.persist();

        const remainingCalls = this.getSlotRemainingQuota(slot);
        return {
          ok: true,
          code: upstreamRes.data,
          wait: upstreamRes.wait || this.cooldownSeconds,
          remainingCalls,
          slotRotated,
          account: order.account,
          password: order.password
        };
      } else {
        const translatedMsg = translateUpstreamError(upstreamRes.msg);
        return {
          ok: false,
          error: 'UPSTREAM_ERROR',
          message: translatedMsg
        };
      }
    } catch (err) {
      const isChinese = /[\u4e00-\u9fa5]/.test(err.message);
      const cleanErrMsg = isChinese ? translateUpstreamError(err.message) : err.message;
      return {
        ok: false,
        error: 'UPSTREAM_NETWORK_ERROR',
        message: 'Lỗi kết nối tới máy chủ Steam Guard: ' + cleanErrMsg
      };
    } finally {
      if (reservedSlot) {
        reservedSlot.inFlight = Math.max(0, (reservedSlot.inFlight || 0) - 1);
        reservedSlot = null;
      }
      order.inFlight = false;
      await this.persist();
    }
  }

  // Internal caller to upstream zuhaox endpoint injecting userCard cookie
  async callUpstream(yzid) {
    if (process.env.STEAM_STAGING_MOCK === '1') {
      const sampleCodes = ['595YR', 'W6TD7', '76B9R', 'C6Y5K', '2RKRV'];
      const code = sampleCodes[Math.floor(Math.random() * sampleCodes.length)];
      return { code: 1, msg: '获取验证码', data: code, url: '', wait: 3 };
    }

    const body = new URLSearchParams({ yzid: String(yzid) }).toString();
    const res = await this.fetchFn(this.upstreamEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `userCard=${this.userCard}`
      },
      body,
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      throw new Error(`Upstream HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data;
  }

  // Staging debug endpoint: Reset or set quota for testing slot rotation and fallback
  async resetQuota({ slotId, gameId, count = 0 } = {}) {
    await this.init();
    let targetSlots = [];

    if (slotId) {
      targetSlots = this.slots.filter(s => s.id === slotId);
    } else if (gameId) {
      targetSlots = this.getSlotsForGame(gameId);
    } else {
      targetSlots = this.slots;
    }

    if (targetSlots.length === 0) {
      return { ok: false, error: 'SLOT_NOT_FOUND', message: 'Không tìm thấy slot phù hợp.' };
    }

    const now = Date.now();
    for (const slot of targetSlots) {
      slot.inFlight = 0;
      if (count === 0) {
        slot.timestamps = [];
      } else {
        // Populate with `count` timestamps within 24h
        slot.timestamps = Array.from({ length: Math.min(count, 10) }, (_, i) => now - (i + 1) * 60000);
      }
    }

    for (const order of this.orders) {
      order.inFlight = false;
    }

    await this.persist();
    return {
      ok: true,
      message: `Đã đặt quota cho ${targetSlots.length} slot thành ${count} lần sử dụng.`
    };
  }
}
