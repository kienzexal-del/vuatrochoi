import SwiftUI

struct ContentView: View {
    @StateObject private var vpn = VPNManager()
    @StateObject private var network = NetworkChecker()
    @State private var showingInfo = false
    
    // GitHub raw link to the legacy mobileconfig profile as fallback
    let profileURL = URL(string: "https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/ios/VuaTroChoi_AdBlock.mobileconfig")!
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
                            Text("VUA TRÒ CHƠI MOBILE")
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
                        
                        Text("DPI Packet Desync Nội Bộ • Giữ IP Việt Nam\nKhông tốn pin • Hoạt động cả Wi-Fi & 4G/5G")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.gray)
                    }
                    .padding(.top, 10)
                    
                    // Big 1-Tap Toggle Card
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(
                                    vpn.isConnected
                                    ? RadialGradient(colors: [Color.green.opacity(0.25), Color.clear], center: .center, startRadius: 10, endRadius: 80)
                                    : RadialGradient(colors: [Color.orange.opacity(0.15), Color.clear], center: .center, startRadius: 10, endRadius: 80)
                                )
                                .frame(width: 150, height: 150)
                            
                            Button(action: {
                                vpn.toggleVPN()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                                    network.checkAll()
                                }
                            }) {
                                VStack(spacing: 8) {
                                    Image(systemName: vpn.isConnected ? "shield.checkered" : "power")
                                        .font(.system(size: 44, weight: .bold))
                                        .foregroundColor(vpn.isConnected ? .green : .white)
                                    
                                    Text(vpn.isConnected ? "ĐANG BẢO VỆ" : "KÍCH HOẠT")
                                        .font(.caption)
                                        .fontWeight(.heavy)
                                        .foregroundColor(vpn.isConnected ? .green : .white.opacity(0.9))
                                }
                                .frame(width: 120, height: 120)
                                .background(
                                    LinearGradient(
                                        colors: vpn.isConnected
                                        ? [Color(red: 0.1, green: 0.3, blue: 0.15), Color(red: 0.05, green: 0.2, blue: 0.1)]
                                        : [Color(red: 0.96, green: 0.62, blue: 0.04), Color(red: 0.85, green: 0.47, blue: 0.02)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .clipShape(Circle())
                                .shadow(
                                    color: vpn.isConnected ? Color.green.opacity(0.4) : Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.4),
                                    radius: 12,
                                    y: 4
                                )
                            }
                            .disabled(vpn.isWorking)
                        }
                        
                        Text(vpn.statusText)
                            .font(.footnote)
                            .fontWeight(.semibold)
                            .foregroundColor(vpn.isConnected ? .green : .gray)
                    }
                    .padding(.vertical, 10)
                    
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
                        
                        statusRow(name: "Steam Store (Cửa Hàng)", status: network.storeStatus)
                        statusRow(name: "Steam Community (Cộng Đồng)", status: network.communityStatus)
                    }
                    .padding(18)
                    .background(Color(red: 0.1, green: 0.13, blue: 0.21))
                    .cornerRadius(18)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.2), lineWidth: 1)
                    )
                    
                    // Quick Action Buttons
                    VStack(spacing: 12) {
                        Button(action: openSteamApp) {
                            HStack {
                                Image(systemName: "arrow.up.right.square.fill")
                                Text("MỞ STEAM APP NGAY")
                                    .fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color(red: 0.15, green: 0.2, blue: 0.3))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                        }
                        
                        Button(action: openSettings) {
                            HStack {
                                Image(systemName: "gearshape.fill")
                                Text("Cài Đặt Hệ Thống iOS")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.08))
                            .foregroundColor(.white)
                            .cornerRadius(14)
                        }
                    }
                    
                    // Security / Privacy Note
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.shield.fill")
                                .foregroundColor(.green)
                            Text("BẢO MẬT & TỐI ƯU TUYỆT ĐỐI")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                        }
                        
                        Text("• Không chuyển tiếp qua bất kỳ máy chủ ngoại quốc nào (IP giữ nguyên 100%).\n• Tự động chia nhỏ gói tin ClientHello (Split-pos: 2) để vượt DPI nhà mạng.\n• App ngân hàng, Zalo, Momo chạy bình thường không bị gián đoạn.")
                            .font(.caption2)
                            .foregroundColor(.gray)
                            .lineSpacing(3)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.3))
                    .cornerRadius(12)
                    
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            .background(Color(red: 0.05, green: 0.07, blue: 0.12).ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }
    
    // Status Row Component
    private func statusRow(name: String, status: SteamStatus) -> some View {
        HStack {
            Text(name)
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.9))
            Spacer()
            switch status {
            case .checking:
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .orange))
                    .scaleEffect(0.8)
            case .online(let latency):
                HStack(spacing: 5) {
                    Circle().fill(Color.green).frame(width: 8, height: 8)
                    Text("\(latency) ms")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                }
            case .blocked:
                HStack(spacing: 5) {
                    Circle().fill(Color.red).frame(width: 8, height: 8)
                    Text("Bị Chặn")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.red)
                }
            }
        }
    }
    
    // Actions
    private func openSteamApp() {
        if let steamURL = URL(string: "steam://"), UIApplication.shared.canOpenURL(steamURL) {
            UIApplication.shared.open(steamURL)
        } else if let storeURL = URL(string: "https://store.steampowered.com") {
            UIApplication.shared.open(storeURL)
        }
    }
    
    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
