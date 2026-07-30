import Foundation
import os

// Thin logging wrapper. Uses the unified logging system so logs are visible in
// Console.app without printing PII to stdout in production.
enum AppLog {
    private static let log = Logger(subsystem: "app.locatorbeast.companion", category: "companion")

    // info/debug compile OUT of Release builds (`swift build -c release` doesn't
    // define DEBUG), so distributed builds carry no verbose development logs.
    // Only errors are logged in Release, and never with message content marked
    // private so PII can't leak.
    static func info(_ msg: String) {
        #if DEBUG
        log.info("\(msg, privacy: .public)")
        #endif
    }
    static func debug(_ msg: String) {
        #if DEBUG
        log.debug("\(msg, privacy: .public)")
        #endif
    }
    static func error(_ msg: String) { log.error("\(msg, privacy: .public)") }
}
