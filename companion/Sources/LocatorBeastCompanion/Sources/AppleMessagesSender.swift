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
