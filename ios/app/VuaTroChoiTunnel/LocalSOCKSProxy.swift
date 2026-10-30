import Foundation
import Network

/// Only the in-process TUN engine uses this loopback listener.
final class LocalSOCKSProxy {
    let queue: DispatchQueue
    private let allowedAddresses: Set<String>
    private var listener: NWListener?
    private var sessions: [UUID: SOCKSSession] = [:]
    private var starting: ((Result<UInt16, Error>) -> Void)?
    var onFailure: ((Error) -> Void)?

    init(addresses: Set<String>, queue: DispatchQueue) {
        allowedAddresses = addresses
        self.queue = queue
    }

    func start(_ completion: @escaping (Result<UInt16, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            starting = completion
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self = self else { return }
                switch state {
                case .ready:
                    guard let port = listener?.port?.rawValue else { return }
                    let done = self.starting
                    self.starting = nil
                    done?(.success(port))
                case .failed(let error):
                    let done = self.starting
                    self.starting = nil
                    if let done = done { done(.failure(error)) }
                    else { self.onFailure?(error) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] client in
                guard let self = self, self.sessions.count < 128 else { client.cancel(); return }
                let id = UUID()
                let session = SOCKSSession(client: client, addresses: self.allowedAddresses, queue: self.queue)
                session.onClose = { [weak self] in self?.sessions.removeValue(forKey: id) }
                self.sessions[id] = session
                session.start()
            }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }

    func stop() {
        starting = nil
        listener?.stateUpdateHandler = nil
        listener?.newConnectionHandler = nil
        listener?.cancel()
        listener = nil
        let active = Array(sessions.values)
        sessions.removeAll()
        active.forEach { $0.close() }
    }
}

private final class SOCKSSession {
    private let client: NWConnection
    private let addresses: Set<String>
    private let queue: DispatchQueue
    private var remote: NWConnection?
    private var timer: DispatchSourceTimer?
    private var deadline = Date().addingTimeInterval(10)
    private var splitter: ClientHelloSplitter?
    private var closed = false
    private var uploadEnded = false
    private var downloadEnded = false
    var onClose: (() -> Void)?

    init(client: NWConnection, addresses: Set<String>, queue: DispatchQueue) {
        self.client = client
        self.addresses = addresses
        self.queue = queue
    }

    func start() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in
            guard let self = self, Date() >= self.deadline else { return }
            self.close()
        }
        self.timer = timer
        timer.resume()
        client.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.close()
            default: break
            }
        }
        client.start(queue: queue)
        read(2) { [weak self] header in
            guard let self = self, header[0] == 5, header[1] > 0 else { self?.close(); return }
            self.read(Int(header[1])) { [weak self] methods in
                guard let self = self else { return }
                guard methods.contains(0) else {
                    self.send(Data([5, 255]), to: self.client) { self.close() }
                    return
                }
                self.send(Data([5, 0]), to: self.client) { self.request() }
            }
        }
    }

    private func request() {
        read(4) { [weak self] header in
            guard let self = self else { return }
            guard header[0] == 5, header[1] == 1, header[2] == 0 else { self.reject(7); return }
            // TUN engine supplies numeric IPv4; do not expose a general domain/UDP proxy.
            guard header[3] == 1 else { self.reject(8); return }
            self.read(6) { [weak self] target in
                guard let self = self else { return }
                let address = target.prefix(4).map(String.init).joined(separator: ".")
                let port = UInt16(target[4]) * 256 + UInt16(target[5])
                guard self.addresses.contains(address), port == 80 || port == 443 else {
                    self.reject(2)
                    return
                }
                self.connect(address: address, port: port)
            }
        }
    }

    private func connect(address: String, port: UInt16) {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        let parameters = NWParameters(tls: nil, tcp: tcp)
        // Ordinary provider-created outbound connections use the underlying network.
        // Never use createTCPConnectionThroughTunnel here: that would feed traffic back into TUN.
        let connection = NWConnection(host: NWEndpoint.Host(address),
                                      port: NWEndpoint.Port(rawValue: port)!, using: parameters)
        remote = connection
        if port == 443 { splitter = ClientHelloSplitter() }
        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self, !self.closed else { return }
            switch state {
            case .ready:
                connection.stateUpdateHandler = { [weak self] state in
                    if case .failed = state { self?.close() }
                }
                self.deadline = Date().addingTimeInterval(120)
                self.send(Data([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]), to: self.client) {
                    self.upload()
                    self.download()
                }
            case .failed: self.reject(5)
            default: break
            }
        }
        connection.start(queue: queue)
    }

    private func upload() {
        guard !closed, let remote = remote else { return }
        client.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, eof, error in
            guard let self = self, !self.closed else { return }
            guard error == nil else { self.close(); return }
            var chunks: [Data] = []
            if let data = data, !data.isEmpty {
                if self.splitter != nil { chunks = self.splitter!.consume(data) }
                else { chunks = [data] }
            }
            if eof, self.splitter != nil { chunks += self.splitter!.flush() }
            if self.splitter?.finished == true { self.splitter = nil }
            self.sendChunks(chunks, to: remote, index: 0) {
                if eof {
                    remote.send(content: nil, contentContext: .finalMessage, isComplete: true,
                                completion: .contentProcessed { [weak self] error in
                        guard let self = self else { return }
                        if error != nil { self.close(); return }
                        self.uploadEnded = true
                        self.finishIfEnded()
                    })
                } else { self.upload() }
            }
        }
    }

    private func download() {
        guard !closed, let remote = remote else { return }
        remote.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, eof, error in
            guard let self = self, !self.closed else { return }
            guard error == nil else { self.close(); return }
            self.send(data ?? Data(), to: self.client) {
                if eof {
                    self.client.send(content: nil, contentContext: .finalMessage, isComplete: true,
                                     completion: .contentProcessed { [weak self] error in
                        guard let self = self else { return }
                        if error != nil { self.close(); return }
                        self.downloadEnded = true
                        self.finishIfEnded()
                    })
                } else { self.download() }
            }
        }
    }

    private func sendChunks(_ chunks: [Data], to connection: NWConnection, index: Int,
                            completion: @escaping () -> Void) {
        guard !closed else { return }
        guard index < chunks.count else { completion(); return }
        send(chunks[index], to: connection) {
            if chunks.count == 2, index == 0 {
                // Best effort: noDelay + separate writes + a gap; wire segmentation needs device capture.
                self.queue.asyncAfter(deadline: .now() + .milliseconds(20)) { [weak self] in
                    self?.sendChunks(chunks, to: connection, index: index + 1, completion: completion)
                }
            } else { self.sendChunks(chunks, to: connection, index: index + 1, completion: completion) }
        }
    }

    private func send(_ data: Data, to connection: NWConnection, completion: @escaping () -> Void) {
        guard !closed else { return }
        if data.isEmpty { completion(); return }
        deadline = Date().addingTimeInterval(120)
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            guard let self = self, !self.closed else { return }
            if error != nil { self.close() } else { completion() }
        })
    }

    private func read(_ count: Int, completion: @escaping ([UInt8]) -> Void) {
        guard !closed else { return }
        client.receive(minimumIncompleteLength: count, maximumLength: count) { [weak self] data, _, _, error in
            guard let self = self, !self.closed else { return }
            guard error == nil, let data = data, data.count == count else { self.close(); return }
            completion([UInt8](data))
        }
    }

    private func reject(_ code: UInt8) {
        send(Data([5, code, 0, 1, 0, 0, 0, 0, 0, 0]), to: client) { self.close() }
    }

    private func finishIfEnded() {
        if uploadEnded && downloadEnded { close() }
    }

    func close() {
        guard !closed else { return }
        closed = true
        timer?.cancel()
        timer = nil
        client.stateUpdateHandler = nil
        remote?.stateUpdateHandler = nil
        client.cancel()
        remote?.cancel()
        remote = nil
        splitter = nil
        let done = onClose
        onClose = nil
        done?()
    }
}
