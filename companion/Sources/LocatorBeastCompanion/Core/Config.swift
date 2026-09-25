import Foundation

// Static configuration. Base URL is overridable via LB_BASE_URL for local dev.
enum Config {
    static let appVersion = "1.0.0"

    static var baseURL: URL {
        if let raw = ProcessInfo.processInfo.environment["LB_BASE_URL"],
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://locatorbeast.com")!
    }

    // Endpoints
    static var pairURL: URL { baseURL.appendingPathComponent("api/companion/pair") }
    static var messagesURL: URL { baseURL.appendingPathComponent("api/companion/messages") }
    static var statusURL: URL { baseURL.appendingPathComponent("api/companion/status") }
    // Outbound gateway: claim approved jobs, then acknowledge each send result.
    static var outboundURL: URL { baseURL.appendingPathComponent("api/companion/outbound") }
    static var outboundAckURL: URL { baseURL.appendingPathComponent("api/companion/outbound/ack") }

    // The browser page the loopback pairing flow opens.
    static func pairPageURL(port: Int, state: String) -> URL {
        var comps = URLComponents(url: baseURL.appendingPathComponent("companion/pair"),
                                  resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "port", value: String(port)),
            URLQueryItem(name: "state", value: state),
        ]
        return comps.url!
    }

    static var billingURL: URL { baseURL.appendingPathComponent("admin/billing") }

    // Sync cadence (poll). FSEvents-on-WAL is a later upgrade layered on top.
    static let syncInterval: TimeInterval = 30
    // Outbound claim cadence — short so the New-Lead Text 2 (eligible exactly 30s
    // after Text 1's confirmed send) is claimed promptly, independent of the
    // server's 1-minute dispatcher tick.
    static let outboundPollInterval: TimeInterval = 10
    // Entitlement re-check cadence — how often we poll /status so renewals
    // resume sync automatically without repairing.
    static let entitlementInterval: TimeInterval = 5 * 60

    // Max messages per ingest batch (must stay <= server MAX_BATCH of 500).
    static let batchSize = 200
}
