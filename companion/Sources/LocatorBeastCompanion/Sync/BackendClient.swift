import Foundation

// Talks to the Locator Beast backend over HTTPS with the Keychain device token.
// The server is authoritative; this maps HTTP outcomes to the states the
// SyncEngine reacts to.
enum BackendResult<T> {
    case ok(T)
    case unpaired            // 401 invalid — dead token → disconnected
    case revoked             // 401 revoked — device retired → disconnected
    case reset               // 401 reset — credential rotation → clear token + reconnect
    case notEntitled(String) // 403 entitlement — reason → pause
    case paused(String)      // 403 per-device remote pause → pause
    case updateRequired      // 426 — force update
    case maintenance         // 503 — global service pause
    case rateLimited         // 429 — back off
    case offline             // network error → retry later
    case failure(String)
}

struct IngestOutcome { let accepted: Int; let syncEnabled: Bool }

// One approved outbound job the server handed this device to send.
struct OutboundJob {
    let intentId: String
    let idempotencyKey: String
    let leadId: Int
    let toPhone: String
    let body: String
    let sequenceKey: String
    let stepKey: String
}

// Full server-authoritative heartbeat state.
struct StatusOutcome {
    let entitled: Bool
    let reason: String
    let revoked: Bool
    let syncPaused: Bool
    let maintenance: Bool
    let updateRequired: Bool
    let minVersion: String
    let syncEnabled: Bool   // the net verdict — pause when false
}

final class BackendClient {
    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.waitsForConnectivity = false
        return URLSession(configuration: cfg)
    }()

    private func authorized(_ url: URL, method: String, body: Data?, token: String) -> URLRequest {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Version is reported here (untrusted) so the server can gate/display it.
        req.setValue("LocatorBeastCompanion/\(Config.appVersion)", forHTTPHeaderField: "User-Agent")
        req.httpBody = body
        return req
    }

    // POST /api/companion/messages
    func ingest(_ messages: [SourceMessage], token: String) async -> BackendResult<IngestOutcome> {
        struct Wire: Encodable { let guid: String; let phone: String?; let isFromMe: Bool; let body: String?; let sentAt: String? }
        let iso = ISO8601DateFormatter()
        let payload = ["messages": messages.map {
            Wire(guid: $0.guid, phone: $0.phone, isFromMe: $0.isFromMe, body: $0.body, sentAt: $0.sentAt.map { iso.string(from: $0) })
        }]
        guard let body = try? JSONEncoder().encode(payload) else { return .failure("encode failed") }
        do {
            let (data, resp) = try await session.data(for: authorized(Config.messagesURL, method: "POST", body: body, token: token))
            return map(data, resp) { json in
                IngestOutcome(accepted: (json["accepted"] as? Int) ?? 0, syncEnabled: (json["syncEnabled"] as? Bool) ?? true)
            }
        } catch { return .offline }
    }

    // GET /api/companion/status
    func status(token: String) async -> BackendResult<StatusOutcome> {
        do {
            let (data, resp) = try await session.data(for: authorized(Config.statusURL, method: "GET", body: nil, token: token))
            return map(data, resp) { json in
                StatusOutcome(
                    entitled: (json["entitled"] as? Bool) ?? false,
                    reason: (json["reason"] as? String) ?? "unknown",
                    revoked: (json["revoked"] as? Bool) ?? false,
                    syncPaused: (json["syncPaused"] as? Bool) ?? false,
                    maintenance: (json["maintenance"] as? Bool) ?? false,
                    updateRequired: (json["updateRequired"] as? Bool) ?? false,
                    minVersion: (json["minVersion"] as? String) ?? "0.0.0",
                    syncEnabled: (json["syncEnabled"] as? Bool) ?? false
                )
            }
        } catch { return .offline }
    }

    // GET /api/companion/outbound — claim approved, re-validated jobs for this
    // device. The server re-runs the send gate at claim; anything stale is dropped
    // there, so a returned job is safe to send now (subject to local idempotency).
    func claimOutbound(token: String) async -> BackendResult<[OutboundJob]> {
        do {
            let (data, resp) = try await session.data(for: authorized(Config.outboundURL, method: "GET", body: nil, token: token))
            return map(data, resp) { json in
                let raw = (json["jobs"] as? [[String: Any]]) ?? []
                return raw.compactMap { j -> OutboundJob? in
                    guard let intentId = j["intentId"] as? String,
                          let key = j["idempotencyKey"] as? String,
                          let toPhone = j["toPhone"] as? String,
                          let body = j["body"] as? String else { return nil }
                    return OutboundJob(
                        intentId: intentId,
                        idempotencyKey: key,
                        leadId: (j["leadId"] as? Int) ?? 0,
                        toPhone: toPhone,
                        body: body,
                        sequenceKey: (j["sequenceKey"] as? String) ?? "",
                        stepKey: (j["stepKey"] as? String) ?? ""
                    )
                }
            }
        } catch { return .offline }
    }

    // POST /api/companion/outbound/ack — report a send result. Idempotent
    // server-side: a duplicate "sent" ack (retry) never re-advances the run.
    func ackOutbound(intentId: String, idempotencyKey: String, status: String, localSentAt: String, error: String?, token: String) async -> BackendResult<Bool> {
        struct Wire: Encodable { let intentId: String; let idempotencyKey: String; let status: String; let localSentAt: String; let error: String? }
        guard let body = try? JSONEncoder().encode(Wire(intentId: intentId, idempotencyKey: idempotencyKey, status: status, localSentAt: localSentAt, error: error)) else {
            return .failure("encode failed")
        }
        do {
            let (data, resp) = try await session.data(for: authorized(Config.outboundAckURL, method: "POST", body: body, token: token))
            return map(data, resp) { json in (json["ok"] as? Bool) ?? false }
        } catch { return .offline }
    }

    private func map<T>(_ data: Data, _ resp: URLResponse, _ make: ([String: Any]) -> T) -> BackendResult<T> {
        guard let http = resp as? HTTPURLResponse else { return .failure("no response") }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        switch http.statusCode {
        case 200: return .ok(make(json))
        case 401:
            switch json["code"] as? String {
            case "reset": return .reset
            case "revoked": return .revoked
            default: return .unpaired
            }
        case 403:
            if (json["syncPaused"] as? Bool) == true { return .paused((json["reason"] as? String) ?? "device_paused") }
            return .notEntitled((json["reason"] as? String) ?? "not_entitled")
        case 426: return .updateRequired
        case 503: return .maintenance
        case 429: return .rateLimited
        default:  return .failure("HTTP \(http.statusCode)")
        }
    }
}
