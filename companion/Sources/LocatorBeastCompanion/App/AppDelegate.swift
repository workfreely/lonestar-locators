import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var engine: SyncEngine!
    private var menu: MenuBarController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu-bar-only agent (no Dock icon). Production sets LSUIElement in the
        // bundle Info.plist; this covers the `swift run` dev path.
        NSApp.setActivationPolicy(.accessory)

        // V1 registers only Apple Messages. Add GmailSource() / OutlookSource() /
        // CallSummarySource() here later — SyncEngine needs no other change.
        engine = SyncEngine(sources: [AppleMessagesSource()])
        menu = MenuBarController(engine: engine)
        engine.start()

        // Read-only: record which iMessage service the outbound path will use (and
        // surface the Automation prompt) BEFORE any real send. Sends nothing.
        Task { await AppleMessagesSender.recordSenderIdentity() }

        // A normal install should be always-on without anyone finding a setting.
        // Only applies its default ONCE — a user who turns it off stays off.
        LoginItem.enableOnFirstRunIfNeeded()

        AppLog.info("Beast Sync \(Config.appVersion) started. \(LoginItem.statusText)")
    }
}
