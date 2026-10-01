import Foundation
import ServiceManagement

// Launch-at-login, so Beast Sync is running after a Mac restart without anyone
// reopening it.
//
// SMAppService (macOS 13+, which Package.swift already targets) replaces the old
// LaunchAgent plist + privileged helper dance: one call, and the result shows up in
// System Settings → General → Login Items where the user can see and revoke it. No
// file is written into ~/Library/LaunchAgents, so uninstalling the .app removes the
// registration with it.
//
// REQUIRES A REAL BUNDLE. `SMAppService.mainApp` resolves the enclosing .app, so it
// cannot work for the bare `swift run` binary — it throws there (typically code 1,
// "Operation not permitted"). `isSupported` reports that honestly instead of
// pretending, which is what lets the menu hide the toggle during development rather
// than offering something that always fails.
enum LoginItem {
    /// True only when running from a real .app bundle, the only case SMAppService can register.
    static var isSupported: Bool {
        Bundle.main.bundleIdentifier != nil && Bundle.main.bundlePath.hasSuffix(".app")
    }

    static var isEnabled: Bool {
        guard isSupported else { return false }
        return SMAppService.mainApp.status == .enabled
    }

    /// Needs the user to approve it once in System Settings → Login Items.
    static var requiresApproval: Bool {
        guard isSupported else { return false }
        return SMAppService.mainApp.status == .requiresApproval
    }

    /// Returns true when the registration ended in the requested state.
    @discardableResult
    static func set(_ enabled: Bool) -> Bool {
        guard isSupported else {
            AppLog.error("LoginItem: not running from a .app bundle — cannot register")
            return false
        }
        do {
            if enabled {
                // register() throws if ALREADY registered, which is a no-op success
                // for our purposes, not a failure to report to the user.
                if SMAppService.mainApp.status != .enabled {
                    try SMAppService.mainApp.register()
                }
            } else {
                try SMAppService.mainApp.unregister()
            }
            AppLog.info("LoginItem: \(enabled ? "registered" : "unregistered")")
            return true
        } catch {
            AppLog.error("LoginItem \(enabled ? "register" : "unregister") failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Enable on first run of a bundled build, so a normal install is always-on by
    /// default. Only acts once — a user who turns it OFF is never re-enabled behind
    /// their back on the next launch.
    static func enableOnFirstRunIfNeeded() {
        guard isSupported else { return }
        let key = "loginItemDefaultApplied"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        set(true)
    }

    /// For the menu line, and the same vocabulary the CRM card uses.
    static var statusText: String {
        guard isSupported else { return "Launch at Login: unavailable (dev build)" }
        switch SMAppService.mainApp.status {
        case .enabled:          return "Launch at Login: On"
        case .requiresApproval: return "Launch at Login: Approve in System Settings"
        case .notRegistered:    return "Launch at Login: Off"
        case .notFound:         return "Launch at Login: unavailable"
        @unknown default:       return "Launch at Login: unknown"
        }
    }
}
