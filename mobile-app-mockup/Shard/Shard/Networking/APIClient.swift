import Foundation

enum API {
    /// Hard-coded production base. We could read from Info.plist /
    /// build settings later, but the mockup ships with a single env.
    static let baseURL = "https://shardtwn.fr"
}

struct APIClient {
    enum APIError: LocalizedError {
        case http(Int, String?)
        case decoding(String)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .http(let code, let body):  return "Erreur \(code)\(body.map { ": \($0)" } ?? "")"
            case .decoding(let m):           return "Réponse inattendue (\(m))."
            case .transport(let m):          return m
            }
        }
    }

    let token: String?

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path: path, method: "GET", body: nil)
    }

    func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(path: path, method: "POST", body: data)
    }

    private func request<T: Decodable>(path: String, method: String, body: Data?) async throws -> T {
        guard let url = URL(string: API.baseURL + path) else {
            throw APIError.transport("URL invalide")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.httpBody = body
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("Réponse HTTP invalide")
        }
        if !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8)
            throw APIError.http(http.statusCode, body)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}
