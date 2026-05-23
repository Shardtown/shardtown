import Foundation
import CryptoKit

/// PKCE (RFC 7636) helpers for the mobile OAuth flow.
///
/// We generate a 32-byte random verifier (43 base64url chars) and its
/// SHA-256 challenge. The verifier never leaves the app until the
/// /api/mobile/auth/exchange call; the challenge is the only thing the
/// OAuth provider sees, so even an attacker who somehow captured the
/// returned auth code (via a malicious app on the device, OS-level
/// logging, etc.) can't redeem it without the verifier.
struct PKCE {
    let verifier: String
    let challenge: String

    static func make() -> PKCE {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verifier = Data(bytes).base64URLEncoded
        let hash = SHA256.hash(data: Data(verifier.utf8))
        let challenge = Data(hash).base64URLEncoded
        return PKCE(verifier: verifier, challenge: challenge)
    }
}

extension Data {
    /// base64url without padding, per RFC 7636 §4.2.
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
