import Foundation
import Security

/// Thin wrapper around the iOS Keychain Services for storing the
/// Shardtown Bearer token. We deliberately scope `accessible` to
/// `afterFirstUnlock` (not `whenUnlocked`) so that background refresh
/// after a reboot doesn't require the user to manually unlock — the
/// token is still protected by the device passcode.
enum KeychainStore {
    private static let service = "fr.shardtown.shard"
    private static let account = "auth_token"

    enum Failure: Error {
        case osStatus(OSStatus)
        case dataCorrupted
    }

    static func save(token: String) throws {
        guard let data = token.data(using: .utf8) else { throw Failure.dataCorrupted }

        let query: [String: Any] = [
            kSecClass as String:        kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String:    data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        if updateStatus != errSecItemNotFound { throw Failure.osStatus(updateStatus) }

        var addQuery = query
        addQuery[kSecValueData as String]      = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw Failure.osStatus(addStatus) }
    }

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String:        kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  account,
            kSecReturnData as String:   true,
            kSecMatchLimit as String:   kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String:        kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
