import SwiftUI

/// Réplique exacte du fond du site (BackgroundGradientAnimation + top wash).
/// - Fond linéaire navy → black
/// - 5 blobs radial blue qui dérivent lentement (screen blend mode)
/// - Top wash radial indigo/purple ancré en haut
/// - Opacity globale 60% pour rester subtil
struct SiteBackground: View {
    @State private var phase: CGFloat = 0

    // Couleurs exactes du site (status-app/src/components/layout/AppLayout.tsx)
    // Base un poil plus claire pour que le navy soit perceptible sur OLED.
    private let bgStart  = Color(red: 13/255, green: 20/255, blue: 40/255)  // #0d1428
    private let bgEnd    = Color(red: 4/255,  green: 6/255,  blue: 14/255)  // #04060e
    private let blob1    = Color(red: 96/255,  green: 165/255, blue: 250/255) // #60a5fa
    private let blob2    = Color(red: 59/255,  green: 130/255, blue: 246/255) // #3b82f6
    private let blob3    = Color(red: 37/255,  green: 99/255,  blue: 235/255) // #2563eb
    private let blob4    = Color(red: 29/255,  green: 78/255,  blue: 216/255) // #1d4ed8
    private let blob5    = Color(red: 30/255,  green: 58/255,  blue: 138/255) // #1e3a8a
    private let washTop  = Color(red: 91/255,  green: 109/255, blue: 255/255) // #5b6dff
    private let washMid  = Color(red: 139/255, green: 92/255,  blue: 246/255) // #8b5cf6

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let s = max(w, h)

            ZStack {
                // 1) Base linear navy → black
                LinearGradient(
                    colors: [bgStart, bgEnd],
                    startPoint: .top, endPoint: .bottom
                )

                // 2) Top wash radial indigo/purple ancré au top center (boostée)
                RadialGradient(
                    gradient: Gradient(stops: [
                        .init(color: washTop.opacity(0.75), location: 0),
                        .init(color: washMid.opacity(0.40), location: 0.35),
                        .init(color: washTop.opacity(0.18), location: 0.60),
                        .init(color: .clear, location: 1),
                    ]),
                    center: UnitPoint(x: 0.5, y: 0),
                    startRadius: 0,
                    endRadius: h * 1.1
                )

                // 3) Blobs animés (screen blend pour cumul lumineux)
                ZStack {
                    blob(blob1, size: s * 0.9, opacity: 0.60,
                         x: -s * 0.15 + sin(phase * 2 * .pi) * 80,
                         y:  s * 0.10 + cos(phase * 2 * .pi) * 60)
                    blob(blob2, size: s * 0.8, opacity: 0.55,
                         x:  s * 0.20 + cos(phase * 2 * .pi * 0.8) * 100,
                         y:  s * 0.25 + sin(phase * 2 * .pi * 0.7) * 80)
                    blob(blob3, size: s * 0.75, opacity: 0.50,
                         x:  s * 0.05 + sin(phase * 2 * .pi * 0.6) * 120,
                         y:  s * 0.45 + cos(phase * 2 * .pi * 0.5) * 100)
                    blob(blob4, size: s * 0.7, opacity: 0.45,
                         x: -s * 0.10 + cos(phase * 2 * .pi * 0.9) * 90,
                         y:  s * 0.55 + sin(phase * 2 * .pi * 0.6) * 70)
                    blob(blob5, size: s * 0.85, opacity: 0.40,
                         x:  s * 0.15 + sin(phase * 2 * .pi * 0.4) * 110,
                         y:  s * 0.70 + cos(phase * 2 * .pi * 0.8) * 90)
                }
                .blendMode(.screen)
                .opacity(1.0)
            }
            .onAppear {
                withAnimation(.linear(duration: 30).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
        }
        .ignoresSafeArea()
        .drawingGroup() // perf — Metal render
    }

    private func blob(_ color: Color, size: CGFloat, opacity: Double, x: CGFloat, y: CGFloat) -> some View {
        Circle()
            .fill(
                RadialGradient(
                    gradient: Gradient(stops: [
                        .init(color: color.opacity(opacity), location: 0),
                        .init(color: color.opacity(opacity * 0.4), location: 0.5),
                        .init(color: .clear, location: 1)
                    ]),
                    center: .center, startRadius: 0, endRadius: size / 2
                )
            )
            .frame(width: size, height: size)
            .position(x: x, y: y)
            .blur(radius: 40)
    }
}

#Preview {
    SiteBackground()
}

// MARK: - Modifier pratique : applique le fond site derrière n'importe quelle vue

struct SiteBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        ZStack {
            SiteBackground()
            content
                .scrollContentBackground(.hidden)
        }
    }
}

extension View {
    /// Applique le fond Shardtown (navy + wash + blobs) derrière cette vue.
    /// À utiliser sur le contenu racine de chaque onglet pour que le fond
    /// soit visible (les NavigationStacks masquent sinon le fond global).
    func siteBackground() -> some View {
        modifier(SiteBackgroundModifier())
    }
}
