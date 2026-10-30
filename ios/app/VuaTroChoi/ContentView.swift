import SwiftUI

struct ContentView: View {
    @StateObject private var vpn = VPNManager()
    @StateObject private var network = NetworkChecker()
    
    var body: some View {
        ZStack {
            // Background toan man hinh (Dark Luxury OLED)
            Color(red: 0.04, green: 0.05, blue: 0.09)
                .ignoresSafeArea()
            
            // Background Ambient Glow
            VStack {
                Circle()
                    .fill(vpn.isConnected ? Color.green.opacity(0.15) : Color.orange.opacity(0.08))
                    .frame(width: 340, height: 340)
                    .blur(radius: 70)
                    .offset(y: -40)
                Spacer()
            }
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    
                    // 1. Header Badge & Tieu De
                    VStack(spacing: 6) {
                        HStack(spacing: 6) {
                            Text("👑")
                                .font(.system(size: 13))
                            Text("VUA TRÒ CHƠI MOBILE")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(Color(red: 0.96, green: 0.65, blue: 0.12))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 5)
                        .background(Color(red: 0.96, green: 0.65, blue: 0.12).opacity(0.12))
                        .cornerRadius(20)
                        
                        Text("Mở Khóa Steam iOS")
                            .font(.system(size: 26, weight: .heavy))
                            .foregroundColor(.white)
                        
                        Text("DPI Packet Desync Nội Bộ • Giữ 100% IP VN\nKhông tốn pin • Hoạt động cả Wi-Fi & 4G/5G")
                            .font(.system(size: 12))
                            .multilineTextAlignment(.center)
                            .foregroundColor(.gray)
                            .lineSpacing(2)
                    }
                    .padding(.top, 10)
                    
                    // 2. Nut Tron Kich Hoat (Power Toggle)
                    VStack(spacing: 12) {
                        ZStack {
                            // Vong phat sang ben ngoai
                            Circle()
                                .stroke(
                                    vpn.isConnected
                                    ? Color.green.opacity(0.35)
                                    : Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.25),
                                    lineWidth: 3
                                )
                                .frame(width: 140, height: 140)
                            
                            Button(action: {
                                vpn.toggleVPN()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                                    network.checkAll()
                                }
                            }) {
                                VStack(spacing: 6) {
                                    Image(systemName: vpn.isConnected ? "shield.checkered" : "power")
                                        .font(.system(size: 38, weight: .bold))
                                        .foregroundColor(vpn.isConnected ? .green : .white)
                                    
                                    Text(vpn.isConnected ? "ĐANG BẢO VỆ" : "KÍCH HOẠT")
                                        .font(.system(size: 12, weight: .heavy))
                                        .foregroundColor(vpn.isConnected ? .green : .white.opacity(0.9))
                                }
                                .frame(width: 118, height: 118)
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
                                    color: vpn.isConnected ? Color.green.opacity(0.5) : Color(red: 0.96, green: 0.62, blue: 0.04).opacity(0.4),
                                    radius: 10,
                                    y: 4
                                )
                            }
                            .disabled(vpn.isWorking)
                        }
                        
                        // Trang thai text
                        HStack(spacing: 6) {
                            if vpn.isWorking {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .orange))
                                    .scaleEffect(0.7)
                            }
                            Text(vpn.statusText)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(vpn.isConnected ? .green : (vpn.isWorking ? .orange : .gray))
                        }
                    }
                    .padding(.vertical, 6)
                    
                    // 3. Card Do Ping & Trang Thai Mang
                    VStack(spacing: 12) {
                        HStack {
                            Text("Trạng Thái Kết Nối")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)
                            Spacer()
                            Button(action: { network.checkAll() }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "arrow.clockwise")
                                    Text("Đo lại")
                                        .font(.system(size: 11, weight: .semibold))
                                }
                                .foregroundColor(Color(red: 0.22, green: 0.74, blue: 0.97))
                            }
                        }
                        
                        Divider().background(Color.white.opacity(0.08))
                        
                        statusRow(name: "Steam Store (Cửa Hàng)", status: network.storeStatus)
                        statusRow(name: "Steam Community (Cộng Đồng)", status: network.communityStatus)
                    }
                    .padding(14)
                    .background(Color(red: 0.08, green: 0.11, blue: 0.18))
                    .cornerRadius(14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    )
                    
                    // 4. Nut Mo Steam Chinh Chu
                    Button(action: openSteamApp) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.up.right.square.fill")
                                .font(.system(size: 16))
                            Text("MỞ STEAM APP NGAY")
                                .font(.system(size: 15, weight: .bold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.18, green: 0.28, blue: 0.45), Color(red: 0.12, green: 0.18, blue: 0.32)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(red: 0.22, green: 0.74, blue: 0.97).opacity(0.3), lineWidth: 1)
                        )
                    }
                    
                    // 5. Ghi Chu Bao Mat
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.shield.fill")
                                .foregroundColor(.green)
                                .font(.system(size: 12))
                            Text("BẢO MẬT & TỐI ƯU TUYỆT ĐỐI")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.white)
                        }
                        
                        Text("• Không chuyển tiếp server ngoại (IP giữ nguyên 100% tại VN).\n• Phân mảnh TLS ClientHello nội bộ để vượt chặn nhà mạng.\n• App ngân hàng, Zalo, Momo chạy bình thường không gián đoạn.")
                            .font(.system(size: 11))
                            .foregroundColor(.gray)
                            .lineSpacing(2)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.03))
                    .cornerRadius(10)
                    
                }
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 40)
            }
        }
        .alert(isPresented: $vpn.showAlert) {
            Alert(
                title: Text("Thông Báo"),
                message: Text(vpn.alertMessage),
                dismissButton: .default(Text("Đã Hiểu"))
            )
        }
    }
    
    // Status Row Component
    private func statusRow(name: String, status: SteamStatus) -> some View {
        HStack {
            Text(name)
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.85))
            Spacer()
            switch status {
            case .checking:
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .orange))
                    .scaleEffect(0.7)
            case .online(let latency):
                HStack(spacing: 4) {
                    Circle().fill(Color.green).frame(width: 7, height: 7)
                    Text("\(latency) ms")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.green)
                }
            case .blocked:
                HStack(spacing: 4) {
                    Circle().fill(Color.red).frame(width: 7, height: 7)
                    Text("Bị Chặn")
                        .font(.system(size: 13, weight: .bold))
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
}
