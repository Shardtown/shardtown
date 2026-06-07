import Foundation

/// Réponse de `/api/shard/server` — liste des guildes Discord administrables
/// par le user + IDs des guildes où le bot Shard est présent.
struct ShardServerResponse: Codable, Sendable {
    let user: DiscordUser?
    let guilds: [DiscordGuild]
    let botGuildIds: [String]?
    let clientId: String?

    struct DiscordUser: Codable, Sendable {
        let id: String
        let username: String
        let avatar: String?
    }
    struct DiscordGuild: Codable, Sendable, Identifiable, Hashable {
        let id: String
        let name: String
        let icon: String?
    }
}

/// Erreur de chargement guildes.
enum ShardAPIError: LocalizedError {
    case notLinked          // user pas connecté ou Discord pas lié
    case network(String)
    case http(Int, String?)

    var errorDescription: String? {
        switch self {
        case .notLinked: "Lie ton compte Discord à Shardtown pour voir tes guildes."
        case .network(let m): "Réseau : \(m)"
        case .http(let c, let m): m ?? "Erreur serveur (\(c))"
        }
    }
}

/// Client API Shard — endpoints du dashboard (guildes, modules).
actor ShardAPI {
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    /// GET `/api/shard/guild/:id` → settings + channels/roles d'une guilde.
    func fetchGuild(id: String) async throws -> ShardGuildData {
        let url = AuthAPI.baseURL.appendingPathComponent("/api/shard/guild/\(id)")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ShardAPIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ShardAPIError.network("Réponse invalide")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw ShardAPIError.notLinked
        }
        if !(200..<300).contains(http.statusCode) {
            throw ShardAPIError.http(http.statusCode, String(data: data, encoding: .utf8))
        }
        do {
            let decoder = JSONDecoder()
            return try decoder.decode(ShardGuildData.self, from: data)
        } catch {
            throw ShardAPIError.network("Format inattendu : \(error.localizedDescription)")
        }
    }

    /// POST `/shard/guild/:id/config` → save tous les settings.
    /// (Note : path sans `/api`, c'est le legacy du serveur.)
    func saveSettings(guildId: String, settings: ShardSettings, csrfToken: String) async throws {
        let url = AuthAPI.baseURL.appendingPathComponent("/shard/guild/\(guildId)/config")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        var payload = settings.asPayload()
        payload["_csrf"] = csrfToken
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ShardAPIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ShardAPIError.network("Réponse invalide")
        }
        if !(200..<300).contains(http.statusCode) {
            throw ShardAPIError.http(http.statusCode, String(data: data, encoding: .utf8))
        }
    }

    /// GET `/api/shard/server` → liste des guildes du user authentifié.
    func fetchServer() async throws -> ShardServerResponse {
        let url = AuthAPI.baseURL.appendingPathComponent("/api/shard/server")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ShardAPIError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw ShardAPIError.network("Réponse invalide")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw ShardAPIError.notLinked
        }
        if !(200..<300).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8)
            throw ShardAPIError.http(http.statusCode, msg)
        }

        do {
            return try JSONDecoder().decode(ShardServerResponse.self, from: data)
        } catch {
            throw ShardAPIError.network("Format inattendu : \(error.localizedDescription)")
        }
    }
}
