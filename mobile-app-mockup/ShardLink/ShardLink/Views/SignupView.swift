import SwiftUI

struct SignupView: View {
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var pseudo = ""
    @State private var password = ""
    @State private var passwordConfirm = ""
    @State private var acceptsTerms = false
    @State private var isWorking = false
    @FocusState private var focused: Field?

    enum Field { case email, pseudo, password, confirm }

    private var passwordOK: Bool { password.count >= 8 }
    private var passwordsMatch: Bool { !password.isEmpty && password == passwordConfirm }
    private var emailLooksOK: Bool { email.contains("@") && email.contains(".") }
    private var pseudoOK: Bool {
        let p = pseudo.trimmed
        return p.count >= 3 && p.count <= 24
    }
    private var canSubmit: Bool {
        emailLooksOK && pseudoOK && passwordOK && passwordsMatch && acceptsTerms && !isWorking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header.padding(.top, 16)
                    socialAuth
                    orDivider
                    formCard
                    requirementsList
                    termsCheckbox
                    primaryAction
                    errorView
                }
                .padding(20)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Créer un compte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 30, height: 30)
                    }
                    .glassEffect(.regular.interactive(), in: Circle())
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image("ShardtownLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 10, x: 0, y: 6)
            VStack(spacing: 4) {
                Text("Bienvenue chez Shardtown")
                    .font(.title3.bold())
                Text("Ton compte te donne accès à tous nos outils.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var formCard: some View {
        VStack(spacing: 0) {
            row(icon: "envelope.fill") {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                    .focused($focused, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focused = .pseudo }
            }
            Divider().padding(.leading, 50)
            row(icon: "person.fill") {
                TextField("Pseudo (3-24 caractères)", text: $pseudo)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .pseudo)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }
            }
            Divider().padding(.leading, 50)
            row(icon: "lock.fill") {
                SecureField("Mot de passe (8+ caractères)", text: $password)
                    .focused($focused, equals: .password)
                    .submitLabel(.next)
                    .onSubmit { focused = .confirm }
            }
            Divider().padding(.leading, 50)
            row(icon: "lock.shield.fill") {
                SecureField("Confirme le mot de passe", text: $passwordConfirm)
                    .focused($focused, equals: .confirm)
                    .submitLabel(.go)
                    .onSubmit { if canSubmit { Task { await submit() } } }
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func row<Content: View>(icon: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 22)
            content()
        }
        .padding(16)
    }

    private var requirementsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            requirement(emailLooksOK, "Email valide")
            requirement(pseudoOK, "Pseudo entre 3 et 24 caractères")
            requirement(passwordOK, "Mot de passe ≥ 8 caractères")
            requirement(passwordsMatch, "Les mots de passe correspondent")
        }
        .padding(.horizontal, 4)
    }

    private func requirement(_ ok: Bool, _ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: ok ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(ok ? .green : .secondary)
                .font(.body)
            Text(text)
                .font(.footnote)
                .foregroundStyle(ok ? .primary : .secondary)
        }
    }

    private var termsCheckbox: some View {
        Toggle(isOn: $acceptsTerms) {
            Text("J'accepte les **Conditions d'utilisation** et la **Politique de confidentialité** de Shardtown.")
                .foregroundStyle(.secondary)
        }
        .font(.footnote)
        .tint(.accentColor)
        .padding(.horizontal, 4)
    }

    private var primaryAction: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 8) {
                if isWorking {
                    ProgressView().tint(.white)
                } else {
                    Text("Créer mon compte")
                        .font(.body.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .glassEffect(.regular.tint(canSubmit ? .accentColor : .gray).interactive(), in: Capsule())
        .disabled(!canSubmit)
    }

    @ViewBuilder
    private var errorView: some View {
        if let err = session.lastError {
            Label(err, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color.red.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    // MARK: - Auth sociale

    private var socialAuth: some View {
        VStack(spacing: 10) {
            Button { Task { await runOAuth(.google) } } label: {
                socialButtonLabel(icon: "g.circle.fill", text: "S'inscrire avec Google", color: .red)
            }
            .glassEffect(.regular.interactive(), in: Capsule())

            Button { Task { await runOAuth(.github) } } label: {
                socialButtonLabel(icon: "chevron.left.forwardslash.chevron.right", text: "S'inscrire avec GitHub", color: .primary)
            }
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .disabled(isWorking)
    }

    private func socialButtonLabel(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.body.weight(.semibold))
                .foregroundStyle(color)
                .frame(width: 22)
            Text(text)
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    private var orDivider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Color(.separator)).frame(height: 0.5)
            Text("OU")
                .font(.caption2.weight(.bold))
                .kerning(1.4)
                .foregroundStyle(.tertiary)
            Rectangle().fill(Color(.separator)).frame(height: 0.5)
        }
    }

    private func runOAuth(_ provider: OAuthService.Provider) async {
        isWorking = true
        focused = nil
        await session.signInWithOAuth(provider)
        isWorking = false
        if session.currentAccount != nil { dismiss() }
    }

    private func submit() async {
        isWorking = true
        focused = nil
        await session.signup(email: email.trimmed, pseudo: pseudo.trimmed, password: password)
        isWorking = false
        if session.currentAccount != nil {
            dismiss()
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

#Preview {
    SignupView()
        .environmentObject(SessionStore())
}
