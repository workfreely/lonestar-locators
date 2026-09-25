import Foundation

// OUTBOUND transport: hands an approved message to Apple Messages on THIS Mac,
// sent from the signed-in Messages/iMessage identity. This is the only place the
// companion writes anything to Messages — inbound stays read-only (chat.db).
//
// A "success" here means osascript reported that Messages ACCEPTED the send
// (submission), which is the strongest local signal macOS provides. It is NOT a
// carrier/delivery receipt — the backend records it as `sent`, never `delivered`.
//
// The message text and phone are passed as osascript `argv`, never interpolated
// into the script source, so nothing in a template body can alter the script.
enum AppleMessagesSendResult {
    case success
    case failure(String)
}

// Read-only identity diagnostic: which iMessage service(s) exist on this Mac, and
// which one the send path ("1st service whose service type = iMessage") resolves
// to. Sends NOTHING. Written to Application Support so it can be verified before
// any real send; also the first Apple Event that surfaces the Automation prompt.
struct MessagesIdentity: Codable {
    var services: [String] = []   // "name || type" per service
    var chosenIMessage: String?   // the exact service the send path will use
    var error: String?
    var recordedAt: String = ""
}

enum AppleMessagesSender {
    // AppleScript: send to the number over iMessage. `on run argv` keeps the phone
    // and body as data arguments (injection-safe).
    private static let scriptLines: [String] = [
        "on run argv",
        "  set phoneNumber to item 1 of argv",
        "  set messageText to item 2 of argv",
        "  tell application \"Messages\"",
        "    set targetService to 1st service whose service type = iMessage",
        "    set targetBuddy to buddy phoneNumber of targetService",
        "    send messageText to targetBuddy",
        "  end tell",
        "end run",
    ]

    /// Send serially. Runs osascript off the main actor and resolves with the result.
    static func send(to phone: String, body: String) async -> AppleMessagesSendResult {
        await withCheckedContinuation { (continuation: CheckedContinuation<AppleMessagesSendResult, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                continuation.resume(returning: runOsascript(phone: phone, body: body))
            }
        }
    }

    // ── Read-only sender-identity diagnostic ────────────────────────────────
    private static let identityScript: [String] = [
        "with timeout of 25 seconds",
        "  tell application \"Messages\"",
        "    set outp to \"\"",
        "    repeat with s in services",
        "      set outp to outp & (name of s) & \" || \" & (service type of s as text) & linefeed",
        "    end repeat",
        "    set chosen to \"\"",
        "    try",
        "      set chosen to name of (1st service whose service type = iMessage)",
        "    end try",
        "    return outp & \"CHOSEN::\" & chosen",
        "  end tell",
        "end timeout",
    ]

    /// Enumerate services and record the resolved sender identity to Application
    /// Support (messages-identity.json). Read-only; sends nothing. Runs off-main.
    static func recordSenderIdentity() async {
        let result: MessagesIdentity = await withCheckedContinuation { cont in
            DispatchQueue.global(qos: .utility).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
                var args: [String] = []
                for line in identityScript { args.append("-e"); args.append(line) }
                process.arguments = args
                let out = Pipe(); let err = Pipe()
                process.standardOutput = out; process.standardError = err
                let iso = ISO8601DateFormatter().string(from: Date())
                do { try process.run() } catch {
                    cont.resume(returning: MessagesIdentity(error: "launch failed: \(error.localizedDescription)", recordedAt: iso)); return
                }
                process.waitUntilExit()
                if process.terminationStatus != 0 {
                    let e = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "osascript exit \(process.terminationStatus)"
                    cont.resume(returning: MessagesIdentity(error: e.trimmingCharacters(in: .whitespacesAndNewlines), recordedAt: iso)); return
                }
                let text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                var services: [String] = []; var chosen: String?
                for line in text.split(separator: "\n") {
                    let s = line.trimmingCharacters(in: .whitespaces)
                    if s.hasPrefix("CHOSEN::") { chosen = String(s.dropFirst("CHOSEN::".count)).trimmingCharacters(in: .whitespaces) }
                    else if !s.isEmpty { services.append(s) }
                }
                cont.resume(returning: MessagesIdentity(services: services, chosenIMessage: (chosen?.isEmpty == false) ? chosen : nil, recordedAt: iso))
            }
        }
        if let data = try? JSONEncoder().encode(result) { try? data.write(to: identityFileURL, options: .atomic) }
        AppLog.info("Messages identity — services=\(result.services); chosen=\(result.chosenIMessage ?? "none"); error=\(result.error ?? "none")")
    }

    static var identityFileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocatorBeastCompanion", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("messages-identity.json")
    }

    private static func runOsascript(phone: String, body: String) -> AppleMessagesSendResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        var args: [String] = []
        for line in scriptLines { args.append("-e"); args.append(line) }
        args.append(phone) // argv item 1
        args.append(body)  // argv item 2
        process.arguments = args

        let stderr = Pipe()
        process.standardError = stderr
        process.standardOutput = Pipe()

        do {
            try process.run()
        } catch {
            return .failure("launch failed: \(error.localizedDescription)")
        }
        process.waitUntilExit()

        if process.terminationStatus == 0 {
            return .success
        }
        let errData = stderr.fileHandleForReading.readDataToEndOfFile()
        let errText = String(data: errData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // Common first-run cause: Automation permission for Messages not yet granted
        // (System Settings → Privacy & Security → Automation). Surface it verbatim.
        return .failure(errText.isEmpty ? "osascript exit \(process.terminationStatus)" : errText)
    }
}
