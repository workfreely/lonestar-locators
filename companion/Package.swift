// swift-tools-version:5.9
import PackageDescription

// Locator Beast Companion — native macOS menu-bar agent (Phone Sync V1).
//
// Runs as an accessory (menu-bar-only) app. For local development you can run
// it unsigned with `swift run`; production distribution wraps this in a signed +
// notarized .app bundle (LSUIElement) with Sparkle auto-update — see README.
let package = Package(
  name: "LocatorBeastCompanion",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "LocatorBeastCompanion",
      path: "Sources/LocatorBeastCompanion",
      // System SQLite (macOS SDK provides the SQLite3 module map) — used
      // read-only to read ~/Library/Messages/chat.db.
      linkerSettings: [.linkedLibrary("sqlite3")]
    )
  ]
)
