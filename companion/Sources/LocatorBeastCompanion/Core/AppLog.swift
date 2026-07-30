import Foundation
import os

// Thin logging wrapper. Uses the unified logging system so logs are visible in
// Console.app without printing PII to stdout in production.
enum AppLog {
    private static let log = Logger(subsystem: "app.locatorbeast.companion", category: "companion")

    static func info(_ msg: String) { log.info("\(msg, privacy: .public)") }
    static func error(_ msg: String) { log.error("\(msg, privacy: .public)") }
    static func debug(_ msg: String) { log.debug("\(msg, privacy: .public)") }
}
