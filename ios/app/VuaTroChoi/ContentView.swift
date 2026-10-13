import SwiftUI

struct ContentView: View {
    @StateObject private var network = NetworkChecker()
    @State private var showingInfo = false
    
    // GitHub raw link to the mobileconfig profile
    let profileURL = URL(string: "https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/ios/VuaTroChoi_Steam.mobileconfig")!
    let webPortalURL = URL(string: "https://kienzexal-del.github.io/vuatrochoi/ios/")!

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    
                    // Crown & Title Header
                    VStack(spacing: 8) {
                        HStack(spacing: 6) {
                            Text("👑")
                                .font(.title3)
                            Text("VUA TRÒ CHƠI ECOSYSTEM")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.15))
                        .cornerRadius(20)
                        
                        Text("Mở Khóa Steam iOS")
                            .font(.system(size: 28, weight: .heavy))
                            .foregroundColor(.white)
                        
                        Text("Giải pháp Encrypted DNS chuẩn Apple\nKhông hao pin • Không thu hồi chứng chỉ")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.gray)
                    }
                    .padding(.top, 10)
                    
                    // Live Status Card
                    VStack(spacing: 14) {
                        HStack {
                            Text("Trạng Thái Kết Nối")
                                .font(.headline)
                                .foregroundColor(.white)
                            Spacer()
                            Button(action: { network.checkAll() }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "arrow.clockwise")
                                    Text("Đo lại")
                                }
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(Color(red: 0.22, green: 0.74, blue: 0.97))
                            }
                        }
                        
                        Divider().background(Color.gray.opacity(0.3))
                        
                        statusRow(name: "Steam Store", status: network.storeStatus)
                        statusRow(name: "Steam Community", status: network.communityStatus)
                    }
                    .padding(18)
                    .background(Color(red: 0.1, green: 0.13, blue: 0.21))
                    .cornerRadius(18)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.2), lineWidth: 1)
                    )
                    
                    // Action Buttons
                    VStack(spacing: 12) {
                        Button(action: installProfile) {
                            HStack {
                                Image(systemName: "arrow.down.doc.fill")
                                Text("CÀI ĐẶT CẤU HÌNH (1 CHẠM)")
                                    .fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(
                                LinearGradient(
                                    colors: [Color(red: 0.96, green: 0.62, blue: 0.04), Color(red: 0.85, green: 0.47, blue: 0.02)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .foregroundColor(.black)
                            .cornerRadius(14)
                            .shadow(color: Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.4), radius: 10, y: 5)
                        }
                        
                        Button(action: openSettings) {
                            HStack {
                                Image(systemName: "gearshape.fill")
                                Text("Mở Cài Đặt iPhone")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.white.opacity(0.08))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                        }
                    }
                    
                    // 3 Steps Card
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("📱")
                            Text("3 Bước Kích Hoạt Nhanh")
                                .font(.headline)
                                .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                        }
                        
                        stepItem(number: "1", title: "Bấm 'Cài Đặt Cấu Hình'", desc: "Safari sẽ mở lên xác nhận: Nhấn 'Cho phép' để tải hồ sơ.")
                        stepItem(number: "2", title: "Mở Cài Đặt iPhone", desc: "Bấm nút 'Mở Cài Đặt iPhone' ở trên, hoặc vào Settings máy.")
                        stepItem(number: "3", title: "Chọn 'Đã tải về hồ sơ' ➔ Cài đặt", desc: "Nằm ở ngay dòng đầu Settings. Bấm Cài đặt và nhập mật mã máy để hoàn tất.")
                    }
                    .padding(18)
                    .background(Color(red: 0.1, green: 0.13, blue: 0.21))
                    .cornerRadius(18)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
                    
                    // Footer
                    Text("Phiên bản 1.0.0 • Tương thích iOS 14 - 18\nVua Trò Chơi Ecosystem")
                        .font(.caption2)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.gray)
                        .padding(.top, 10)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            .background(Color(red: 0.04, green: 0.06, blue: 0.1).ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
    
    // Helper View for status row
    @ViewBuilder
    private func statusRow(name: String, status: SteamStatus) -> some View {
        HStack {
            Text(name)
                .font(.subheadline)
                .foregroundColor(.white)
            Spacer()
            switch status {
            case .checking:
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Đang đo...")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            case .online(let latency):
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                    Text("Mở khóa (\(latency)ms)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.green)
                }
            case .blocked:
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 8, height: 8)
                    Text("Bị chặn")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.red)
                }
            }
        }
    }
    
    // Helper View for step item
    @ViewBuilder
    private func stepItem(number: String, title: String, desc: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(.caption)
                .fontWeight(.heavy)
                .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                .frame(width: 24, height: 24)
                .background(Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.18))
                .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Text(desc)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
    }
    
    private func installProfile() {
        if UIApplication.shared.canOpenURL(profileURL) {
            UIApplication.shared.open(profileURL, options: [:], completionHandler: nil)
        }
    }
    
    private func openSettings() {
        if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(settingsUrl, options: [:], completionHandler: nil)
        }
    }
}
