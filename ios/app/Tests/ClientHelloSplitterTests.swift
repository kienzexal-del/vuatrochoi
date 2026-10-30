import Foundation
import XCTest
@testable import VuaTroChoiDesyncCore

final class ClientHelloSplitterTests: XCTestCase {
    private func word(_ value: Int) -> [UInt8] { [UInt8(value >> 8), UInt8(value & 255)] }

    private func hello(_ host: String) -> Data {
        let name = [UInt8](host.utf8)
        let entry: [UInt8] = [0] + word(name.count) + name
        let sni = word(entry.count) + entry
        let ext: [UInt8] = [0, 0] + word(sni.count) + sni
        var body: [UInt8] = [3, 3]
        body += [UInt8](repeating: 0, count: 32)
        body += [0, 0, 2, 0x13, 1, 1, 0]
        body += word(ext.count)
        body += ext
        let handshake: [UInt8] = [1, UInt8(body.count >> 16)] + word(body.count & 65535) + body
        return Data([22, 3, 1] + word(handshake.count) + handshake)
    }

    func testSplitAtTwoForSteamAndPreserveAllBytes() {
        let input = hello("store.steampowered.com")
        var parser = ClientHelloSplitter()
        let chunks = parser.consume(input)
        XCTAssertEqual(chunks.count, 2)
        XCTAssertEqual(chunks.first?.count, 2)
        XCTAssertEqual(chunks.reduce(Data(), +), input)
        XCTAssertEqual(parser.consume(Data([1, 2, 3])), [Data([1, 2, 3])])
    }

    func testEveryTCPBoundaryIncludingOneByteReads() {
        let input = hello("steamcommunity.com")
        for boundary in 1..<input.count {
            var parser = ClientHelloSplitter()
            let chunks = parser.consume(Data(input.prefix(boundary)))
                + parser.consume(Data(input.dropFirst(boundary)))
            XCTAssertEqual(chunks.count, 2, "boundary \(boundary)")
            XCTAssertEqual(chunks.first?.count, 2)
            XCTAssertEqual(chunks.reduce(Data(), +), input)
        }
        var parser = ClientHelloSplitter()
        var output: [Data] = []
        for byte in input { output += parser.consume(Data([byte])) }
        XCTAssertEqual(output.count, 2)
        XCTAssertEqual(output.reduce(Data(), +), input)
    }

    func testUnrelatedAndLookalikeDomainsPassUnchanged() {
        for host in ["example.com", "evilsteampowered.com", "steampowered.com.example.com"] {
            var parser = ClientHelloSplitter()
            let input = hello(host)
            XCTAssertEqual(parser.consume(input), [input])
        }
        XCTAssertTrue(ClientHelloSplitter.isSteam("STORE.STEAMPOWERED.COM"))
    }

    func testTrailingRecordsArePreserved() {
        let input = hello("store.steampowered.com") + Data([20, 3, 3, 0, 1, 1])
        var parser = ClientHelloSplitter()
        XCTAssertEqual(parser.consume(input).reduce(Data(), +), input)
    }

    func testMalformedAndTruncatedDataNeverChangesBytes() {
        let valid = hello("store.steampowered.com")
        for count in 0..<valid.count {
            var parser = ClientHelloSplitter()
            let input = Data(valid.prefix(count))
            let output = parser.consume(input) + parser.flush()
            XCTAssertEqual(output.reduce(Data(), +), input)
        }
        for index in valid.indices {
            for replacement in [UInt8(0), UInt8(255)] {
                var parser = ClientHelloSplitter()
                var input = valid
                input[index] = replacement
                let output = parser.consume(input) + parser.flush()
                XCTAssertEqual(output.reduce(Data(), +), input)
            }
        }
        var parser = ClientHelloSplitter()
        let http = Data("GET / HTTP/1.1\r\n\r\n".utf8)
        XCTAssertEqual(parser.consume(http), [http])
    }
}
