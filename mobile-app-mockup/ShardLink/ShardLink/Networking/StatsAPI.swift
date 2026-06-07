import Foundation

// MARK: - Stats payloads

struct BotStats: Codable, Identifiable, Hashable, Sendable {
    let label: String
    let online: Bool
    let guilds: Int
    let members: Int
    let shards: [Shard]?

    var id: String { label }

    struct Shard: Codable, Hashable, Sendable {
        let shard_id: Int?
        let status: String?
        let guilds_count: Int?
    }
}

struct StatsHistoryPoint: Codable, Hashable, Sendable {
    let timestamp: String
    let bot_label: String?
    let guilds: Int?
    let members: Int?
}

struct StatsResponse: Codable, Sendable {
    let current: [BotStats]
    let history: [StatsHistoryPoint]?
}

// MARK: - Premium payload

struct AccountPremiumResponse: Codable, Sendable {
    let is_premium: Bool
    let guilds: [PremiumGuild]

    struct PremiumGuild: Codable, Identifiable, Hashable, Sendable {
        let id: String
        let name: String
        let icon: String?
    }
}

// MARK: - Errors

enum StatsAPIError: LocalizedError {
    case network(String)
    case http(Int, String?)

    var errorDescription: String? {
        switch self {
        case .network(let m): "Réseau : \(m)"
        case .http(let c, let m): m ?? "Erreur serveur (\(c))"
        }
    }
}

// MARK: - Client

actor StatsAPI {
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    /// GET `/api/stats` (public, rate-limited)
    func fetchStats() async throws -> StatsResponse {
        try await get("/api/stats")
    }

    /// GET `/api/account/premium` (auth required)
    func fetchAccountPremium() async throws -> AccountPremiumResponse {
        try await get("/api/account/premium")
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = AuthAPI.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw StatsAPIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw StatsAPIError.network("Réponse invalide")
        }
        if !(200..<300).contains(http.statusCode) {
            throw StatsAPIError.http(http.statusCode, String(data: data, encoding: .utf8))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
