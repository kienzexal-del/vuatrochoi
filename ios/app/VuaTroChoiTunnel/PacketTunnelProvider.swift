import Foundation
import Darwin
import NetworkExtension
import Tun2SocksKit

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let control = DispatchQueue(label: "com.vuatrochoi.tunnel.control")
    private var generation = UUID()
    private var proxy: LocalSOCKSProxy?
    private var engineRunning = false
    private var stopping = false
    private var stopTimer: DispatchSourceTimer?
    private var pendingStart: ((Error?) -> Void)?
    private var pendingStops: [() -> Void] = []

    private static let hosts = [
        "store.steampowered.com", "steamcommunity.com", "help.steampowered.com",
        "checkout.steampowered.com", "login.steampowered.com"
    ]

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        control.async {
            guard self.pendingStart == nil, !self.engineRunning, !self.stopping, self.proxy == nil else {
                completionHandler(Self.error("Tunnel is already starting, running or stopping."))
                return
            }
            self.generation = UUID()
            let generation = self.generation
            self.pendingStart = completionHandler
            // Resolve before installing routes; DNS remains on the underlying network.
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let addresses = Self.resolveSteamIPv4()
                self?.control.async { [weak self] in
                    guard let self = self, generation == self.generation, !self.stopping else { return }
                    guard !addresses.isEmpty else {
                        self.failStart(Self.error("Cannot resolve Steam IPv4 addresses. Check DNS and retry."))
                        return
                    }
                    self.startProxy(addresses: addresses, generation: generation)
                }
            }
        }
    }

    private func startProxy(addresses: Set<String>, generation: UUID) {
        let proxy = LocalSOCKSProxy(addresses: addresses, queue: control)
        self.proxy = proxy
        proxy.onFailure = { [weak self] error in
            guard let self = self, generation == self.generation else { return }
            self.cancelTunnelWithError(error)
            self.beginStop()
        }
        proxy.start { [weak self] result in
            guard let self = self, generation == self.generation, !self.stopping else { return }
            switch result {
            case .failure(let error): self.failStart(error)
            case .success(let port):
                let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
                let ipv4 = NEIPv4Settings(addresses: ["10.8.0.2"], subnetMasks: ["255.255.255.0"])
                ipv4.includedRoutes = addresses.sorted().map {
                    NEIPv4Route(destinationAddress: $0, subnetMask: "255.255.255.255")
                }
                settings.ipv4Settings = ipv4
                let dns = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
                dns.matchDomains = ["steampowered.com", "steamcommunity.com", "steamstatic.com"]
                dns.matchDomainsNoSearch = true
                settings.dnsSettings = dns
                settings.mtu = 1500
                self.setTunnelNetworkSettings(settings) { [weak self] error in
                    self?.control.async { [weak self] in
                        guard let self = self, generation == self.generation, !self.stopping else { return }
                        if let error = error { self.failStart(error); return }
                        self.runEngine(port: port, generation: generation)
                    }
                }
            }
        }
    }

    private func runEngine(port: UInt16, generation: UUID) {
        let config = """
        tunnel:
          mtu: 1500
          ipv4: 10.8.0.2
        socks5:
          address: 127.0.0.1
          port: \(port)
          pipeline: false
        misc:
          task-stack-size: 40960
          tcp-buffer-size: 16384
          max-session-count: 128
          connect-timeout: 10000
          tcp-read-write-timeout: 120000
          log-level: error
        """
        engineRunning = true
        // Tun2SocksKit owns the utun reader. Do NOT also call packetFlow.readPackets.
        // Its completion means engine EXIT, not readiness. Early exits cancel the VPN.
        Socks5Tunnel.run(withConfig: .string(content: config)) { [weak self] code in
            self?.control.async { [weak self] in
                guard let self = self, generation == self.generation else { return }
                self.engineRunning = false
                if self.stopping { self.finishStop(); return }
                self.proxy?.stop()
                self.proxy = nil
                let error = Self.error("Local TCP/IP engine exited (\(code)).")
                if self.pendingStart != nil { self.finishStart(error) }
                self.cancelTunnelWithError(error)
            }
        }
        finishStart(nil)
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        control.async {
            self.pendingStops.append(completionHandler)
            self.beginStop()
        }
    }

    private func beginStop() {
        guard !stopping else { return }
        stopping = true
        finishStart(Self.error("Tunnel start cancelled."))
        proxy?.stop()
        proxy = nil
        guard engineRunning else { finishStop(); return }
        // Retry quit to cover stop arriving before the native worker initializes.
        let timer = DispatchSource.makeTimerSource(queue: control)
        timer.schedule(deadline: .now(), repeating: .milliseconds(50))
        timer.setEventHandler { Socks5Tunnel.quit() }
        stopTimer = timer
        timer.resume()
        // Native exit completes stop; do not report cleanup while its worker still owns utun.
    }

    private func finishStop() {
        stopTimer?.cancel()
        stopTimer = nil
        generation = UUID()
        stopping = false
        let completions = pendingStops
        pendingStops.removeAll()
        completions.forEach { $0() }
    }

    private func failStart(_ error: Error) {
        proxy?.stop()
        proxy = nil
        finishStart(error)
    }

    private func finishStart(_ error: Error?) {
        let done = pendingStart
        pendingStart = nil
        done?(error)
    }

    private static func resolveSteamIPv4() -> Set<String> {
        var addresses = Set<String>()
        for host in hosts {
            var hints = addrinfo()
            hints.ai_family = AF_INET
            hints.ai_socktype = SOCK_STREAM
            var result: UnsafeMutablePointer<addrinfo>?
            guard getaddrinfo(host, nil, &hints, &result) == 0 else { continue }
            defer { if let result = result { freeaddrinfo(result) } }
            var cursor = result
            while let entry = cursor {
                if let address = entry.pointee.ai_addr {
                    var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    if getnameinfo(address, entry.pointee.ai_addrlen, &buffer,
                                   socklen_t(buffer.count), nil, 0, NI_NUMERICHOST) == 0 {
                        addresses.insert(String(cString: buffer))
                    }
                }
                cursor = entry.pointee.ai_next
            }
        }
        return addresses
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "com.vuatrochoi.ios.tunnel", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
