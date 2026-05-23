import Foundation

/// Mirror of the `publicAccount` JSON shape returned by the server.
/// Snake_case to match the API; we expose typed accessors when useful.
struct Account: Codable, Equatable {
    let id: Int
    let email: String?
    let pseudo: String?
    let email_verified: Bool?

    let discord_id: String?
    let discord_username: String?
    let discord_avatar: String?

    let oauth_google_id: String?
    let oauth_google_email: String?
    let oauth_github_id: String?
    let oauth_github_username: String?

    /// Avatar URL when Discord is linked (CDN-cached).
    var discordAvatarURL: URL? {
        guard let id = discord_id, let hash = discord_avatar else { return nil }
        return URL(string: "https://cdn.discordapp.com/avatars/\(id)/\(hash).png?size=128")
    }

    /// Best-effort display name: pseudo → Discord → GitHub → Google → email local-part.
    var displayName: String {
        if let p = pseudo, !p.isEmpty { return p }
        if let n = discord_username, !n.isEmpty { return n }
        if let n = oauth_github_username, !n.isEmpty { return n }
        if let e = oauth_google_email, let at = e.firstIndex(of: "@") { return String(e[..<at]) }
        if let e = email, let at = e.firstIndex(of: "@") { return String(e[..<at]) }
        return "Utilisateur"
    }
}

struct ExchangeResponse: Codable {
    let token: String
    let account: Account
}

struct MeResponse: Codable {
    let account: Account?
}
