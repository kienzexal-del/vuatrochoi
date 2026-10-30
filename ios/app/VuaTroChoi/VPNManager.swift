import Foundation
import NetworkExtension

/// Quản lý vòng đời kết nối NetworkExtension (NEPacketTunnelProvider) cho Vua Trò Chơi iOS
class VPNManager: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var statusText: String = "Sẵn sàng"
    @Published var isWorking: Bool = false
    @Published var showAlert: Bool = false
    @Published var alertMessage: String = ""
    
    private var tunnelManager: NETunnelProviderManager?
    
    init() {
        refreshStatus()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    func refreshStatus() {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let manager = managers?.first {
                    self.tunnelManager = manager
                    self.updateStatus(from: manager.connection.status)
                } else {
                    self.tunnelManager = nil
                    self.isConnected = false
                    self.statusText = "Chưa kết nối"
                }
            }
        }
    }
    
    @objc private func vpnStatusDidChange(notification: Notification) {
        guard let connection = notification.object as? NEVPNConnection else { return }
        DispatchQueue.main.async {
            self.updateStatus(from: connection.status)
        }
    }
    
    private func updateStatus(from status: NEVPNStatus) {
        switch status {
        case .connected:
            self.isConnected = true
            self.statusText = "Đang bảo vệ (Đã kích hoạt)"
            self.isWorking = false
        case .connecting:
            self.isConnected = false
            self.statusText = "Đang kết nối..."
            self.isWorking = true
        case .disconnecting:
            self.isConnected = false
            self.statusText = "Đang ngắt kết nối..."
            self.isWorking = true
        case .disconnected, .invalid:
            self.isConnected = false
            self.statusText = "Chưa kích hoạt"
            self.isWorking = false
        case .reasserting:
            self.isConnected = true
            self.statusText = "Đang phục hồi kênh kết nối..."
            self.isWorking = true
        @unknown default:
            self.isConnected = false
            self.statusText = "Không xác định"
            self.isWorking = false
        }
    }
    
    func toggleVPN() {
        if isConnected {
            stopVPN()
        } else {
            startVPN()
        }
    }
    
    func startVPN() {
        isWorking = true
        statusText = "Đang cấu hình..."
        
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }
            
            if let error = error {
                DispatchQueue.main.async {
                    self.statusText = "Lỗi: \(error.localizedDescription)"
                    self.alertMessage = "Không thể đọc cấu hình VPN từ hệ thống: \(error.localizedDescription)"
                    self.showAlert = true
                    self.isWorking = false
                }
                return
            }
            
            let manager = managers?.first ?? NETunnelProviderManager()
            
            let proto = NETunnelProviderProtocol()
            // Tự động nhận diện Bundle ID của extension dựa theo app chính (tránh lỗi khi iloader đổi bundleId)
            let mainID = Bundle.main.bundleIdentifier ?? "com.vuatrochoi.ios"
            proto.providerBundleIdentifier = "\(mainID).tunnel"
            proto.serverAddress = "127.0.0.1" // Chạy 100% cục bộ trên loopback thiết bị
            proto.providerConfiguration = [
                "mode": "desync",
                "split_pos": 2,
                "target": "steam"
            ]
            
            manager.protocolConfiguration = proto
            manager.localizedDescription = "Vua Trò Chơi (Steam Desync)"
            manager.isEnabled = true
            
            manager.saveToPreferences { [weak self] saveError in
                guard let self = self else { return }
                DispatchQueue.main.async {
                    if let saveError = saveError {
                        self.statusText = "Lỗi lưu quyền"
                        self.alertMessage = "Apple từ chối lưu VPN: \(saveError.localizedDescription).\n\nLý do: Chứng chỉ Apple ID miễn phí không được Apple cấp quyền Packet Tunnel Provider. Cần dùng tài khoản Developer trả phí hoặc TrollStore."
                        self.showAlert = true
                        self.isWorking = false
                        return
                    }
                    
                    manager.loadFromPreferences { [weak self] loadError in
                        guard let self = self else { return }
                        if let loadError = loadError {
                            self.statusText = "Lỗi nạp cấu hình"
                            self.alertMessage = "Lỗi tải VPN: \(loadError.localizedDescription)"
                            self.showAlert = true
                            self.isWorking = false
                            return
                        }
                        
                        self.tunnelManager = manager
                        do {
                            try manager.connection.startVPNTunnel()
                            self.statusText = "Đang kết nối..."
                        } catch {
                            self.statusText = "Lỗi khởi chạy"
                            self.alertMessage = "Không thể bật VPN: \(error.localizedDescription)"
                            self.showAlert = true
                            self.isWorking = false
                        }
                    }
                }
            }
        }
    }
    
    func stopVPN() {
        isWorking = true
        statusText = "Đang ngắt..."
        tunnelManager?.connection.stopVPNTunnel()
    }
}
