import SwiftUI

struct LoginView: View {
    @EnvironmentObject var session: SessionStore

    @State private var identifier = ""
    @State private var password = ""
    @State private var showingSignup = false
    @State private var isWorking = false
    @FocusState private var focused: Field?

    enum Field { case identifier, password }

    private var canSubmit: Bool {
        !identifier.trimmed.isEmpty && password.count >= 1 && !isWorking
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                hero
                socialButtons
                divider
                formCard
                primaryAction
                errorView
                signupHook
                legal
            }
            .padding(.horizontal, 24)
            .padding(.top, 60)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .sheet(isPresented: $showingSignup) {
            SignupView()
        }
    }

    private var hero: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [ShardtownTheme.accent.opacity(0.35), .clear],
                            center: .center, startRadius: 0, endRadius: 100
                        )
                    )
                    .frame(width: 200, height: 200)
                    .blur(radius: 8)
                Image("ShardtownLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(color: .black.opacity(0.5), radius: 24, x: 0, y: 12)
            }

            VStack(spacing: 6) {
                Text("Connexion")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.white)
                Text("Accède à tous tes outils Shardtown")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .padding(.bottom, 8)
    }

    private var socialButtons: some View {
        VStack(spacing: 10) {
            socialButton(icon: "g.circle.fill", label: "Continuer avec Google", color: Color(red: 0.92, green: 0.27, blue: 0.21)) {
                Task { await runOAuth(.google) }
            }
            socialButton(icon: "chevron.left.forwardslash.chevron.right", label: "Continuer avec GitHub", color: .white) {
                Task { await runOAuth(.github) }
            }
            socialButton(icon: "person.badge.key.fill", label: "Clé d'accès", color: ShardtownTheme.accent) {
                Task { await runPasskey() }
            }
        }
        .disabled(isWorking)
    }

    private func socialButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(color)
                    .frame(width: 22)
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(ShardtownTheme.bg1)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(PressedScaleButtonStyle())
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
            Text("OU")
                .font(.system(size: 11, weight: .heavy))
                .kerning(1.8)
                .foregroundStyle(.white.opacity(0.35))
            Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
        }
        .padding(.vertical, 4)
    }

    private var formCard: some View {
        VStack(spacing: 12) {
            inputRow(icon: "envelope.fill", placeholder: "Email ou pseudo", text: $identifier, secure: false, field: .identifier, submitLabel: .next) {
                focused = .password
            }
            inputRow(icon: "lock.fill", placeholder: "Mot de passe", text: $password, secure: true, field: .password, submitLabel: .go) {
                if canSubmit { Task { await submit() } }
            }
        }
    }

    private func inputRow(
        icon: String,
        placeholder: String,
        text: Binding<String>,
        secure: Bool,
        field: Field,
        submitLabel: SubmitLabel,
        onSubmit: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white.opacity(0.45))
                .frame(width: 22)
            Group {
                if secure {
                    SecureField("", text: text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.3)))
                } else {
                    TextField("", text: text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.3)))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                }
            }
            .foregroundStyle(.white)
            .font(.system(size: 15, weight: .medium))
            .focused($focused, equals: field)
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(ShardtownTheme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(focused == field ? ShardtownTheme.accent.opacity(0.55) : Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private var primaryAction: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 8) {
                if isWorking {
                    ProgressView().tint(.white)
                } else {
                    Text("Se connecter")
                        .font(.system(size: 16, weight: .bold))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .bold))
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(
                canSubmit
                ? AnyShapeStyle(ShardtownTheme.accentGradient)
                : AnyShapeStyle(Color.white.opacity(0.08))
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: canSubmit ? ShardtownTheme.accent.opacity(0.4) : .clear, radius: 20, x: 0, y: 10)
        }
        .buttonStyle(PressedScaleButtonStyle())
        .disabled(!canSubmit)
    }

    @ViewBuilder
    private var errorView: some View {
        if let err = session.lastError {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                Text(err)
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(ShardtownTheme.statusErr)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(ShardtownTheme.statusErr.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(ShardtownTheme.statusErr.opacity(0.3), lineWidth: 1)
            )
        }
    }

    private var signupHook: some View {
        HStack(spacing: 4) {
            Text("Pas encore de compte ?")
                .foregroundStyle(.white.opacity(0.55))
            Button("Crée-en un") {
                showingSignup = true
            }
            .foregroundStyle(ShardtownTheme.accent)
            .fontWeight(.semibold)
        }
        .font(.system(size: 14))
        .padding(.top, 8)
    }

    private var legal: some View {
        Text("En te connectant tu acceptes nos Conditions et notre Politique de confidentialité.")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white.opacity(0.35))
            .multilineTextAlignment(.center)
            .lineSpacing(2)
            .padding(.top, 8)
    }

    private func submit() async {
        isWorking = true
        focused = nil
        await session.login(identifier: identifier.trimmed, password: password)
        isWorking = false
    }

    private func runOAuth(_ provider: OAuthService.Provider) async {
        isWorking = true
        focused = nil
        await session.signInWithOAuth(provider)
        isWorking = false
    }

    private func runPasskey() async {
        isWorking = true
        focused = nil
        await session.signInWithPasskey()
        isWorking = false
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

#Preview {
    LoginView()
        .environmentObject(SessionStore())
        .preferredColorScheme(.dark)
}
