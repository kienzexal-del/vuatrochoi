# 👑 VUA TRÒ CHƠI - HỆ THỐNG PHÂN PHỐI ĐA NỀN TẢNG & QUẢN LÝ KEY (0 ĐỒNG)
### Hỗ trợ: Windows 10/11 | Steam Deck (SteamOS) | Linux PC | macOS (M1/M2/M3/M4 & Intel)

Hệ thống cho phép bạn **bán giải pháp mở khóa Steam & Game tốc độ cao** hoàn toàn tự động qua **1 dòng lệnh duy nhất**, quản lý bản quyền theo từng máy tính (HWID), chống phát tán và chống dùng chùa 100% mà **không mất 1 đồng chi phí thuê máy chủ (server)**.

---

## 📁 CÁC TẬP TIN PHÂN PHỐI (TRONG THƯ MỤC NÀY):

### 1. Dành cho Windows (White-label & Chống soi 100%):
* **`VuaTroChoi.exe` / `VuaTroChoi_App.zip`**: App đồ họa Desktop (GUI 1-Click Standalone không cần cài thêm .NET). Dành cho khách thích mở app giao diện bấm nút thay vì gõ lệnh. Tự động chạy ngầm, ẩn thư mục hệ thống, tuyệt đối không lộ dấu vết.
* **`install.ps1`**: Bộ cài 1 dòng lệnh PowerShell Windows (nhúng sẵn `GameNetworkService.exe`, driver `WinDivert`, chạy ngầm qua `vtch_runner.vbs`, thư mục ẩn hệ thống `+s +h`, dịch vụ `Game_Network_Optimizer`, tự cấu hình DNS Google, tự vượt UAC).
* **`uninstall.ps1`**: Lệnh gỡ cài đặt sạch sẽ trên Windows.

### 2. Dành cho Steam Deck (SteamOS) & Linux PC:
* **`install_linux.sh`**: Bộ cài 1 dòng lệnh Linux (nhúng sẵn binary `gamesvc` Linux x86_64, tự cấu hình iptables/nftables, tự cấu hình DNS sạch, tự đăng ký systemd service `gamesvc.service` chạy ngầm vĩnh viễn cả ở Desktop Mode lẫn Gaming Mode trên Steam Deck).
* **`uninstall_linux.sh`**: Lệnh gỡ cài đặt sạch sẽ trên Linux/SteamOS.

### 3. Dành cho macOS (MacBook, Mac Mini, iMac - Chip M1-M4 & Intel):
* **`install_mac.sh`**: Bộ cài 1 dòng lệnh macOS (nhúng sẵn binary `gamesvc` chạy native cho chip M1-M4 và Intel, không cần tắt SIP, tự cấu hình DNS, tự đăng ký LaunchDaemon `com.gamenetwork.optimizer.plist` chạy ngầm).
* **`uninstall_mac.sh`**: Lệnh gỡ cài đặt sạch sẽ trên macOS.

### 4. Tập tin đa năng & Hệ thống quản lý:
* **`install.sh`**: Script tự động nhận diện hệ điều hành (nếu là Mac thì chạy gói Mac, nếu là Linux/Steam Deck thì chạy gói Linux).
* **`GoogleAppsScript_Code.js`**: Mã nguồn máy chủ xác thực Key miễn phí trên Google Sheets (chia 2 tab `Keys_Lifetime` và `Keys_Trial`, dùng chung cho cả Windows, Mac, Linux).
* **`rebuild_core_zip.ps1`**: Đóng gói lại core Windows với tên bí mật (`GameNetworkService.exe`, `vtch_runner.vbs`).
* **`build_distribution.ps1`**: Đóng gói bộ cài Windows `install.ps1` và `uninstall.ps1`.
* **`build_unix_distribution.ps1`**: Đóng gói bộ cài Unix (`install_linux.sh`, `install_mac.sh`, `install.sh`).

---

## 🚀 BƯỚC 1: QUẢN LÝ BẢN QUYỀN TRÊN GOOGLE SHEETS

* Link API Google Apps Script của bạn hiện tại đã hoạt động trực tiếp:
  ```
  https://script.google.com/macros/s/AKfycbzsJ4SvFtnCRROeB3SZHNcq65oReT-wlBQJlwF9eG4WUsDI9cJT4JuXLLuH9Y6TYZdRJg/exec
  ```
* Bảng tính Google Sheets của bạn quản lý chung cho mọi thiết bị:
  - Máy tính Windows: Tự nhận dạng qua mã UUID mainboard.
  - Máy Steam Deck: Tự nhận dạng qua Serial máy (`product_serial`).
  - Máy Mac (Apple Silicon): Tự nhận dạng qua phần cứng (`IOPlatformUUID`).
* **Mỗi 1 Key bán ra chỉ kích hoạt được đúng 1 máy duy nhất**, không sợ khách gửi cho người khác dùng chùa!

---

## 🌐 BƯỚC 2: CÁCH ĐƯA LÊN GITHUB ĐỂ BÁN HÀNG

1. Mở GitHub repo của bạn: `https://github.com/kienzexal-del/vuatrochoi`.
2. Bấm nút **Add file** > **Upload files**.
3. Kéo thả các file trong thư mục `C:\mang\Distribution` lên:
   - `install.ps1`
   - `install.sh`
   - `install_linux.sh`
   - `install_mac.sh`
   - `uninstall.ps1`
   - `uninstall_linux.sh`
   - `uninstall_mac.sh`
4. Bấm **Commit changes** (Lưu lại).

---

## 💰 QUY TRÌNH BÁN HÀNG CHO TỪNG ĐỐI TƯỢNG KHÁCH HÀNG

### 🪟 KHÁCH DÙNG WINDOWS (PC / Laptop):
Gửi hướng dẫn cho khách:
```text
HƯỚNG DẪN KÍCH HOẠT STEAM TỐC ĐỘ CAO (MẤT 2 GIÂY):
1. Bấm phím Windows, gõ "PowerShell", mở lên.
2. Dán dòng lệnh sau và ấn Enter:
   irm tinyurl.com/vtch-win | iex

(Hoặc link gốc nếu mạng chặn short link:
   irm https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/install.ps1 | iex)

3. Nhập Key bản quyền của bạn: [MÃ_KEY]
```

---

### 🎮 KHÁCH DÙNG STEAM DECK (SteamOS) & LINUX:
Gửi hướng dẫn cho khách:
```text
HƯỚNG DẪN MỞ KHÓA STEAM STORE CHO STEAM DECK:
1. Bấm nút STEAM > Chọn Power > Switch to Desktop (Chuyển sang Desktop Mode).
2. Mở ứng dụng Konsole (Terminal) trên màn hình.
3. Dán dòng lệnh sau và ấn Enter:
   curl -sSL tinyurl.com/vtch-deck | sudo bash

(Hoặc link gốc:
   curl -sSL https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/install_linux.sh | sudo bash)

4. Nhập Key bản quyền của bạn: [MÃ_KEY]
5. Quay lại Gaming Mode và tận hưởng Steam Store mượt mà!
```

---

### 🍎 KHÁCH DÙNG MACBOOK / IMAC (CHIP M1, M2, M3, M4 & INTEL):
Gửi hướng dẫn cho khách:
```text
HƯỚNG DẪN KÍCH HOẠT STEAM & MẠNG TRÊN MACOS:
1. Mở ứng dụng Terminal trên máy Mac (nhấn Cmd + Space, gõ Terminal).
2. Dán dòng lệnh sau và ấn Enter:
   curl -sSL tinyurl.com/vtch-mac | sudo bash

(Hoặc link gốc:
   curl -sSL https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/install_mac.sh | sudo bash)

3. Nhập mật khẩu máy Mac (khi máy yêu cầu) và nhập Key bản quyền: [MÃ_KEY]
4. Xong! Hệ thống tự động kích hoạt ngầm vĩnh viễn.
```

## 🛡️ HƯỚNG DẪN NGẮT KẾT NỐI TỪ XA & QUẢN LÝ THỦ CÔNG TỪNG KHÁCH (REMOTE KILLSWITCH)

Hệ thống được trang bị tính năng **Bảo vệ bản quyền thời gian thực & Ngắt kết nối từ xa**. Bạn có toàn quyền kiểm soát từng máy khách ngay trên Google Sheets mà không cần chạm vào máy của họ:

### 1. Cách ngắt kết nối thủ công 1 người (Khách bùng tiền / Chưa thanh toán):
1. Mở trang Google Sheets của bạn.
2. Tìm dòng chứa Key của người đó (ở Cột E có ghi tên/note của khách).
3. Tại **Cột B (Status)**: Nhập chữ **`Locked`** (hoặc `khoa`, `disabled`).
4. 👉 **Kết quả trên máy khách:**
   - Trong vòng 15 phút (hoặc ngay khi khách vừa khởi động lại máy), tiến trình bảo vệ ngầm sẽ phát hiện lệnh khóa từ máy chủ.
   - Máy khách lập tức **DẬP TẮT NGAY LẬP TỨC** dịch vụ `GameNetworkService.exe`.
   - DNS của khách được tự động trả về mặc định nhà mạng (DHCP) -> Steam lập tức bị chặn lại như cũ!
   - Khi nào khách thanh toán tiền: Bạn chỉ cần đổi Cột B lại thành **`Used`** -> Máy khách tự động hoạt động bình thường trở lại mà không cần cài lại!

---

### 2. Quản lý Key Dùng Thử 1 Ngày / Nhiều Ngày (`Keys_Trial`):
* **Tự động ngắt khi hết hạn:** Khi đủ 24 giờ kể từ lúc khách kích hoạt, hệ thống tự động khóa. Kể cả khách có "khôn lỏi" rút dây mạng hay ngắt Wi-Fi để hack giờ, bộ đếm thời gian cục bộ (Offline timer) vẫn tự động dập tắt dịch vụ khi chạm mốc 24h!
* **Ngắt cưỡng bức trước hạn:** Tại dòng của khách, đổi Cột B từ `Trial` thành **`Expired`** hoặc **`Locked`** -> Dịch vụ trên máy khách bị ngắt ngay lập tức.
* **Tự động quét khóa hàng loạt:** Bấm menu **👑 VUA TRÒ CHƠI** > **🧹 Quét & Tự Khóa Key Dùng Thử Quá Hạn**.

---

### 3. Cách thu hồi Key để chuyển máy hoặc bán cho người khác:
1. Tại dòng của Key đó, **XÓA TRẮNG** ô **HWID (Cột C)** và ô **ActivatedAt (Cột D)**.
2. Đổi **Status (Cột B)** về lại **`Active`**.
3. Máy cũ của khách bị tước quyền, và Key này trở về trạng thái mới tinh sẵn sàng bán cho người khác!

---

## 👑 MẬT KHẨU QUẢN TRỊ VIÊN (MASTER ADMIN MỚI)

* Khi bạn cài hộ cho khách qua UltraViewer / TeamViewer / AnyDesk / SSH:
* Tại ô nhập Key, bạn chỉ cần gõ: **`VTCH@ADMIN#2026`**
* Mật khẩu được mã hóa tàng hình (Zero-Echo): Khi gõ trên màn hình máy khách **chỉ hiện duy nhất dấu `*`**, tuyệt đối không lộ ký tự thật dù chỉ 0.01 giây!
* Hệ thống trên **cả Windows, Steam Deck, Linux và Mac** đều sẽ kích hoạt thành công ngay lập tức mà không cần tạo Key và không trừ ô trong Google Sheets!
