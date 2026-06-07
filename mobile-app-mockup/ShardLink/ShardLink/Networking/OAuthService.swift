import Foundation
import AuthenticationServices
import UIKit

/// OAuth Google / GitHub via ASWebAuthenticationSession.
///
/// Flow :
/// 1. Ouvre `https://shardtwn.fr/api/account/oauth/<provider>?mobileCallback=shardtown://oauth-done`
///    dans une vue Safari sandboxée (cookies isolés par défaut, identiques au site sinon).
/// 2. L'utilisateur s'authentifie chez Google/GitHub.
/// 3. Le callback serveur (`/oauth/<provider>/callback`) crée la session puis
///    **doit redirect vers le `mobileCallback`** passé en query (ajustement
///    serveur requis — voir README).
/// 4. iOS détecte le scheme `shardtown://` → ferme la session web → on poll
///    `/api/account/me` pour confirmer.
@MainActor
final class OAuthService: NSObject {

    enum Provider: String {
        case google, github
        var label: String {
            switch self {
            case .google: "Google"
            case .github: "GitHub"
            }
        }
    }

    enum OAuthError: LocalizedError {
        case cancelled
        case failed(String)
        var errorDescription: String? {
            switch self {
            case .cancelled: nil
            case .failed(let m): "Connexion annulée : \(m)"
            }
        }
    }

    private let callbackScheme = "shardtown"
    private var currentSession: ASWebAuthenticationSession?

    /// Lance le flow et résout quand l'utilisateur est revenu sur l'app
    /// via le scheme custom (ou throw si annulé/échoué).
    func start(provider: Provider) async throws {
        var components = URLComponents(
            url: AuthAPI.baseURL.appendingPathComponent("/api/account/oauth/\(provider.rawValue)"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "mobileCallback", value: "\(callbackScheme)://oauth-done")
        ]
        guard let url = components.url else {
            throw OAuthError.failed("URL invalide")
        }

        let _: URL = try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error {
                    if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        cont.resume(throwing: OAuthError.cancelled)
                    } else {
                        cont.resume(throwing: OAuthError.failed(error.localizedDescription))
                    }
                    return
                }
                guard let callbackURL else {
                    cont.resume(throwing: OAuthError.failed("Aucune URL de callback"))
                    return
                }
                cont.resume(returning: callbackURL)
            }
            // Partage les cookies avec Safari → si user déjà connecté à Google
            // dans Safari, le flow est instantané.
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = self
            self.currentSession = session
            session.start()
        }
    }
}

extension OAuthService: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { firstKeyWindowAnchor() }
    }
}

@MainActor
func firstKeyWindowAnchor() -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let key = scenes.compactMap(\.keyWindow).first {
        return key
    }
    guard let scene = scenes.first else {
        // En pratique on a toujours au moins une scene active pendant un
        // flow auth — sinon l'app n'est pas au foreground et le flow ne
        // peut pas être lancé.
        preconditionFailure("Aucun UIWindowScene disponible pour ASPresentationAnchor")
    }
    return UIWindow(windowScene: scene)
}
