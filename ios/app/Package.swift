// swift-tools-version: 5.7
import PackageDescription

// Pure parser tests can run without an iOS SDK or the binary tunnel dependency.
let package = Package(
    name: "VuaTroChoiDesyncCore",
    products: [.library(name: "VuaTroChoiDesyncCore", targets: ["VuaTroChoiDesyncCore"])],
    targets: [
        .target(name: "VuaTroChoiDesyncCore", path: "VuaTroChoiTunnel",
                exclude: ["PacketTunnelProvider.swift", "LocalSOCKSProxy.swift", "Info.plist",
                          "VuaTroChoi.entitlements", "VuaTroChoiTunnel.entitlements", "README.md"],
                sources: ["ClientHelloSplitter.swift"]),
        .testTarget(name: "VuaTroChoiDesyncCoreTests", dependencies: ["VuaTroChoiDesyncCore"], path: "Tests")
    ]
)
