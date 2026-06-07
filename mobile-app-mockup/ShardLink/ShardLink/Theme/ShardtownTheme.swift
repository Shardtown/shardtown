import SwiftUI

/// Tokens DA Shardtown — alignés sur `status-app/src/index.css`.
/// Palette zinc dark + accent bleu gradient brand.
enum ShardtownTheme {

    // MARK: - Surfaces (zinc-950 ladder)

    static let bg          = Color(red: 0.039, green: 0.039, blue: 0.039)   // #0a0a0a
    static let bg1         = Color(red: 0.067, green: 0.067, blue: 0.067)   // #111
    static let bg2         = Color(red: 0.090, green: 0.090, blue: 0.090)   // #171717
    static let panel       = Color.white.opacity(0.025)
    static let panel2      = Color.white.opacity(0.055)
    static let border      = Color.white.opacity(0.06)
    static let borderStrong = Color.white.opacity(0.12)

    // MARK: - Texte

    static let text        = Color(red: 0.980, green: 0.980, blue: 0.980)
    static let textMut     = Color(red: 0.631, green: 0.631, blue: 0.647)
    static let textDim     = Color(red: 0.443, green: 0.443, blue: 0.478)
    static let textFaint   = Color(red: 0.322, green: 0.322, blue: 0.357)

    // MARK: - Brand (bleu gradient)

    static let accent      = Color(red: 0.231, green: 0.510, blue: 0.965)   // #3b82f6
    static let accentLight = Color(red: 0.376, green: 0.647, blue: 0.980)   // #60a5fa
    static let accentDeep  = Color(red: 0.114, green: 0.306, blue: 0.847)   // #1d4ed8

    static let accentGradient = LinearGradient(
        colors: [accentLight, accent, accentDeep],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // MARK: - Status

    static let statusOk    = Color(red: 0.063, green: 0.725, blue: 0.506)
    static let statusWarn  = Color(red: 0.984, green: 0.749, blue: 0.141)
    static let statusErr   = Color(red: 0.973, green: 0.443, blue: 0.443)
}

/// Couleur accent UIKit pour la TabBar et la NavBar (UIApplication setup).
extension Color {
    static let shardAccent: Color = ShardtownTheme.accent
}
