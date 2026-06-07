import Foundation
import AuthenticationServices
import UIKit

/// Authentification par clé d'accès (Passkey / WebAuthn).
///
/// Flow :
/// 1. App appelle `/api/account/passkey/auth-begin` → reçoit un challenge
///    (PublicKeyCredentialRequestOptions).
/// 2. iOS demande Face ID / Touch ID via `ASAuthorizationPlatformPublicKeyCredentialProvider`.
/// 3. App envoie l'assertion signée à `/api/account/passkey/auth-complete`.
/// 4. Serveur vérifie la signature → ouvre la session cookie `sgid`.
///
/// ⚠️ Le serveur doit publier `https://shardtwn.fr/.well-known/apple-app-site-association`
/// avec la section `webcredentials` contenant le team-id + bundle-id de l'app
/// pour que iOS autorise l'usage de la `rpId = shardtwn.fr` côté client.
@MainActor
final class PasskeyService: NSObject {

    enum PasskeyError: LocalizedError {
        case cancelled
        case unsupported
        case server(String)
        case decoding(String)
        var errorDescription: String? {
            switch self {
            case .cancelled: nil
            case .unsupported: "Les clés d'accès ne sont pas supportées sur ce device."
            case .server(let m): m
            case .decoding(let m): "Format inattendu : \(m)"
            }
        }
    }

    /// Identité de la Relying Party (= le domaine).
    private let relyingPartyIdentifier = "shardtwn.fr"

    /// Lance le flow d'authentification par passkey existante.
    func signIn() async throws {
        // 1) Récupérer le challenge serveur
        let beginURL = AuthAPI.baseURL.appendingPathComponent("/api/account/passkey/auth-begin")
        var req = URLRequest(url: beginURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = "{}".data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let msg = String(data: data, encoding: .utf8) ?? "Échec d'initialisation"
            throw PasskeyError.server(msg)
        }

        let begin: AuthBeginResponse
        do {
            begin = try JSONDecoder().decode(AuthBeginResponse.self, from: data)
        } catch {
            throw PasskeyError.decoding(error.localizedDescription)
        }

        guard let challengeData = Data(base64URLEncoded: begin.challenge) else {
            throw PasskeyError.decoding("challenge invalide")
        }

        // 2) Demander l'assertion via Face ID
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
            relyingPartyIdentifier: relyingPartyIdentifier
        )
        let request = provider.createCredentialAssertionRequest(challenge: challengeData)
        if let allowed = begin.allowCredentials {
            request.allowedCredentials = allowed.compactMap { c in
                Data(base64URLEncoded: c.id).map {
                    ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
                }
            }
        }

        let assertion: ASAuthorizationPlatformPublicKeyCredentialAssertion = try await withCheckedThrowingContinuation { cont in
            let ctrl = ASAuthorizationController(authorizationRequests: [request])
            let delegate = PasskeyDelegate(continuation: cont)
            ctrl.delegate = delegate
            ctrl.presentationContextProvider = delegate
            // Garde le delegate vivant jusqu'à la fin du flow
            objc_setAssociatedObject(ctrl, &PasskeyDelegate.assocKey, delegate, .OBJC_ASSOCIATION_RETAIN)
            ctrl.performRequests()
        }

        // 3) Envoyer l'assertion au serveur pour vérification + ouverture session
        let completeURL = AuthAPI.baseURL.appendingPathComponent("/api/account/passkey/auth-complete")
        var creq = URLRequest(url: completeURL)
        creq.httpMethod = "POST"
        creq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        creq.setValue("application/json", forHTTPHeaderField: "Accept")

        let payload: [String: Any] = [
            "id": assertion.credentialID.base64URLEncoded,
            "rawId": assertion.credentialID.base64URLEncoded,
            "type": "public-key",
            "response": [
                "clientDataJSON": assertion.rawClientDataJSON.base64URLEncoded,
                "authenticatorData": assertion.rawAuthenticatorData.base64URLEncoded,
                "signature": assertion.signature.base64URLEncoded,
                "userHandle": assertion.userID?.base64URLEncoded ?? ""
            ]
        ]
        creq.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (cdata, cresp) = try await URLSession.shared.data(for: creq)
        guard let chttp = cresp as? HTTPURLResponse, (200..<300).contains(chttp.statusCode) else {
            let msg = String(data: cdata, encoding: .utf8) ?? "Échec de vérification"
            throw PasskeyError.server(msg)
        }
        // À ce stade le cookie session sgid est posé par le serveur, la
        // prochaine call à AuthAPI.me() retournera le compte authentifié.
    }
}

// MARK: - Réponses serveur

private struct AuthBeginResponse: Codable {
    let challenge: String
    let allowCredentials: [Cred]?
    struct Cred: Codable { let id: String; let type: String? }
}

// MARK: - Delegate ASAuthorizationController

private final class PasskeyDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    nonisolated(unsafe) static var assocKey: UInt8 = 0

    typealias Cont = CheckedContinuation<ASAuthorizationPlatformPublicKeyCredentialAssertion, Error>
    private var continuation: Cont?

    init(continuation: Cont) {
        self.continuation = continuation
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { continuation = nil }
        guard let cred = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            continuation?.resume(throwing: PasskeyService.PasskeyError.server("Réponse inattendue de l'authentificateur"))
            return
        }
        continuation?.resume(returning: cred)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { continuation = nil }
        let nsErr = error as NSError
        if nsErr.domain == ASAuthorizationError.errorDomain, nsErr.code == ASAuthorizationError.canceled.rawValue {
            continuation?.resume(throwing: PasskeyService.PasskeyError.cancelled)
        } else {
            continuation?.resume(throwing: PasskeyService.PasskeyError.server(error.localizedDescription))
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated { firstKeyWindowAnchor() }
    }
}

// MARK: - Base64URL helpers (WebAuthn)

extension Data {
    init?(base64URLEncoded s: String) {
        var str = s.replacingOccurrences(of: "-", with: "+")
                   .replacingOccurrences(of: "_", with: "/")
        while str.count % 4 != 0 { str.append("=") }
        guard let d = Data(base64Encoded: str) else { return nil }
        self = d
    }

    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
