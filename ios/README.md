# 👑 Vua Trò Chơi - Mở Khóa Steam Cho iOS (iPhone & iPad)

## 📌 Tổng Quan
Tài nguyên mở khóa Steam và tối ưu kết nối game dành cho iOS (iOS 14.0 trở lên):
1. **Hồ sơ cấu hình chuẩn Apple (`.mobileconfig`)**:
   - `VuaTroChoi_Steam.mobileconfig`: Sử dụng Google Encrypted DNS (DoH) qua `https://dns.google/dns-query`.
   - `VuaTroChoi_Cloudflare.mobileconfig`: Sử dụng Cloudflare DoH qua `https://cloudflare-dns.com/dns-query`.
   - **Ưu điểm**: Chạy trực tiếp ở cấp hệ thống của iOS, 0% tốn pin, không cần ứng dụng chạy ngầm, không bao giờ bị thu hồi chứng chỉ (No Revoke), hoạt động ổn định trên cả 4G/5G và mọi mạng Wi-Fi.

2. **Cổng Web Cài Đặt 1-Chạm (`index.html`)**:
   - Trang giao diện tối ưu riêng cho Safari trên iPhone.
   - Tích hợp kiểm tra trực tiếp trạng thái kết nối tới máy chủ Steam.
   - Hướng dẫn trực quan 3 bước cài đặt cho khách hàng.

3. **Ứng Dụng Native SwiftUI & IPA (`app/`)**:
   - Giao diện Dark Gaming hiện đại.
   - Tự động đo độ trễ (ping ms) tới Steam Store và Steam Community.
   - Nút gọi mở hồ sơ cấu hình và nút mở thẳng Cài đặt iPhone (`UIApplication.openSettingsURLString`).
   - Tự động build ra file `.ipa` thông qua GitHub Actions CI (`.github/workflows/build-ios.yml`).
