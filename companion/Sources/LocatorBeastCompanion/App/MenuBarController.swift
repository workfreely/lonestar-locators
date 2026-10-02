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
        menu.addItem(disabled("Version: \(Config.appVersion)"))

        // Contextual explanation lines.
        for line in explanation(for: s.phase) { menu.addItem(disabled(line)) }

        menu.addItem(.separator())

        switch s.phase {
        case .needsPairing, .disconnected, .pairingReset:
            menu.addItem(action("Connect Locator Beast…", #selector(connect)))
        case .needsFullDiskAccess:
            menu.addItem(action("Grant Full Disk Access…", #selector(openFDA)))
        case .needsUpdate:
            menu.addItem(action("Update Required — Open Locator Beast…", #selector(openBilling)))
        case .paused(let reason):
            // Entitlement lapses point to Billing; an admin/device pause doesn't.
            if reason != "device_paused" { menu.addItem(action("Open Billing", #selector(openBilling))) }
        case .maintenance, .idle, .syncing, .offline:
            break
        }

        menu.addItem(action("Refresh Now", #selector(refresh)))

        // Launch at Login — hidden entirely on the `swift run` dev path, where
        // SMAppService has no enclosing .app to register and would always fail.
        if LoginItem.isSupported {
            menu.addItem(.separator())
            let item = action("Launch at Login", #selector(toggleLoginItem))
            item.state = LoginItem.isEnabled ? .on : .off
            menu.addItem(item)
            if LoginItem.requiresApproval {
                menu.addItem(disabled("Approve Beast Sync in System Settings → Login Items"))
            }
        }

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
                self?.showPairingFailure(err)
            }
        }
    }

    /// Surface a pairing failure. Previously these were logged and nothing else,
    /// so a failed browser-open or a failed socket bind looked exactly like a
    /// click that never registered. Beast Sync has no window, so an alert is the
    /// only place a menu-bar app can say this out loud.
    private func showPairingFailure(_ err: Error) {
        let detail: String
        switch err {
        case PairingService.PairingError.browserOpenFailed:
            detail = "Beast Sync couldn't open your browser. Open \(Config.baseURL.absoluteString) manually, sign in, then try Connect again."
        case PairingService.PairingError.listenFailed:
            detail = "Beast Sync couldn't open the local connection it needs to finish pairing. Quit and reopen Beast Sync, then try again."
        case PairingService.PairingError.stateMismatch:
            detail = "The approval didn't match this Mac's request. Try Connect again, and approve in the tab Beast Sync opens."
        case PairingService.PairingError.timeout:
            detail = "Pairing timed out before it was approved. Choose Connect Locator Beast… again to retry."
        default:
            detail = "Pairing didn't complete. Please try Connect Locator Beast… again."
        }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Couldn't connect Locator Beast"
        alert.informativeText = detail
        alert.addButton(withTitle: "OK")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }

    @objc private func openFDA() { FullDiskAccess.openSettings() }
    @objc private func openBilling() { NSWorkspace.shared.open(Config.billingURL) }
    @objc private func refresh() { engine.manualRefresh() }
    @objc private func quit() { NSApp.terminate(nil) }

    @objc private func toggleLoginItem() {
        LoginItem.set(!LoginItem.isEnabled)
        rebuildMenu()
    }

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
        case .disconnected: return "Disconnected"
        case .pairingReset: return "Pairing reset"
        case .needsFullDiskAccess: return "Needs Full Disk Access"
        case .needsUpdate: return "Update required"
        case .maintenance: return "Temporarily unavailable"
        case .paused: return "Paused"
        case .idle: return "Connected"
        case .syncing: return "Syncing…"
        case .offline: return "Offline — will retry"
        }
    }

    private func explanation(for phase: SyncPhase) -> [String] {
        switch phase {
        case .disconnected:
            return ["This device was disconnected.", "Reconnect to resume syncing."]
        case .pairingReset:
            return ["Pairing has been reset.", "Please reconnect this Mac to Locator Beast."]
        case .maintenance:
            return ["Locator Beast is temporarily unavailable."]
        case .needsUpdate:
            return ["A newer Companion version is required."]
        case .paused(let reason):
            return reason == "device_paused"
                ? ["This device has been paused."]
                : ["Your Locator Beast trial or subscription", "is no longer active."]
        default:
            return []
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
