# Local TCP desync experiment — not device-validated

The extension is `com.vuatrochoi.ios.tunnel`, iOS 14+. The host must use
`NETunnelProviderManager` / `NETunnelProviderProtocol` with that provider bundle ID.
No remote VPN/SOCKS service is configured. Outbound TCP connections go directly
from the provider to destination IPv4 addresses; there is no overseas egress hop.
Actual public IP depends on the device's current ISP/VPN configuration.

## Data path

`utun -> Tun2SocksKit/lwIP -> loopback SOCKS5 -> Network.framework TCP -> Steam`

Tun2SocksKit **5.16.0** is pinned in XcodeGen. It supplies TCP sequence numbers,
ACKs, retransmission, checksums and IP reassembly; raw IP packets must never be
written to an ordinary TCP socket. The library owns the utun reader, so a second
`packetFlow.readPackets` loop would steal its packets. The proxy listens only on
127.0.0.1 with an ephemeral port, accepts only allowlisted destination addresses
and TCP ports 80/443, and limits sessions to 128. It applies backpressure and
preserves TCP half-closes. Stop cancels sockets, clears parser buffers and waits
for the native engine to exit before completing. A repeated native quit covers
the start/stop initialization race; if native code hangs, iOS must terminate the
extension (there is no safe Swift API for killing its thread).

The TUN address is 10.8.0.2/24, MTU 1500, with DNS 1.1.1.1 and 8.8.8.8 scoped to
Steam domains. The five hosts in `PacketTunnelProvider.hosts` are resolved before
installing /32 routes. There is deliberately no default route: this TCP-only
prototype cannot carry arbitrary device traffic. Restart after DNS/CDN changes.

On TCP/443 the first complete TLS record is inspected for a Steam SNI. Matching
ClientHello bytes are written as a 2-byte prefix, then the remainder after 20 ms,
with TCP_NODELAY requested. TLS encryption/authentication stays end to end.
Malformed, unrelated and multi-record ClientHello traffic passes unchanged.
TCP reads may split a record at any byte; buffering handles those boundaries.

## Limits requiring device acceptance

- Separate socket writes are **not a guarantee of separate wire TCP segments**.
  Capture on the Wi-Fi router/macOS RVI and verify the 2-byte first segment.
  Do not claim this reproduces zapret fake-packet, TTL or overlap techniques.
- IPv6 bypasses this IPv4 tunnel. QUIC/UDP is unsupported and requests to routed
  IPv4 addresses are rejected by the SOCKS proxy; browser TCP fallback must be
  checked. Steam game traffic, ICMP ping and every CDN are outside this scope.
- The /32 addresses are a DNS snapshot, not an authoritative list of Steam IP
  ranges. Shared CDN IPs can route other hosts; their TLS bytes pass unchanged.
  A browser using another resolver may select addresses outside the snapshot.
- Tun2SocksKit discovers the utun FD using system-control socket inspection.
  Its binary compatibility and that discovery must be verified on iOS 14 and
  current iOS. The Swift wrapper's callback signals engine exit, not readiness;
  an early native exit cancels the VPN. Successful VPN startup is not evidence
  that Steam is reachable.
- Apple describes local proxy/listener uses of packet tunnel providers as
  unsupported in TN3120. This design is an experiment, not a promise of App Store
  approval: https://developer.apple.com/documentation/technotes/tn3120-expected-use-cases-for-network-extension-packet-tunnel-providers
- Both host and extension need signing profiles authorizing the Network
  Extension entitlement. An unsigned archive/IPA alone does not grant it.

## Reproducible checks (macOS)

From `ios/app`:

```sh
swift test
xcodegen generate
xcodebuild -resolvePackageDependencies -project VuaTroChoi.xcodeproj -scheme VuaTroChoi
xcodebuild -project VuaTroChoi.xcodeproj -scheme VuaTroChoi \
  -configuration Debug -destination 'generic/platform=iOS' build CODE_SIGNING_ALLOWED=NO
```

Then sign/install with the required capabilities. Test Steam HTTPS on each
target ISP, verify egress IP, capture segmentation, try start/stop immediately
and repeatedly, change Wi-Fi/cellular, test IPv6/QUIC and force a failed DNS
lookup. Check connectivity returns after stop and measure extension memory.
These build/device checks were not run on the Windows implementation machine.

Upstream references and licenses:

- https://github.com/EbrahimTahernejad/Tun2SocksKit/tree/5.16.0 (MIT)
- https://github.com/heiher/hev-socks5-tunnel/tree/2.16.0 (MIT)
- Keep upstream copyright/license notices for the wrapper, engine and its
  transitive binary components in the distributed app. Packaging must collect
  those notices from the resolved dependencies before release.
