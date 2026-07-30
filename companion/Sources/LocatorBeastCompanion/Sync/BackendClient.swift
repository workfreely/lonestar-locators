import Foundation

// Talks to the Locator Beast backend over HTTPS with the Keychain device token.
// Distinguishes the outcomes SyncEngine must react to: ok, unpaired (401),
// notEntitled (403 → pause), rateLimited (429), needsUpdate, offline/other.
enum BackendResult<T> {
    case ok(T)
    case unpaired            // token invalid/revoked → require re-pair
    case notEntitled(String) // reason → pause syncing
    case rateLimited
    case offline             // network error → retry later
    case failure(String)
}

struct IngestOutcome { let accepted: Int; let entitled: Bool }
struct StatusOutcome { let entitled: Bool; let reason: String; let minVersion: String }

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
        req.setValue("LocatorBeastCompanion/\(Config.appVersion)", forHTTPHeaderField: "User-Agent")
        req.httpBody = body
        return req
    }

    // POST /api/companion/messages
    func ingest(_ messages: [SourceMessage], token: String) async -> BackendResult<IngestOutcome> {
        struct Wire: Encodable {
            let guid: String; let phone: String?; let isFromMe: Bool; let body: String?; let sentAt: String?
        }
        let iso = ISO8601DateFormatter()
        let payload = ["messages": messages.map {
            Wire(guid: $0.guid, phone: $0.phone, isFromMe: $0.isFromMe, body: $0.body,
                 sentAt: $0.sentAt.map { iso.string(from: $0) })
        }]
        guard let body = try? JSONEncoder().encode(payload) else { return .failure("encode failed") }

        do {
            let (data, resp) = try await session.data(for: authorized(Config.messagesURL, method: "POST", body: body, token: token))
            return decode(data, resp) { json in
                IngestOutcome(accepted: (json["accepted"] as? Int) ?? 0, entitled: (json["entitled"] as? Bool) ?? true)
            }
        } catch {
            return .offline
        }
    }

    // GET /api/companion/status
    func status(token: String) async -> BackendResult<StatusOutcome> {
        do {
            let (data, resp) = try await session.data(for: authorized(Config.statusURL, method: "GET", body: nil, token: token))
            return decode(data, resp) { json in
                StatusOutcome(
                    entitled: (json["entitled"] as? Bool) ?? false,
                    reason: (json["reason"] as? String) ?? "unknown",
                    minVersion: (json["minVersion"] as? String) ?? "0.0.0"
                )
            }
        } catch {
            return .offline
        }
    }

    // Shared HTTP → BackendResult mapping.
    private func decode<T>(_ data: Data, _ resp: URLResponse, _ make: ([String: Any]) -> T) -> BackendResult<T> {
        guard let http = resp as? HTTPURLResponse else { return .failure("no response") }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        switch http.statusCode {
        case 200: return .ok(make(json))
        case 401: return .unpaired
        case 403: return .notEntitled((json["reason"] as? String) ?? "not_entitled")
        case 429: return .rateLimited
        default:  return .failure("HTTP \(http.statusCode)")
        }
    }
}
