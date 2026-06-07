import Foundation
import Combine

/// État d'authentification de l'app — wrapper autour de AuthAPI.
/// La gate au lancement (`bootstrap`) tente `me()` pour réutiliser une
/// session cookie persistée par URLSession entre les lancements.
@MainActor
final class SessionStore: ObservableObject {

    enum Phase: Equatable {
        case loading            // splash, vérifie si session valide
        case unauthenticated    // login/signup obligatoire
        case authenticated(Account)
    }

    @Published private(set) var phase: Phase = .loading
    @Published var lastError: String?

    private let api = AuthAPI()
    private let oauth = OAuthService()
    private let passkey = PasskeyService()

    var currentAccount: Account? {
        if case .authenticated(let acc) = phase { return acc }
        return nil
    }

    // MARK: - Lifecycle

    /// Appelé au démarrage de l'app. Si un cookie session vit encore,
    /// rebascule directement en authenticated. Sinon → unauthenticated.
    func bootstrap() async {
        do {
            if let acc = try await api.me() {
                phase = .authenticated(acc)
            } else {
                phase = .unauthenticated
            }
        } catch {
            phase = .unauthenticated
        }
    }

    // MARK: - Actions

    func login(identifier: String, password: String) async {
        lastError = nil
        do {
            let acc = try await api.login(identifier: identifier, password: password)
            phase = .authenticated(acc)
        } catch let err as AuthError {
            lastError = err.localizedDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signup(email: String, pseudo: String, password: String) async {
        lastError = nil
        do {
            let acc = try await api.signup(email: email, pseudo: pseudo, password: password)
            phase = .authenticated(acc)
        } catch let err as AuthError {
            lastError = err.localizedDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() async {
        try? await api.logout()
        phase = .unauthenticated
    }

    // MARK: - OAuth (Google / GitHub)

    func signInWithOAuth(_ provider: OAuthService.Provider) async {
        lastError = nil
        do {
            try await oauth.start(provider: provider)
            // Le serveur a posé le cookie session via la web view. Recharge le compte.
            await refreshAccount()
        } catch let err as OAuthService.OAuthError {
            if case .cancelled = err { return }
            lastError = err.localizedDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Passkey

    func signInWithPasskey() async {
        lastError = nil
        do {
            try await passkey.signIn()
            await refreshAccount()
        } catch let err as PasskeyService.PasskeyError {
            if case .cancelled = err { return }
            lastError = err.localizedDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Recharge `/api/account/me` après un flow externe (OAuth, Passkey).
    private func refreshAccount() async {
        do {
            if let acc = try await api.me() {
                phase = .authenticated(acc)
            } else {
                lastError = "Connexion non détectée. Réessaye."
            }
        } catch {
            lastError = error.localizedDescription
        }
    }
}
