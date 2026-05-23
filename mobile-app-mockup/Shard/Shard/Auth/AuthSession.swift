import Foundation
import Combine

/// Source of truth for the app's authentication state. Observed by
/// SwiftUI views via `@EnvironmentObject`. Token lives in the Keychain;
/// account snapshot is rehydrated on launch and after every OAuth.
@MainActor
final class AuthSession: ObservableObject {
    @Published private(set) var account: Account?
    @Published private(set) var isAuthenticated: Bool = false
    @Published private(set) var isWorking: Bool = false
    @Published var lastError: String?

    private let oauth = OAuthClient()
    private var token: String?

    init() {
        if let stored = KeychainStore.read() {
            self.token = stored
            self.isAuthenticated = true
            Task { await self.refresh() }
        }
    }

    /// Initiates the full OAuth flow for the given provider. On success
    /// the published `account` is set and `isAuthenticated` flips to
    /// true so the 4th tab unlocks its content.
    func signIn(with provider: OAuthClient.Provider) async {
        guard !isWorking else { return }
        isWorking = true
        lastError = nil
        defer { isWorking = false }

        let pkce = PKCE.make()
        do {
            let code = try await oauth.startFlow(provider: provider, pkce: pkce)
            let resp: ExchangeResponse = try await APIClient(token: nil)
                .post("/api/mobile/auth/exchange", body: [
                    "code":          code,
                    "code_verifier": pkce.verifier,
                ])
            try KeychainStore.save(token: resp.token)
            self.token = resp.token
            self.account = resp.account
            self.isAuthenticated = true
        } catch let e as OAuthClient.AuthError {
            // Silent cancellation: the user tapped "Cancel" in the
            // browser — no error banner needed.
            if case .cancelled = e { return }
            lastError = e.errorDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Re-fetches the account from the server. Called on launch when a
    /// token is found in the Keychain, and on pull-to-refresh in the
    /// account screen.
    func refresh() async {
        guard let token else { return }
        do {
            let me: MeResponse = try await APIClient(token: token).get("/api/account/me")
            if let acct = me.account {
                self.account = acct
                self.isAuthenticated = true
            } else {
                // Token is no longer valid server-side.
                signOutLocal()
            }
        } catch let APIClient.APIError.http(401, _) {
            signOutLocal()
        } catch {
            // Network / decoding error — keep the cached account; the
            // user will retry on next pull-to-refresh.
        }
    }

    func signOut() {
        signOutLocal()
    }

    private func signOutLocal() {
        KeychainStore.clear()
        token = nil
        account = nil
        isAuthenticated = false
    }
}
