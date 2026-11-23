import {googleProfile, readGoogleSession, requestGoogleSession, saveGoogleSession, subscribeGoogleSession} from '/shop/google-session.mjs';
const byId = id => document.getElementById(id);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const synopsis = {
  2358720:'Bạn vào vai Thiên Mệnh Nhân, lên đường tìm những di vật của Tôn Ngộ Không và khám phá sự thật sau truyền thuyết Tây Du Ký.',
  1245620:'Một Kẻ Hoen Ố trở về Vùng Đất Xen Giữa sau khi Nhẫn Elden tan vỡ. Bạn tìm các Đại Cổ Ngữ và tự chọn con đường trở thành Chúa tể Elden.',
  1086940:'Một ký sinh trùng trong đầu đẩy bạn và những người đồng hành vào cuộc chiến giành quyền tự quyết. Những lựa chọn trên đường đi định hình số phận của cả nhóm.',
  1888930:'Joel hộ tống Ellie qua nước Mỹ hậu tận thế. Chuyến đi bắt đầu như một nhiệm vụ vận chuyển và dần trở thành câu chuyện về niềm tin và sự mất mát.',
  2531310:'Ở Jackson, một biến cố kéo Ellie vào hành trình trả thù đến Seattle. Câu chuyện đi qua hai góc nhìn và hậu quả của những lựa chọn bạo lực.',
  1091500:'V là lính đánh thuê ở Night City. Một phi vụ thất bại khiến V phải sống chung với dấu ấn ký ức của Johnny Silverhand và tìm cách sống sót.',
  883710:'Leon Kennedy và Claire Redfield đến Raccoon City đúng lúc dịch bệnh biến nơi này thành thảm họa. Cả hai tìm đường thoát và lần theo nguồn gốc dịch.',
  2050650:'Leon Kennedy tới một ngôi làng hẻo lánh để tìm con gái tổng thống Mỹ. Anh sớm nhận ra người dân đang bị một thế lực bí ẩn kiểm soát.',
  418370:'Ethan Winters lần theo manh mối về người vợ mất tích đến một căn nhà biệt lập ở Louisiana, nơi gia đình Baker che giấu một bí mật đáng sợ.',
  1196590:'Ethan tìm con gái trong một ngôi làng hẻo lánh, đối mặt với các lãnh chúa và khám phá bí mật về gia đình mình.',
  1659040:'Đặc vụ 47 lần theo tổ chức Providence qua nhiều địa điểm. Mỗi nhiệm vụ cho phép bạn tự chọn cách tiếp cận mục tiêu.',
  1145360:'Zagreus tìm cách thoát khỏi âm phủ và khám phá nguồn gốc gia đình mình. Các vị thần Olympus hỗ trợ anh qua từng chuyến vượt ngục.',
  1222140:'Ba người máy tại Detroit phải đưa ra lựa chọn giữa phục tùng và tự do. Các quyết định của bạn thay đổi số phận của từng nhân vật.',
  2322010:'Kratos và Atreus băng qua Chín Cõi khi Ragnarök đến gần. Atreus đi tìm câu trả lời về thân phận mình, còn Kratos tìm cách bảo vệ gia đình.',
  1817190:'Miles Morales bảo vệ khu phố Harlem khi một cuộc xung đột công nghệ đe dọa thành phố. Cậu học cách tự đảm nhận vai trò Spider-Man.',
  3321460:'Trên lục địa Pywel, Kliff lên đường tìm lại những đồng đội Greymane thất lạc và bị cuốn vào cuộc tranh giành quyền lực.',
  1942280:'Một củ khoai sống sót sau vụ rơi tàu trên hành tinh xa lạ. Bạn phối hợp vũ khí và vật phẩm để chống chọi qua từng đợt quái.',
  2638890:'Một kiếm sĩ mang găng tay Oni đối đầu quân Genma đang tràn vào Kyoto. Trong cuộc chiến, anh tìm lý do để tiếp tục cầm kiếm.',
  1636440:'Simon Ordell quay lại một thị trấn trên đảo để sửa chữa những chuyện trong quá khứ. Khi khám phá hòn đảo, anh phải đối mặt với những sinh vật đáng sợ và lần theo các tín hiệu bí ẩn để tìm ra sự thật.',
  2103140:'Bạn kết hợp phép thuật và đũa phép để vượt qua những căn phòng đầy quái vật và đối đầu với các Cựu Thần.',
  289070:'Bạn dẫn dắt một nền văn minh từ thời cổ đại đến tương lai, chọn phát triển bằng khoa học, văn hóa, ngoại giao hoặc chinh phục.',
  1938090:'Đại úy John Price cùng Task Force 141 đối đầu trùm khủng bố Vladimir Makarov. Chiến dịch Campaign điện ảnh kịch tính và những pha đọ súng siêu thực.',
  4115450:'Võ hiệp hắc ám (Kungfupunk) kết hợp đao thuật tốc độ cao. Sát thủ Hồn (Soul) chỉ còn sống 66 ngày, lên đường tìm kẻ chủ mưu và phá tan âm mưu chấn động giang hồ.',
  644930:'Xây dựng căn cứ và bảo vệ thuộc địa loài người trước hàng tỷ xác sống zombie khát máu trong thế giới steampunk hậu tận thế.',
  892970:'Sinh tồn thần thoại Bắc Âu Viking. Khám phá thế giới hoang dã, chế tạo thuyền buồm và chiến đấu với các quái vật cổ đại để chứng minh phẩm giá trước thần Odin.',
  2114740:'Kẻ Sám Hối (The Penitent One) thức tỉnh và bị cuốn vào vòng lặp sinh tử bất tận chống lại Miracle trong thế giới Gothic đẫm máu.',
  535930:'Xây dựng và điều hành bệnh viện vui nhộn, chữa trị những căn bệnh kỳ lạ và quản lý đội ngũ y bác sĩ tài năng.',
  2868840:'Hành trình leo tháp đầy thử thách với kho bài ma thuật mới, các nhân vật độc đáo và phong cách thẻ bài roguelike đỉnh cao.',
  1371980:'Game nhập vai hành động ARPG thế hệ mới từ nhà phát triển Ori. Khám phá đảo Isola Sacra chìm trong dịch bệnh và tranh chấp chính trị.',
  108600:'Trải nghiệm sinh tồn zombie chân thực và khắc nghiệt nhất. Bạn sẽ sống sót được bao lâu trước khi cái chết tìm đến?',
  1466060:'Thế giới mở u ám dựa trên truyền thuyết Vua Arthur. Khám phá hòn đảo Avalon đang lụi tàn và tìm kiếm con đường cứu rỗi.',
  1285190:'Khám phá thế giới Pandora với dàn Vault Hunter mới, hàng tỷ khẩu súng độc lạ và đồ họa cel-shading bùng nổ.',
  1366540:'Xây dựng mạng lưới nhà máy tự động hóa xuyên thiên hà và kiến tạo công trình vũ trụ vĩ đại Dyson Sphere.',
  397540:'Bắn súng loot đồ điên cuồng với hàng triệu món vũ khí độc dị, ngăn chặn cặp song sinh độc ác Calypso Twins.',
  1057090:'Cuộc phiêu lưu huyền diệu và cảm động của tinh linh Ori trong khu rừng Niwen hoang tàn đầy hiểm nguy.',
  1105670:'Chiến thuật thủ thành roguelite theo lượt. Chỉ huy nhóm anh hùng bảo vệ pháo đài cuối cùng trước làn sóng quái vật ban đêm.',
  1721060:'Thế giới tàn lụi bị chiếm giữ bởi ma thuật hắc ám. Vào vai thợ săn dấn thân vào cõi chết để tìm lại ánh sáng.',
  1236300:'Đấu trường sinh tồn nhiều người chơi kịch tính quy tụ dàn nhân vật và quái vật biểu tượng của vũ trụ Resident Evil.',
  774361:'Hành trình sám hối đẫm máu của The Penitent One tại vùng đất Cvstodia chìm trong nguyền rủa tôn giáo.',
  1199030:'Hòn đảo Avalon chìm trong lời nguyền. Bạn khám phá những vùng đất thay đổi sau mỗi chuyến đi, gặp những người sống sót và lần theo manh mối để tìm hiểu chuyện gì đã xảy ra với hòn đảo. Trên đường đi, bạn xây dựng bộ bài và đối đầu với quái vật trong các trận đấu theo lượt.',
  2012510:'Game chiến thuật thời gian thực (RTS) thế hệ mới kế thừa StarCraft và WarCraft từ các cựu binh Blizzard.'
};
const officialYoutube = {
  774361:'Ctm-GClM6wo',
  2012510:'olCYtiNzikw',
  1199030:'5AfcAlH2aNI',
  2531310:'O6MdexNSy3o',
  2322010:'nBwxyqq1ON4',
  2050650:'eR1jueJOXPo',
  1636440:'ypOLLZ9G4g8',
  4115450:'aOU7KOPGVYU',
  2358720:'7vIqKz_3QpY',
  1245620:'E3Huy2cdih0',
  1086940:'1T22wN1LGnh'
};
// Exactly 31 Games in the Mega Combo Account
const comboIds = new Set([
  1659040, 1086940, 1245620, 644930, 1888930, 892970, 2531310, 2114740, 1091500, 535930,
  2358720, 2050650, 2868840, 1371980, 883710, 108600, 1466060, 4115450, 1222140, 1145360,
  1285190, 1196590, 1366540, 397540, 1057090, 1105670, 1721060, 1236300, 418370, 774361,
  1199030
]);
const groupName = game => comboIds.has(game.id) ? 'Gói Siêu Combo (31 Game AAA)' : 'Game Lẻ Steam Offline';
const fields = [
  ['Hệ điều hành','OS','HĐH'],['CPU','Processor','Bộ xử lý'],
  ['RAM','Memory','Bộ nhớ'],['GPU','Graphics','Đồ họa','Video Card'],
  ['Dung lượng','Storage','Lưu trữ','Hard Disk Space']
];
let games = [];
let player;
let hlsLibrary;
let pageRevision = 0;
let stopFeatured = () => {};
let stopComboSlider = () => {};

function specs(markup = '') {
  const clean = markup.replace(/<br\s*\/?\s*>|<\/li>/gi, '\n');
  const doc = new DOMParser().parseFromString(clean,'text/html');
  const lines = doc.body.textContent.split('\n').map(line => line.trim()).filter(Boolean);
  const entries = new Map(lines.filter(line => line.includes(':')).map(line => {
    const separator = line.indexOf(':');
    const label = line.slice(0, separator).replace(/\s*\*\s*$/, '').trim().toLowerCase();
    return [label, line.slice(separator + 1).trim()];
  }));
  return Object.fromEntries(fields.map(([, field, ...aliases]) => {
    const value = [field, ...aliases].map(label => entries.get(label.toLowerCase())).find(Boolean);
    return [field, value || 'Steam chưa công bố'];
  }));
}

function userIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z');
  svg.append(path);
  return svg;
}

function googleAvatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^lh\d+\.googleusercontent\.com$/.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}

function createComboShowcase(showDrawerByDefault = false, customComboMatches = null) {
  stopComboSlider();

  const comboGamesList = customComboMatches || games.filter(g => comboIds.has(g.id));
  const sliderCandidateIds = [2358720, 1245620, 1086940, 1888930, 2531310, 1091500, 2050650, 4115450, 1222140, 1145360, 1196590];
  const sliderGames = sliderCandidateIds.map(id => games.find(g => g.id === id)).filter(Boolean);

  const showcase = make('div', '', 'combo-showcase');
  const mainCard = make('div', '', 'combo-card-main');

  // Slider container
  const sliderContainer = make('div', '', 'combo-slider-container');
  const stage = make('div', '', 'combo-slider-stage');

  const link = make('a', '', 'combo-slider-link');
  const img = make('img', '', 'combo-slider-img');
  img.alt = '';
  link.append(img);

  const badge = make('span', '31 Game Bom Tấn', 'combo-slider-badge');
  const slideInfo = make('div', '', 'combo-slide-info');
  const slideTitle = make('span', '', 'combo-slide-title');
  const slideGenre = make('span', '', 'combo-slide-genre');
  slideInfo.append(slideTitle, slideGenre);

  const prevBtn = make('button', '❮', 'combo-slider-btn prev');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Game trước');

  const nextBtn = make('button', '❯', 'combo-slider-btn next');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Game tiếp theo');

  stage.append(link, badge, slideInfo, prevBtn, nextBtn);

  const dotsContainer = make('div', '', 'combo-slider-dots');
  const dots = (sliderGames.length > 0 ? sliderGames : [games[0]]).map((game, i) => {
    const dot = make('button', '', 'combo-slider-dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', game.name);
    dot.addEventListener('click', () => setSlide(i));
    dotsContainer.append(dot);
    return dot;
  });

  sliderContainer.append(stage, dotsContainer);

  let currentIndex = 0;
  let timer = null;
  let isHovered = false;

  function getSlideImgSrc(game) {
    if ([2358720, 1245620, 1888930, 2531310, 4115450].includes(game.id)) {
      return new URL(`featured-${game.id}.${game.id === 1888930 ? 'png' : 'jpg'}`, import.meta.url).pathname;
    }
    return game.banner;
  }

  function setSlide(index) {
    if (!sliderGames.length) return;
    currentIndex = (index + sliderGames.length) % sliderGames.length;
    const game = sliderGames[currentIndex];
    img.src = getSlideImgSrc(game);
    link.href = '#game/' + game.id;
    link.setAttribute('aria-label', 'Xem chi tiết ' + game.name);
    slideTitle.textContent = game.name;
    slideGenre.textContent = (game.genre || []).join(' · ');
    dots.forEach((dot, idx) => dot.classList.toggle('active', idx === currentIndex));

    img.getAnimations().forEach(a => a.cancel());
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      img.animate([
        { opacity: 0.5, transform: 'scale(1.03)' },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: 320, easing: 'ease-out' });
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (isHovered || document.hidden || byId('catalog-view').hidden) return;
    timer = setTimeout(() => setSlide(currentIndex + 1), 3800);
  }

  prevBtn.addEventListener('click', e => {
    e.stopPropagation();
    setSlide(currentIndex - 1);
  });
  nextBtn.addEventListener('click', e => {
    e.stopPropagation();
    setSlide(currentIndex + 1);
  });

  stage.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    isHovered = true;
    clearTimeout(timer);
  });
  stage.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse') return;
    isHovered = false;
    schedule();
  });

  stopComboSlider = () => {
    clearTimeout(timer);
  };

  setSlide(0);

  // Right info panel
  const infoPanel = make('div', '', 'combo-info-panel');
  const tagRow = make('div', '', 'combo-tag-row');
  const tagHot = make('span', 'TIẾT KIỆM 93%', 'combo-tag-hot');
  const tagCount = make('span', '31 GAME TRONG 1 TÀI KHOẢN', 'combo-tag-count');
  tagRow.append(tagHot, tagCount);

  const title = make('h2', 'Gói Siêu Combo (Trọn Bộ 31 Game Bom Tấn Steam)', 'combo-title');
  const desc = make('p', '', 'combo-description');
  desc.innerHTML = 'Sở hữu trọn bộ 31 siêu phẩm AAA đình đám nhất trên Steam: <strong>Black Myth: Wukong, Elden Ring, Baldur\'s Gate 3, The Last of Us I & II, Cyberpunk 2077, trọn bộ Resident Evil (2, 4, 7, Village), Hades, Detroit: Become Human, Slay the Spire 2</strong>...';

  const highlights = make('div', '', 'combo-highlights');
  highlights.append(
    make('div', '✓ Chỉ 1 tài khoản Steam Offline sở hữu vĩnh viễn cả 31 game', 'combo-highlight-item'),
    make('div', '✓ Tải game trực tiếp tốc độ cao từ Steam, lưu file save trên máy', 'combo-highlight-item'),
    make('div', '✓ Nhận tài khoản & mật khẩu kèm mã Steam Guard tự động ngay sau khi thanh toán', 'combo-highlight-item')
  );

  const pricingBar = make('div', '', 'combo-pricing-bar');
  const priceGroup = make('div', '', 'combo-price-group');
  const price = make('span', '100.000đ', 'combo-price');
  const priceOrig = make('span', '1.550.000đ', 'combo-price-orig');
  const discountBadge = make('span', '-93%', 'combo-badge-discount');
  priceGroup.append(price, priceOrig, discountBadge);

  const actions = make('div', '', 'combo-actions');
  const buyBtn = make('a', 'Mua Gói Combo 100k', 'primary combo-buy-btn');
  buyBtn.href = '/buy?item=combo_31';

  const toggleBtn = make('button', '', 'combo-toggle-list-btn');
  toggleBtn.type = 'button';
  toggleBtn.id = 'combo-toggle-btn';
  const btnText = make('span', showDrawerByDefault ? 'Thu gọn danh sách' : 'Xem danh sách 31 game', 'btn-text');
  const btnBadge = make('span', String(comboGamesList.length), 'btn-badge');
  toggleBtn.append(btnText, btnBadge);

  actions.append(buyBtn, toggleBtn);
  pricingBar.append(priceGroup, actions);
  infoPanel.append(tagRow, title, desc, highlights, pricingBar);

  mainCard.append(sliderContainer, infoPanel);

  // Drawer for 31 games
  const drawer = make('div', '', 'combo-games-drawer');
  drawer.id = 'combo-games-drawer';
  drawer.hidden = !showDrawerByDefault;

  const drawerHeader = make('div', '', 'combo-drawer-header');
  const drawerTitle = make('h3', customComboMatches ? `Tìm thấy ${comboGamesList.length} game trong Gói Siêu Combo:` : 'Danh sách 31 game có trong Gói Siêu Combo:');
  const drawerSub = make('p', 'Bấm vào từng game để xem giới thiệu, cốt truyện, cấu hình PC và trailer');
  drawerHeader.append(drawerTitle, drawerSub);

  const grid = make('div', '', 'combo-grid');
  comboGamesList.forEach(game => {
    const card = make('a', '', 'game-card combo-item-card');
    card.href = '#game/' + game.id;
    const cover = make('img');
    cover.alt = '';
    cover.src = game.banner;
    cover.loading = 'lazy';

    const label = make('div', '', 'game-card-content');
    const gTitle = make('h2', game.name);
    const meta = make('div', '', 'game-card-meta');
    const cBadge = make('span', 'Trong Gói Combo', 'card-badge badge-combo');
    const pBox = make('div', '', 'card-price-box');
    const pText = make('span', 'Đã gồm trong gói', 'card-price-included');
    pBox.append(pText);
    meta.append(cBadge, pBox);
    label.append(gTitle, meta);
    card.append(cover, label);
    grid.append(card);
  });

  drawer.append(drawerHeader, grid);

  toggleBtn.addEventListener('click', () => {
    const isHidden = drawer.hidden;
    drawer.hidden = !isHidden;
    btnText.textContent = isHidden ? 'Thu gọn danh sách' : 'Xem danh sách 31 game';
    if (isHidden) {
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  showcase.append(mainCard, drawer);
  return showcase;
}

function renderCatalog() {
  const query = byId('game-search').value.trim().toLowerCase();
  const group = byId('game-group').value;

  const comboGames = games.filter(g => comboIds.has(g.id));
  const singleGames = games.filter(g => !comboIds.has(g.id));

  const nodes = [];

  function makeSingleCard(game) {
    const card = make('a', '', 'game-card');
    card.href = '#game/' + game.id;
    const cover = make('img');
    cover.alt = '';
    cover.src = game.banner;
    cover.loading = 'lazy';

    const label = make('div', '', 'game-card-content');
    const title = make('h2', game.name);
    const meta = make('div', '', 'game-card-meta');
    const badge = make('span', 'Game Lẻ Steam', 'card-badge badge-single');
    const priceBox = make('div', '', 'card-price-box');
    const price = make('strong', '50.000đ', 'card-price');
    const origPrice = make('span', '1.200.000đ', 'card-price-orig');
    priceBox.append(price, origPrice);
    meta.append(badge, priceBox);
    label.append(title, meta);
    card.append(cover, label);
    return card;
  }

  function makeSectionHeader(titleText, subText) {
    const header = make('div', '', 'grid-section-title');
    header.append(make('h3', titleText));
    if (subText) header.append(make('p', subText));
    return header;
  }

  if (query) {
    const matchingCombo = comboGames.filter(g => g.name.toLowerCase().includes(query));
    const matchingSingle = singleGames.filter(g => g.name.toLowerCase().includes(query));
    const matchesComboWord = 'gói siêu combo'.includes(query) || 'combo'.includes(query) || '31'.includes(query);

    if (group !== 'single' && (matchingCombo.length > 0 || matchesComboWord)) {
      nodes.push(createComboShowcase(true, matchingCombo.length > 0 ? matchingCombo : comboGames));
    }

    if (group !== 'combo' && matchingSingle.length > 0) {
      nodes.push(makeSectionHeader('Game Lẻ Steam Offline (Đồng Giá 50k)', 'Mỗi tài khoản 1 game riêng biệt, chơi vĩnh viễn'));
      matchingSingle.forEach(game => nodes.push(makeSingleCard(game)));
    }

    if (!nodes.length) {
      nodes.push(make('p', 'Không tìm thấy game phù hợp.', 'game-panel'));
    }
  } else {
    if (group === 'all') {
      nodes.push(createComboShowcase(false));
      nodes.push(makeSectionHeader('Game Lẻ Steam Offline (Đồng Giá 50k)', 'Mỗi tài khoản 1 game riêng biệt, tải và chơi vĩnh viễn'));
      singleGames.forEach(game => nodes.push(makeSingleCard(game)));
    } else if (group === 'combo') {
      nodes.push(createComboShowcase(true));
    } else if (group === 'single') {
      nodes.push(makeSectionHeader('Game Lẻ Steam Offline (Đồng Giá 50k)', 'Mỗi tài khoản 1 game riêng biệt, tải và chơi vĩnh viễn'));
      singleGames.forEach(game => nodes.push(makeSingleCard(game)));
    }
  }

  byId('game-grid').replaceChildren(...nodes);
}

function requirements(game) {
  const panel = make('section','','game-panel');
  panel.append(make('h2','Cấu hình PC'));
  const table = make('table','','requirements'), head = table.createTHead().insertRow(), body = table.createTBody();
  for (const title of ['Hạng mục','Tối thiểu','Đề nghị']) {
    const th = make('th',title); th.scope = 'col'; head.append(th);
  }
  const minimum = specs(game.minimum ?? ''), recommended = specs(game.recommended ?? '');
  for (const [label,field] of fields) {
    const row = body.insertRow();
    const th = make('th',label); th.scope = 'row'; row.append(th);
    row.insertCell().textContent = minimum[field];
    row.insertCell().textContent = recommended[field];
  }
  panel.append(table);
  if (game.id === 1199030) {
    panel.append(make('p','Ở mức đề nghị, Steam chỉ ghi yêu cầu vi xử lý và hệ điều hành 64-bit.','fine'));
  }
  return panel;
}

function trailer(game, revision, featuredPreview = false) {
  const panel = make('section','','game-panel');
  panel.append(make('h2','Trailer'));
  const official = make('a','Xem trailer trên Steam');
  official.href = 'https://store.steampowered.com/app/' + game.id + '/';
  official.target = '_blank'; official.rel = 'noopener noreferrer';
  if (game.id === 1938090 && !featuredPreview) {
    const postId = '7695965497510153493';
    const frame = make('iframe');
    frame.title = 'Trailer ' + game.name;
    frame.src = 'https://www.tiktok.com/player/v1/' + postId + '?autoplay=1&loop=1';
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    official.textContent = 'Mở video trên TikTok';
    official.href = 'https://www.tiktok.com/@ggrshop0/video/' + postId;
    panel.append(frame, official);
    return panel;
  }
  const youtubeId = officialYoutube[game.id];
  const stream = (featuredPreview && game.featuredTrailer) || game.trailer;
  if (!stream && youtubeId) {
    const frame = make('iframe');
    frame.title = 'Trailer ' + game.name;
    frame.src = 'https://www.youtube-nocookie.com/embed/' + youtubeId + '?autoplay=1&playsinline=1' + (featuredPreview ? '&controls=0' : '&mute=1');
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    official.textContent = 'Mở trailer trên YouTube';
    official.href = 'https://www.youtube.com/watch?v=' + youtubeId;
    panel.append(frame);
  } else if (stream) {
    const video = make('video');
    video.controls = !featuredPreview; video.playsInline = true; video.poster = game.banner;
    video.muted = true; video.defaultMuted = true; video.autoplay = true;
    video.preload = 'auto'; video.setAttribute('aria-label','Trailer ' + game.name);
    const play = make('button','Phát trailer','primary');
    async function startTrailer() {
      play.disabled = true;
      try {
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = stream;
        else {
          hlsLibrary ??= new Promise((resolve,reject) => {
            const script = make('script'); script.src = new URL('hls.min.js', import.meta.url).pathname;
            script.onload = resolve; script.onerror = reject; document.head.append(script);
          });
          await hlsLibrary;
          if (revision !== pageRevision) return;
          if (!window.Hls?.isSupported()) throw new Error('Video unsupported');
          player = new window.Hls();
          player.on(window.Hls.Events.ERROR, (_, data) => {
            if (data.fatal) panel.append(make('p','Không phát được video ở đây. Hãy mở trailer trên Steam.','fine'));
          });
          player.loadSource(stream); player.attachMedia(video);
        }
        await video.play();
        play.remove();
      } catch (error) {
        if (revision !== pageRevision) return;
        if (error.name === 'NotAllowedError') {
          video.muted = true;
          await video.play().then(() => play.remove()).catch(() => { play.disabled = false; });
        } else {
          play.disabled = false;
        }
      }
    }
    play.addEventListener('click', () => {
      if (video.currentSrc || player) video.play().then(() => play.remove()).catch(() => {});
      else startTrailer();
    });
    panel.append(video);
    if (!featuredPreview) panel.append(play,document.createTextNode(' '));
    void startTrailer();
  }
  panel.append(official);
  return panel;
}

function setupFeatured() {
  const ids = [1888930, 2531310, 2358720, 1245620, 3321460, 2322010, 2638890, 4115450, 1938090];
  const featured = ids.map(id => games.find(game => game.id === id)).filter(Boolean);
  if (!featured.length) return;

  const section = byId('featured-games');
  const heading = make('h2', 'Game nổi bật');
  const stage = make('div', '', 'featured-stage');
  const frame = make('div', '', 'featured-frame');
  const slide = make('div', '', 'featured-slide');
  const image = make('img');
  image.alt = '';
  const media = make('div', '', 'featured-media');
  const controls = make('div', '', 'featured-controls');
  const link = make('a', '', 'featured-link');
  const preview = make('button', '▶', 'featured-button featured-preview');
  preview.setAttribute('aria-label', 'Phát trailer');
  const previous = make('button', '', 'featured-button featured-arrow featured-arrow-prev');
  const next = make('button', '', 'featured-button featured-arrow featured-arrow-next');
  previous.setAttribute('aria-label', 'Game trước');
  next.setAttribute('aria-label', 'Game tiếp theo');
  const dots = make('div', '', 'featured-dots');
  const dotButtons = featured.map((game, target) => {
    const dot = make('button', '', 'featured-dot');
    dot.setAttribute('aria-label', game.name);
    dot.addEventListener('click', () => select(target, target < index ? 'previous' : 'next'));
    dots.append(dot);
    return dot;
  });
  let index = 0;
  let timer;
  let hovering = false;

  function stopPreview() {
    if (!media.firstChild) return;
    ++pageRevision;
    player?.destroy();
    player = null;
    media.replaceChildren();
    preview.textContent = '▶';
    preview.setAttribute('aria-label', 'Phát trailer');
  }

  function schedule() {
    clearTimeout(timer);
    if (byId('catalog-view').hidden || hovering || media.firstChild || document.hidden) return;
    timer = setTimeout(() => select(index + 1, 'next'), 5000);
  }

  function select(target, direction) {
    stopPreview();
    index = (target + featured.length) % featured.length;
    const game = featured[index];
    image.src = new URL(`featured-${game.id}.${game.id === 1888930 ? 'png' : 'jpg'}`, import.meta.url).pathname;
    link.setAttribute('aria-label', 'Xem chi tiết ' + game.name);
    link.href = '#game/' + game.id;
    dotButtons.forEach((dot, position) => dot.setAttribute('aria-current', String(position === index)));
    slide.getAnimations().forEach(animation => animation.cancel());
    if (direction && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const offset = direction === 'next' ? '100%' : '-100%';
      slide.animate([{ transform: 'translateX(' + offset + ')' }, { transform: 'translateX(0)' }],
        { duration: 350, easing: 'ease-out' });
    }
    schedule();
  }

  function startPreview() {
    if (media.firstChild) return;
    clearTimeout(timer);
    media.append(trailer(featured[index], ++pageRevision, true));
    preview.textContent = '■';
    preview.setAttribute('aria-label', 'Dừng trailer');
  }

  stage.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    hovering = true;
    startPreview();
  });
  stage.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse') return;
    hovering = false;
    stopPreview();
    schedule();
  });
  preview.addEventListener('click', () => {
    if (media.firstChild) stopPreview();
    else startPreview();
    schedule();
  });
  previous.addEventListener('click', () => select(index - 1, 'previous'));
  next.addEventListener('click', () => select(index + 1, 'next'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPreview();
    schedule();
  });
  stopFeatured = () => {
    hovering = false;
    stopPreview();
    schedule();
  };

  slide.append(image);
  stage.append(slide, media, link);
  frame.append(stage, previous, next);
  controls.append(dots, preview);
  section.append(heading, frame, controls);
  section.hidden = false;
  select(0);
}

function route() {
  const game = games.find(item => location.hash === '#game/' + item.id);
  const detail = byId('game-detail');
  detail.replaceChildren();
  byId('catalog-view').hidden = Boolean(game); detail.hidden = !game;
  stopFeatured();
  stopComboSlider();
  const revision = ++pageRevision;
  player?.destroy(); player = null;
  if (game) {
    const isCombo = comboIds.has(game.id);
    const back = make('a','← Về danh mục','back-link'); back.href = '#catalog';
    const hero = make('div','','game-hero'), cover = make('img'), heading = make('div', '', 'game-hero-info');
    cover.src = game.banner; cover.alt = '';
    
    const title = make('h1', game.name);
    const genre = make('p', (game.genre || []).join(' · '), 'muted hero-genre');
    
    const pricingPanel = make('div', '', 'hero-pricing');
    const priceRow = make('div', '', 'hero-price-row');
    const price = make('span', isCombo ? '100.000đ' : '50.000đ', 'hero-price-tag');
    const orig = make('span', isCombo ? '1.550.000đ' : '1.200.000đ', 'hero-price-orig');
    const discount = make('span', isCombo ? '-93%' : '-95%', 'hero-discount');
    priceRow.append(price, orig, discount);
    
    const planDesc = make('p', isCombo 
      ? 'Gói Siêu Combo: Mua 1 tài khoản sở hữu trọn bộ 31 Game Bom Tấn Steam (Black Myth: Wukong, Baldur\'s Gate 3, Elden Ring, The Last of Us I & II, Cyberpunk 2077, Resident Evil...).' 
      : 'Tài khoản riêng 1 game Steam Offline: Chơi vĩnh viễn không giới hạn, tải trực tiếp tốc độ cao từ Steam.', 
      'hero-plan-desc'
    );
    
    const actions = make('div', '', 'hero-actions');
    const buyBtn = make('a', isCombo ? 'Mua Gói Combo 100.000đ' : 'Mua Game Này 50.000đ', 'primary hero-buy-btn');
    buyBtn.href = isCombo ? '/buy?item=combo_31' : `/buy?game=${encodeURIComponent(game.id)}`;
    
    const guarantee = make('p', '✓ Nhận tài khoản & mật khẩu kèm mã Steam Guard tự động ngay sau khi thanh toán', 'hero-guarantee');
    actions.append(buyBtn, guarantee);
    
    pricingPanel.append(priceRow, planDesc, actions);
    heading.append(title, genre, pricingPanel);
    hero.append(cover, heading);
    
    const story = make('section','','game-panel');
    story.append(make('h2','Cốt truyện'),make('p',synopsis[game.id] || 'Xem giới thiệu chính thức trên Steam.'));
    detail.append(back,hero,story,requirements(game),trailer(game,revision));
  } else {
    renderCatalog();
  }
  window.scrollTo(0,0);
}

function renderCatalogAccount(credential) {
  const account = byId('catalog-account');
  const profile = googleProfile(credential);
  if (!profile) {
    const signIn = make('a', 'Đăng nhập', 'catalog-login');
    signIn.href = '/buy?signin=catalog';
    account.replaceChildren(signIn);
    return;
  }
  const menu = make('details', '', 'profile-menu');
  const trigger = make('summary', '', 'profile-trigger');
  trigger.setAttribute('aria-label', 'Menu tài khoản');

  const avatar = googleAvatar(profile.picture) || (profile.picture?.startsWith('https://') ? profile.picture : '');
  if (avatar) {
    const photo = make('img', '', 'profile-photo');
    photo.src = avatar;
    photo.alt = profile.name || 'Avatar';
    photo.referrerPolicy = 'no-referrer';
    photo.addEventListener('error', () => {
      trigger.replaceChildren(userIcon());
    }, { once: true });
    trigger.append(photo);
  } else {
    trigger.append(userIcon());
  }

  const actions = make('div', '', 'profile-panel');
  if (profile.name) {
    const userName = make('div', profile.name, 'profile-user-name');
    actions.append(userName);
  }
  const orders = make('a', 'Đơn hàng của tôi');
  orders.href = '/buy#orders';
  orders.addEventListener('click', () => { menu.open = false; });
  const signOut = make('button', 'Đăng xuất');
  signOut.addEventListener('click', () => {
    saveGoogleSession('');
    renderCatalogAccount('');
  });
  actions.append(orders, signOut);
  menu.append(trigger, actions);
  account.replaceChildren(menu);
}

document.addEventListener('click', event => {
  const menu = document.querySelector('#catalog-account .profile-menu');
  if (menu && menu.open && !menu.contains(event.target)) {
    menu.open = false;
  }
});

renderCatalogAccount(readGoogleSession());
subscribeGoogleSession(renderCatalogAccount);
requestGoogleSession();

try {
  const response = await fetch(new URL('games.json', import.meta.url).pathname);
  if (!response.ok) throw new Error('Catalog unavailable');
  games = await response.json();
  byId('game-search').addEventListener('input',renderCatalog);
  byId('game-group').addEventListener('change',renderCatalog);
  document.querySelector('.catalog-brand')?.addEventListener('click', (e) => {
    if (location.hash) {
      e.preventDefault();
      location.hash = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('hashchange',route);
  renderCatalog();
  setupFeatured();
  route();
} catch {
  // Catalog load failed
}
