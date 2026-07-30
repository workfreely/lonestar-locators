import Foundation
import Network
import AppKit

// Loopback OAuth-style pairing (same model as the Google flow). Opens the
// browser to the authenticated pair page; the page mints a device token and
// redirects to http://127.0.0.1:<port>/callback?token=…&state=…, which this
// listener catches. The token is verified against our state nonce and stored in
// the Keychain. The companion itself never sends credentials — the browser's
// existing session authorizes the mint.
final class PairingService {
    private var listener: NWListener?
    private let state = UUID().uuidString
    private var completion: ((Result<String, Error>) -> Void)?

    enum PairingError: Error { case listenFailed, stateMismatch, noToken, timeout }

    func startPairing(completion: @escaping (Result<String, Error>) -> Void) {
        self.completion = completion
        do {
            let params = NWParameters.tcp
            // Loopback only.
            let listener = try NWListener(using: params)
            self.listener = listener

            listener.stateUpdateHandler = { [weak self] st in
                guard let self else { return }
                if case .ready = st, let port = listener.port?.rawValue {
                    let url = Config.pairPageURL(port: Int(port), state: self.state)
                    AppLog.info("Pairing: opening \(url.absoluteString)")
                    NSWorkspace.shared.open(url)
                } else if case .failed = st {
                    self.finish(.failure(PairingError.listenFailed))
                }
            }
            listener.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
            listener.start(queue: .global())

            // Safety timeout — don't listen forever.
            DispatchQueue.global().asyncAfter(deadline: .now() + 300) { [weak self] in
                self?.finish(.failure(PairingError.timeout))
            }
        } catch {
            completion(.failure(error))
        }
    }

    private func handle(_ conn: NWConnection) {
        conn.start(queue: .global())
        conn.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                conn.cancel(); return
            }
            // First line: "GET /callback?token=…&state=… HTTP/1.1"
            let firstLine = request.split(separator: "\r\n").first.map(String.init) ?? ""
            let path = firstLine.split(separator: " ").dropFirst().first.map(String.init) ?? ""
            let (token, state) = self.parse(path)

            let bodyOK = "<html><body style='font-family:-apple-system;text-align:center;padding-top:60px'>✅ Connected. You can close this tab and return to the Companion.</body></html>"
            let bodyErr = "<html><body style='font-family:-apple-system;text-align:center;padding-top:60px'>Pairing failed. Please try again from the Companion.</body></html>"
            let ok = token != nil && state == self.state
            let body = ok ? bodyOK : bodyErr
            let http = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
            conn.send(content: Data(http.utf8), completion: .contentProcessed { _ in conn.cancel() })

            if ok, let token { self.finish(.success(token)) }
            else if state != nil { self.finish(.failure(PairingError.stateMismatch)) }
        }
    }

    private func parse(_ path: String) -> (token: String?, state: String?) {
        guard let comps = URLComponents(string: "http://127.0.0.1\(path)") else { return (nil, nil) }
        let items = comps.queryItems ?? []
        return (items.first { $0.name == "token" }?.value, items.first { $0.name == "state" }?.value)
    }

    private func finish(_ result: Result<String, Error>) {
        guard let completion else { return }
        self.completion = nil
        listener?.cancel()
        listener = nil
        DispatchQueue.main.async { completion(result) }
    }
}
