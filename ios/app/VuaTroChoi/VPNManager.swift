import Foundation
import NetworkExtension

/// Quản lý vòng đời kết nối NetworkExtension (NEPacketTunnelProvider) cho Vua Trò Chơi iOS
class VPNManager: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var statusText: String = "Sẵn sàng"
    @Published var isWorking: Bool = false
    
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
        statusText = "Đang chuẩn bị cấu hình..."
        
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }
            
            let manager = managers?.first ?? NETunnelProviderManager()
            
            let proto = NETunnelProviderProtocol()
            // Bundle ID của Target NetworkExtension do Codex thiết lập
            proto.providerBundleIdentifier = "com.vuatrochoi.ios.tunnel"
            proto.serverAddress = "127.0.0.1" // Chạy 100% cục bộ trên loopback thiết bị
            proto.providerConfiguration = [
                "mode": "desync",
                "split_pos": 2,
                "target": "steam"
            ]
            
            manager.protocolConfiguration = proto
            manager.localizedDescription = "Vua Trò Chơi (Steam Desync)"
            manager.isEnabled = true
            
            manager.saveToPreferences { error in
                DispatchQueue.main.async {
                    if let error = error {
                        self.statusText = "Lỗi lưu quyền: \(error.localizedDescription)"
                        self.isWorking = false
                        return
                    }
                    
                    manager.loadFromPreferences { error in
                        if let error = error {
                            self.statusText = "Lỗi tải cấu hình: \(error.localizedDescription)"
                            self.isWorking = false
                            return
                        }
                        
                        self.tunnelManager = manager
                        do {
                            try manager.connection.startVPNTunnel()
                        } catch {
                            self.statusText = "Không thể khởi chạy: \(error.localizedDescription)"
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
