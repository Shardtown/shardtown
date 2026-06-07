import SwiftUI

// MARK: - Bouton circulaire central (NordVPN "Quick Connect" style)

struct CircularHeroButton: View {
    var isActive: Bool
    var isLoading: Bool = false
    var action: () -> Void

    @State private var pulse = false

    var body: some View {
        Button(action: action) {
            ZStack {
                // Anneau de glow externe (pulse quand actif)
                if isActive {
                    Circle()
                        .stroke(ShardtownTheme.statusOk.opacity(pulse ? 0 : 0.4), lineWidth: 6)
                        .frame(width: pulse ? 230 : 180, height: pulse ? 230 : 180)
                        .animation(.easeOut(duration: 2).repeatForever(autoreverses: false), value: pulse)
                }

                // Cercle principal
                Circle()
                    .fill(buttonGradient)
                    .frame(width: 180, height: 180)
                    .overlay(
                        Circle().stroke(Color.white.opacity(0.18), lineWidth: 1.5)
                    )
                    .shadow(color: shadowColor.opacity(0.55), radius: 40, x: 0, y: 16)
                    .shadow(color: shadowColor.opacity(0.35), radius: 12, x: 0, y: 4)

                // Cercle inner highlight
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(0.4), .clear],
                            startPoint: .top, endPoint: .center
                        ),
                        lineWidth: 1
                    )
                    .frame(width: 178, height: 178)

                // Content
                VStack(spacing: 10) {
                    if isLoading {
                        ProgressView().tint(.white).scaleEffect(1.4)
                    } else {
                        Image(systemName: isActive ? "stop.fill" : "power")
                            .font(.system(size: 56, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    Text(isLoading ? "..." : (isActive ? "STOP" : "START"))
                        .font(.system(size: 13, weight: .bold))
                        .kerning(3)
                        .foregroundStyle(.white.opacity(0.92))
                }
            }
        }
        .buttonStyle(PressedScaleButtonStyle())
        .onAppear { if isActive { pulse = true } }
        .onChange(of: isActive) { _, new in pulse = new }
    }

    private var buttonGradient: LinearGradient {
        if isActive {
            LinearGradient(
                colors: [
                    Color(red: 0.95, green: 0.30, blue: 0.45),
                    Color(red: 0.85, green: 0.18, blue: 0.35)
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        } else {
            LinearGradient(
                colors: [
                    ShardtownTheme.accentLight,
                    ShardtownTheme.accent,
                    ShardtownTheme.accentDeep
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }

    private var shadowColor: Color {
        isActive ? Color(red: 0.95, green: 0.30, blue: 0.45) : ShardtownTheme.accent
    }
}

struct PressedScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Status pill (top of screen)

struct StatusPill: View {
    var label: String
    var color: Color
    var pulses: Bool = false

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if pulses {
                    Circle().fill(color.opacity(pulse ? 0 : 0.4))
                        .frame(width: pulse ? 22 : 12, height: pulse ? 22 : 12)
                        .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false), value: pulse)
                }
                Circle().fill(color).frame(width: 8, height: 8)
            }
            .frame(width: 22, height: 22)

            Text(label.uppercased())
                .font(.system(size: 12, weight: .bold))
                .kerning(1.5)
                .foregroundStyle(.white.opacity(0.92))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Capsule().fill(.ultraThinMaterial)
        )
        .overlay(
            Capsule().stroke(color.opacity(0.3), lineWidth: 1)
        )
        .onAppear { if pulses { pulse = true } }
    }
}

// MARK: - Big elevated card

struct ElevatedCard<Content: View>: View {
    var padding: CGFloat = 22
    var radius: CGFloat = 26
    var gradient: LinearGradient? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(ShardtownTheme.bg1)
                    if let gradient {
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .fill(gradient)
                    }
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.4), radius: 30, x: 0, y: 14)
    }
}

// MARK: - Big CTA capsule (gradient)

struct PrimaryCTA: View {
    var label: String
    var icon: String? = nil
    var tone: Tone = .brand
    var action: () -> Void

    enum Tone { case brand, danger, success, neutral

        var gradient: LinearGradient {
            switch self {
            case .brand:
                LinearGradient(
                    colors: [ShardtownTheme.accentLight, ShardtownTheme.accent, ShardtownTheme.accentDeep],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            case .danger:
                LinearGradient(
                    colors: [Color(red: 0.95, green: 0.32, blue: 0.45), Color(red: 0.78, green: 0.18, blue: 0.33)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            case .success:
                LinearGradient(
                    colors: [Color(red: 0.20, green: 0.78, blue: 0.50), Color(red: 0.10, green: 0.60, blue: 0.42)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            case .neutral:
                LinearGradient(
                    colors: [ShardtownTheme.bg2, ShardtownTheme.bg1],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }

        var shadow: Color {
            switch self {
            case .brand: ShardtownTheme.accent
            case .danger: Color(red: 0.95, green: 0.32, blue: 0.45)
            case .success: Color(red: 0.20, green: 0.78, blue: 0.50)
            case .neutral: .black
            }
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .bold))
                }
                Text(label)
                    .font(.system(size: 16, weight: .bold))
                    .kerning(0.4)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(tone.gradient)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: tone.shadow.opacity(0.4), radius: 20, x: 0, y: 10)
        }
        .buttonStyle(PressedScaleButtonStyle())
    }
}

// MARK: - Tool tile (bold, type Tinder card mini)

struct ToolTile: View {
    var icon: String
    var name: String
    var subtitle: String
    var accent: Color
    var isLive: Bool = false
    var locked: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [accent, accent.opacity(0.7)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 52, height: 52)
                            .shadow(color: accent.opacity(0.45), radius: 12, x: 0, y: 6)
                        Image(systemName: icon)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    if isLive {
                        Text("LIVE")
                            .font(.system(size: 10, weight: .heavy))
                            .kerning(0.8)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(ShardtownTheme.statusOk)
                            .clipShape(Capsule())
                    } else if locked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                }
                Spacer(minLength: 12)
                Text(name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(height: 170, alignment: .topLeading)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(ShardtownTheme.bg1)
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [accent.opacity(0.18), .clear],
                                startPoint: .topTrailing, endPoint: .bottomLeading
                            )
                        )
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.35), radius: 18, x: 0, y: 10)
            .opacity(locked ? 0.55 : 1)
        }
        .buttonStyle(PressedScaleButtonStyle())
        .disabled(locked)
    }
}

// MARK: - Server card (Tinder-style, big)

struct ServerCard: View {
    var name: String
    var host: String
    var port: UInt16
    var motd: String
    var isLive: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            isLive
                            ? LinearGradient(colors: [ShardtownTheme.statusOk, ShardtownTheme.statusOk.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing)
                            : LinearGradient(colors: [ShardtownTheme.bg2, ShardtownTheme.bg1], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                        .frame(width: 56, height: 56)
                    Image(systemName: isLive ? "antenna.radiowaves.left.and.right" : "server.rack")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white.opacity(isLive ? 1 : 0.55))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                    Text("\(host):\(String(port))")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.45))
                    if !motd.isEmpty {
                        Text(motd)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.65))
                            .lineLimit(1)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.3))
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(ShardtownTheme.bg1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(isLive ? ShardtownTheme.statusOk.opacity(0.4) : Color.white.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: 6)
        }
        .buttonStyle(PressedScaleButtonStyle())
    }
}

// MARK: - Section header bold

struct BoldSectionHeader: View {
    var title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .heavy))
                .kerning(1.8)
                .foregroundStyle(.white.opacity(0.45))
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
    }
}
