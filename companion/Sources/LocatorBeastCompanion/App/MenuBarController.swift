import AppKit

// The menu-bar UI. Deliberately minimal (V1 is about reliability, not polish):
// a status line, last-sync time, one context-appropriate primary action, a
// manual Refresh, and Quit. It reflects SyncEngine.status and rebuilds whenever
// the engine reports a change.
@MainActor
final class MenuBarController: NSObject {
    private let statusItem: NSStatusItem
    private let engine: SyncEngine
    private var pairing: PairingService?

    init(engine: SyncEngine) {
        self.engine = engine
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "message", accessibilityDescription: "Locator Beast")
            button.image?.isTemplate = true
        }
        engine.onChange = { [weak self] in self?.rebuildMenu() }
        rebuildMenu()
    }

    private func rebuildMenu() {
        let menu = NSMenu()
        let s = engine.status

        menu.addItem(disabled("Messages Sync: \(phaseTitle(s.phase))"))
        menu.addItem(disabled("Last Sync: \(lastSyncText(s.lastSyncAt))"))

        // Paused explanation (entitlement).
        if case .paused = s.phase {
            menu.addItem(disabled("Your Locator Beast trial or subscription"))
            menu.addItem(disabled("is no longer active."))
        }

        menu.addItem(.separator())

        switch s.phase {
        case .needsPairing:
            menu.addItem(action("Connect Locator Beast…", #selector(connect)))
        case .needsFullDiskAccess:
            menu.addItem(action("Grant Full Disk Access…", #selector(openFDA)))
        case .needsUpdate:
            menu.addItem(action("Update Required — Open Locator Beast…", #selector(openBilling)))
        case .paused:
            menu.addItem(action("Open Billing", #selector(openBilling)))
        case .idle, .syncing, .offline:
            break
        }

        menu.addItem(action("Refresh Now", #selector(refresh)))
        menu.addItem(.separator())
        menu.addItem(action("Quit", #selector(quit)))

        statusItem.menu = menu
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    @objc private func connect() {
        let svc = PairingService()
        pairing = svc
        svc.startPairing { [weak self] result in
            self?.pairing = nil
            switch result {
            case .success(let token):
                Keychain.saveToken(token)
                AppLog.info("Paired successfully.")
                self?.engine.onPaired()
            case .failure(let err):
                AppLog.error("Pairing failed: \(err)")
            }
        }
    }

    @objc private func openFDA() { FullDiskAccess.openSettings() }
    @objc private func openBilling() { NSWorkspace.shared.open(Config.billingURL) }
    @objc private func refresh() { engine.manualRefresh() }
    @objc private func quit() { NSApp.terminate(nil) }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }
    private func action(_ title: String, _ sel: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: sel, keyEquivalent: "")
        item.target = self
        return item
    }
    private func phaseTitle(_ phase: SyncPhase) -> String {
        switch phase {
        case .needsPairing: return "Not connected"
        case .needsFullDiskAccess: return "Needs Full Disk Access"
        case .needsUpdate: return "Update required"
        case .paused: return "Paused"
        case .idle: return "On"
        case .syncing: return "Syncing…"
        case .offline: return "Offline — will retry"
        }
    }
    private func lastSyncText(_ date: Date?) -> String {
        guard let date else { return "Never" }
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        let rel = RelativeDateTimeFormatter()
        return "\(f.string(from: date)) (\(rel.localizedString(for: date, relativeTo: Date())))"
    }
}
