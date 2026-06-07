import SwiftUI

/// Aurora animée — réplique l'AuroraBackground.tsx du site.
/// 3 blobs flous indigo/purple/blue qui dérivent en loop 22-32s.
struct AuroraBackground: View {
    enum Tone {
        case brand    // indigo/purple/blue (default)
        case ok       // green/blue
        case amber

        var colors: (Color, Color, Color) {
            switch self {
            case .brand:
                return (
                    Color(red: 0.357, green: 0.427, blue: 1.0),    // #5b6dff
                    Color(red: 0.545, green: 0.361, blue: 0.965),  // #8b5cf6
                    Color(red: 0.231, green: 0.510, blue: 0.965)   // #3b82f6
                )
            case .ok:
                return (
                    Color(red: 0.063, green: 0.725, blue: 0.506),
                    Color(red: 0.231, green: 0.510, blue: 0.965),
                    Color(red: 0.376, green: 0.647, blue: 0.980)
                )
            case .amber:
                return (
                    Color(red: 0.984, green: 0.749, blue: 0.141),
                    Color(red: 0.973, green: 0.443, blue: 0.443),
                    Color(red: 0.659, green: 0.333, blue: 0.969)
                )
            }
        }
    }

    var tone: Tone = .brand

    @State private var animA = false
    @State private var animB = false
    @State private var animC = false

    var body: some View {
        let (cA, cB, cC) = tone.colors
        GeometryReader { geo in
            let s = max(geo.size.width, geo.size.height) * 1.4

            ZStack {
                ShardtownTheme.bg

                blob(color: cA, size: s, opacity: 0.55)
                    .offset(x: animA ? s * 0.18 : -s * 0.10,
                            y: animA ? -s * 0.05 : -s * 0.20)
                    .rotationEffect(.degrees(animA ? 40 : 0))

                blob(color: cB, size: s * 0.9, opacity: 0.45)
                    .offset(x: animB ? -s * 0.16 : s * 0.10,
                            y: animB ? -s * 0.10 : s * 0.30)
                    .rotationEffect(.degrees(animB ? -50 : 0))

                blob(color: cC, size: s * 0.8, opacity: 0.38)
                    .scaleEffect(animC ? 1.15 : 1)
                    .offset(x: animC ? -s * 0.10 : 0,
                            y: animC ? s * 0.10 : 0)

                // Grain texture (~150 dots) — donne le bruit photo subtil du site
                GrainOverlay()
                    .opacity(0.15)
                    .blendMode(.overlay)
                    .allowsHitTesting(false)
            }
            .compositingGroup()
            .drawingGroup()
            .onAppear {
                withAnimation(.easeInOut(duration: 22).repeatForever(autoreverses: true)) { animA = true }
                withAnimation(.easeInOut(duration: 28).repeatForever(autoreverses: true)) { animB = true }
                withAnimation(.easeInOut(duration: 32).repeatForever(autoreverses: true)) { animC = true }
            }
        }
        .ignoresSafeArea()
    }

    private func blob(color: Color, size: CGFloat, opacity: Double) -> some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [color.opacity(opacity), .clear],
                    center: .center, startRadius: 0, endRadius: size / 2
                )
            )
            .frame(width: size, height: size)
            .blur(radius: 80)
    }
}

/// Texture grain par dots dispersés (statique mais blendée).
private struct GrainOverlay: View {
    var body: some View {
        Canvas { ctx, size in
            var rng = SystemRandomNumberGenerator()
            let count = 1200
            for _ in 0..<count {
                let x = CGFloat.random(in: 0...size.width, using: &rng)
                let y = CGFloat.random(in: 0...size.height, using: &rng)
                let alpha = Double.random(in: 0.05...0.18, using: &rng)
                ctx.fill(
                    Path(ellipseIn: CGRect(x: x, y: y, width: 1, height: 1)),
                    with: .color(.white.opacity(alpha))
                )
            }
        }
    }
}

/// Modifier pratique : applique aurora derrière + masque scroll bg natif.
struct AuroraScreenModifier: ViewModifier {
    var tone: AuroraBackground.Tone = .brand

    func body(content: Content) -> some View {
        ZStack {
            AuroraBackground(tone: tone)
            content
                .scrollContentBackground(.hidden)
                .background(Color.clear)
        }
    }
}

extension View {
    /// Applique le fond aurora Shardtown derrière la vue.
    func shardtownBackground(tone: AuroraBackground.Tone = .brand) -> some View {
        modifier(AuroraScreenModifier(tone: tone))
    }
}
