import Foundation

/// Compte Shardtown — miroir de la réponse `/api/account/me`.
struct Account: Codable, Equatable, Hashable, Sendable {
    let id: Int
    let email: String?
    let pseudo: String
    let emailVerified: Bool?
    let oauthGoogleId: String?
    let oauthGithubId: String?
    let shardId: String?
    let discordId: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, email, pseudo
        case emailVerified = "email_verified"
        case oauthGoogleId = "oauth_google_id"
        case oauthGithubId = "oauth_github_id"
        case shardId = "shard_id"
        case discordId = "discord_id"
        case createdAt = "created_at"
    }
}

/// Erreurs API typées.
enum AuthError: LocalizedError {
    case network(String)
    case http(Int, String?)
    case decoding(String)
    case captchaRequired

    var errorDescription: String? {
        switch self {
        case .network(let m): "Réseau : \(m)"
        case .http(let code, let msg):
            if let msg, !msg.isEmpty { msg }
            else { "Erreur serveur (\(code))" }
        case .decoding(let m): "Format inattendu : \(m)"
        case .captchaRequired: "Vérification captcha requise. (Pas encore disponible sur mobile — utilise le site pour cette étape.)"
        }
    }
}

/// Client HTTP authentification Shardtown — réplique le flux email/password
/// du site (`/api/account/login`, `/signup`, `/me`, `/logout`).
///
/// Sessions : URLSession utilise par défaut `HTTPCookieStorage.shared` qui
/// persiste le cookie `sgid` entre les lancements. Pas besoin de gérer le
/// token nous-mêmes — le navigateur iOS le fait.
///
/// ⚠️ Le serveur attend un champ `shardSecure` (captcha) sur signup/login.
/// On envoie une string vide pour l'instant — quand on ajoutera la solution
/// (bypass mobile dédié ou affichage captcha image), remplacer dans
/// `loginPayload` / `signupPayload`.
actor AuthAPI {
    /// Base URL configurable — change ici pour dev/staging/prod.
    /// Idéalement à externaliser dans Info.plist > SHARDTOWN_API_BASE_URL.
    /// Note : le domaine est bien `shardtwn.fr` (sans le second `o`).
    static let baseURL = URL(string: "https://shardtwn.fr")!

    private let session: URLSession
    private var csrfToken: String?

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)
    }

    // MARK: - CSRF

    /// Expose le token CSRF pour les autres APIs (Shard, etc.) qui font
    /// leurs propres POST CSRF-protected.
    func currentCsrfToken() async throws -> String {
        try await ensureCsrf()
    }

    /// `GET /api/admin/csrf` — initialise la session et retourne le token
    /// CSRF que le middleware `verifyCsrf` du serveur exige sur les POST.
    /// Mis en cache au niveau actor — on ne re-fetch que si une requête
    /// échoue en 403 (au cas où le token aurait été invalidé).
    private func ensureCsrf() async throws -> String {
        if let t = csrfToken { return t }
        let envelope: CsrfEnvelope = try await getRaw("/api/admin/csrf")
        csrfToken = envelope.csrfToken
        return envelope.csrfToken
    }

    private struct CsrfEnvelope: Codable { let csrfToken: String }

    // MARK: - Endpoints

    /// `POST /api/account/login` — connexion par email ou pseudo + mot de passe.
    func login(identifier: String, password: String) async throws -> Account {
        let envelope: AccountEnvelope = try await withCsrfRetry { token in
            let shardSecure = try await self.obtainShardSecure(csrf: token)
            let body: [String: String] = [
                "identifier": identifier,
                "password": password,
                "shardSecure": shardSecure,
                "_csrf": token
            ]
            return try await self.post("/api/account/login", body: body, csrf: token)
        }
        return envelope.account
    }

    /// `POST /api/account/signup` — création de compte.
    func signup(email: String, pseudo: String, password: String) async throws -> Account {
        let envelope: AccountEnvelope = try await withCsrfRetry { token in
            let shardSecure = try await self.obtainShardSecure(csrf: token)
            let body: [String: String] = [
                "email": email,
                "pseudo": pseudo,
                "password": password,
                "shardSecure": shardSecure,
                "_csrf": token
            ]
            return try await self.post("/api/account/signup", body: body, csrf: token)
        }
        return envelope.account
    }

    /// `POST /api/account/shardsecure` — récupère un token anti-bot léger.
    /// Le serveur stocke le token en session (TTL 5 min) ; il sera consumé
    /// par le prochain login/signup. Honeypot `website` laissé vide.
    private func obtainShardSecure(csrf: String) async throws -> String {
        let envelope: ShardSecureEnvelope = try await post(
            "/api/account/shardsecure",
            body: ["website": "", "_csrf": csrf],
            csrf: csrf
        )
        return envelope.token
    }

    private struct ShardSecureEnvelope: Codable {
        let token: String
        let expiresIn: Int?
    }

    /// Wrap une requête CSRF-protected : ensure le token, exécute,
    /// et si 403 → invalide le token, refetch, retry une fois.
    private func withCsrfRetry<T: Decodable>(_ op: (String) async throws -> T) async throws -> T {
        let token = try await ensureCsrf()
        do {
            return try await op(token)
        } catch AuthError.http(403, _) {
            csrfToken = nil
            let fresh = try await ensureCsrf()
            return try await op(fresh)
        }
    }

    /// `GET /api/account/me` — récupère le compte connecté via le cookie session.
    /// Renvoie nil si pas de session valide.
    func me() async throws -> Account? {
        do {
            let envelope: AccountEnvelope = try await get("/api/account/me")
            return envelope.account
        } catch AuthError.http(let code, _) where code == 401 || code == 403 {
            return nil
        }
    }

    /// `POST /api/account/logout` — détruit la session côté serveur + vide les cookies locaux.
    func logout() async throws {
        let token = try? await ensureCsrf()
        _ = try? await postRaw("/api/account/logout", body: ["_csrf": token ?? ""], csrf: token)
        // Vide les cookies pour shardtwn.fr et le token CSRF en cache.
        if let cookies = HTTPCookieStorage.shared.cookies(for: Self.baseURL) {
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
        csrfToken = nil
    }

    // MARK: - HTTP helpers

    private struct AccountEnvelope: Codable {
        let account: Account
    }

    private struct ErrorEnvelope: Codable {
        let error: String?
        let message: String?
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = Self.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(req)
    }

    /// GET sans gestion d'erreur 401/403 — utilisé pour récupérer le CSRF
    /// (qui ne dépend pas d'une session authentifiée).
    private func getRaw<T: Decodable>(_ path: String) async throws -> T {
        let url = Self.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(req)
    }

    private func post<T: Decodable>(_ path: String, body: [String: String], csrf: String? = nil) async throws -> T {
        let url = Self.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let csrf { req.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await perform(req)
    }

    @discardableResult
    private func postRaw(_ path: String, body: [String: String], csrf: String? = nil) async throws -> Data {
        let url = Self.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let csrf { req.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await session.data(for: req)
        return data
    }

    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw AuthError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw AuthError.network("Réponse invalide")
        }

        if !(200..<300).contains(http.statusCode) {
            // Tenter d'extraire un message d'erreur lisible.
            let errMsg = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))
                .flatMap { $0.error ?? $0.message }
            if let errMsg, errMsg.lowercased().contains("captcha") || errMsg.lowercased().contains("shardsecure") {
                throw AuthError.captchaRequired
            }
            throw AuthError.http(http.statusCode, errMsg)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw AuthError.decoding(error.localizedDescription)
        }
    }
}
