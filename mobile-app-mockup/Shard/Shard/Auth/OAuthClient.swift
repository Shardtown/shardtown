import Foundation
import AuthenticationServices
import UIKit

/// Drives the ASWebAuthenticationSession dance for the three supported
/// providers. The instance must live as long as the session (Apple's
/// API keeps a weak reference internally and will tear the session down
/// if we don't retain it ourselves).
@MainActor
final class OAuthClient: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Provider: String, CaseIterable, Identifiable {
        case discord, google, github
        var id: String { rawValue }
        var label: String {
            switch self {
            case .discord: return "Discord"
            case .google:  return "Google"
            case .github:  return "GitHub"
            }
        }
    }

    enum AuthError: LocalizedError {
        case cancelled
        case providerError(String)
        case missingCode
        case server(String)

        var errorDescription: String? {
            switch self {
            case .cancelled:             return "Connexion annulée."
            case .providerError(let r):  return "Erreur du fournisseur (\(r))."
            case .missingCode:           return "Réponse OAuth incomplète."
            case .server(let m):         return m
            }
        }
    }

    private var session: ASWebAuthenticationSession?

    /// Opens the in-app system browser, runs the OAuth flow, then
    /// returns the short-lived `code` extracted from the deep link.
    /// PKCE verifier is then traded for a Bearer token by the caller.
    func startFlow(provider: Provider, pkce: PKCE) async throws -> String {
        var components = URLComponents(string: "\(API.baseURL)/api/mobile/auth/start/\(provider.rawValue)")!
        components.queryItems = [
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
        ]
        let startURL = components.url!
        print("[Shard.oauth] startFlow provider=\(provider.rawValue) url=\(startURL.absoluteString)")

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: startURL,
                callbackURLScheme: "shardapp"
            ) { url, error in
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: AuthError.cancelled)
                    return
                }
                if let error {
                    continuation.resume(throwing: AuthError.server(error.localizedDescription))
                    return
                }
                guard let url else {
                    continuation.resume(throwing: AuthError.missingCode)
                    return
                }
                continuation.resume(returning: url)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.session = session
            let started = session.start()
            print("[Shard.oauth] session.start() returned \(started)")
        }

        print("[Shard.oauth] callback url=\(callbackURL.absoluteString)")
        let comps = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
        if let err = comps?.queryItems?.first(where: { $0.name == "error" })?.value {
            throw AuthError.providerError(err)
        }
        guard let code = comps?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw AuthError.missingCode
        }
        return code
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Find the active foreground window; fall back to a fresh one
        // if iOS reports none (e.g. early in app lifecycle).
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
        return active?.windows.first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
    }
}
