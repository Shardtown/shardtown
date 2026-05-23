import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthSession

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                Spacer().frame(height: 24)

                VStack(spacing: 16) {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LinearGradient(
                            colors: [.indigo, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 96, height: 96)
                        .overlay(
                            Text("S")
                                .font(.system(size: 48, weight: .black, design: .rounded))
                                .foregroundStyle(.white)
                        )
                    Text("Shardtown").font(.title.bold())
                    Text("Connecte-toi pour gérer ton compte\net suivre tes serveurs depuis l'app.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    ForEach(OAuthClient.Provider.allCases) { provider in
                        ProviderButton(provider: provider, disabled: auth.isWorking) {
                            Task { await auth.signIn(with: provider) }
                        }
                    }
                }
                .padding(.horizontal, 24)

                if let err = auth.lastError {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()

                Text("En te connectant, tu acceptes les Conditions\nd'utilisation et la Politique de confidentialité.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 32)
                    .padding(.horizontal, 32)
            }
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Mon compte")
        .navigationBarTitleDisplayMode(.large)
    }
}

private struct ProviderButton: View {
    let provider: OAuthClient.Provider
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: iconName)
                    .font(.title3)
                    .frame(width: 22)
                Text("Continuer avec \(provider.label)")
                    .font(.body.weight(.semibold))
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(background)
            .foregroundStyle(foreground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(border, lineWidth: 1)
            )
        }
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }

    private var iconName: String {
        switch provider {
        case .discord: return "gamecontroller.fill"
        case .google:  return "g.circle.fill"
        case .github:  return "chevron.left.forwardslash.chevron.right"
        }
    }
    private var background: Color {
        switch provider {
        case .discord: return Color(red: 0.345, green: 0.396, blue: 0.949)
        case .google:  return .white
        case .github:  return Color(red: 0.12, green: 0.14, blue: 0.16)
        }
    }
    private var foreground: Color {
        switch provider {
        case .discord: return .white
        case .google:  return .black
        case .github:  return .white
        }
    }
    private var border: Color {
        switch provider {
        case .google:  return .black.opacity(0.1)
        default:       return .clear
        }
    }
}

#Preview {
    NavigationStack {
        LoginView()
            .environmentObject(AuthSession())
    }
}
