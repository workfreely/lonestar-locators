import Foundation
import AppKit

// Full Disk Access can't be granted programmatically (no request API) — it's a
// manual TCC toggle. We can only DETECT it (try to read chat.db) and GUIDE the
// user: deep-link the settings pane and re-check. After granting, the app must
// usually be relaunched for TCC to apply.
enum FullDiskAccess {
    static func isGranted() -> Bool {
        AppleMessagesSource().isAvailable()
    }

    static func openSettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!
        NSWorkspace.shared.open(url)
    }
}
