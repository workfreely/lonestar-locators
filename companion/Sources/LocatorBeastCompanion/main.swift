import AppKit

// Entry point for the menu-bar agent. Kept as a top-level main.swift so it also
// runs cleanly via `swift run` for local development. The setup touches
// @MainActor state, and top-level code already runs on the main thread, so we
// assume main-actor isolation explicitly for Swift 6 concurrency checking.
let app = NSApplication.shared

// Retained globally (NSApplication.delegate is weak).
let delegate: AppDelegate = MainActor.assumeIsolated {
    let d = AppDelegate()
    app.delegate = d
    return d
}
_ = delegate

app.run()
