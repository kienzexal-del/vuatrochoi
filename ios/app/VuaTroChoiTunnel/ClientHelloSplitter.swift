import Foundation

/// Buffers only the first TLS record, never decrypts or changes TLS bytes.
struct ClientHelloSplitter {
    static let steamDomains = ["steampowered.com", "steamcommunity.com", "steamstatic.com"]
    private var buffer = Data()
    private(set) var finished = false

    mutating func consume(_ data: Data) -> [Data] {
        guard !finished else { return data.isEmpty ? [] : [data] }
        buffer.append(data)
        let bytes = [UInt8](buffer)
        if bytes.count < 5 { return [] }
        guard bytes[0] == 22, bytes[1] == 3, bytes[2] <= 4 else { return flush() }
        let length = Int(bytes[3]) * 256 + Int(bytes[4])
        guard length >= 4, length <= 18_432 else { return flush() }
        guard bytes.count >= length + 5 else { return [] }
        let split = Self.serverName(in: Array(bytes.prefix(length + 5))).map(Self.isSteam) ?? false
        let complete = flush()[0]
        return split ? [Data(complete.prefix(2)), Data(complete.dropFirst(2))] : [complete]
    }

    mutating func flush() -> [Data] {
        finished = true
        let data = buffer
        buffer.removeAll(keepingCapacity: false)
        return data.isEmpty ? [] : [data]
    }

    static func isSteam(_ hostname: String) -> Bool {
        let hostname = hostname.lowercased()
        return steamDomains.contains { hostname == $0 || hostname.hasSuffix("." + $0) }
    }

    private static func serverName(in b: [UInt8]) -> String? {
        guard b.count >= 44, b[5] == 1 else { return nil }
        let handshakeLength = Int(b[6]) * 65_536 + Int(b[7]) * 256 + Int(b[8])
        // shortcut: multi-record ClientHello passes unchanged; add record reassembly if captures require it.
        guard handshakeLength + 9 <= b.count else { return nil }
        let end = handshakeLength + 9
        var p = 43
        func word(_ i: Int) -> Int { Int(b[i]) * 256 + Int(b[i + 1]) }
        p += 1 + Int(b[p]) // session ID
        guard p + 2 <= end else { return nil }
        p += 2 + word(p) // cipher suites
        guard p < end else { return nil }
        p += 1 + Int(b[p]) // compression methods
        guard p + 2 <= end else { return nil }
        let extensionsEnd = p + 2 + word(p)
        p += 2
        guard extensionsEnd == end else { return nil }
        while p + 4 <= extensionsEnd {
            let kind = word(p)
            let extensionEnd = p + 4 + word(p + 2)
            p += 4
            guard extensionEnd <= extensionsEnd else { return nil }
            if kind == 0 {
                guard p + 2 <= extensionEnd, p + 2 + word(p) == extensionEnd else { return nil }
                p += 2
                while p + 3 <= extensionEnd {
                    let nameType = b[p]
                    let size = word(p + 1)
                    p += 3
                    guard size > 0, p + size <= extensionEnd else { return nil }
                    if nameType == 0 { return String(bytes: b[p..<(p + size)], encoding: .utf8) }
                    p += size
                }
                return nil
            }
            p = extensionEnd
        }
        return nil
    }
}
