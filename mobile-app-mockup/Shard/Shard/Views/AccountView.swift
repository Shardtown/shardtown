import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var auth: AuthSession
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            Group {
                if auth.isAuthenticated, let account = auth.account {
                    signedInList(account: account)
                } else if auth.isAuthenticated {
                    // Token in Keychain but profile not yet loaded.
                    ProgressView().controlSize(.large)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    LoginView()
                }
            }
            .navigationTitle(auth.isAuthenticated ? "Mon compte" : "Mon compte")
            .toolbar {
                if auth.isAuthenticated {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(role: .destructive) {
                            showSignOutConfirm = true
                        } label: {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .confirmationDialog(
                "Se déconnecter ?",
                isPresented: $showSignOutConfirm,
                titleVisibility: .visible
            ) {
                Button("Se déconnecter", role: .destructive) { auth.signOut() }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Tu devras te reconnecter pour accéder à ton compte.")
            }
        }
    }

    private func signedInList(account: Account) -> some View {
        List {
            Section {
                HStack(spacing: 14) {
                    AsyncImage(url: account.discordAvatarURL) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        ZStack {
                            Circle().fill(.indigo.opacity(0.2))
                            Text(initials(account.displayName))
                                .font(.headline.bold())
                                .foregroundStyle(.indigo)
                        }
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(Circle())

                    VStack(alignment: .leading, spacing: 4) {
                        Text(account.displayName).font(.title3.bold())
                        if let email = account.email {
                            Text(email).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            Section("Comptes liés") {
                LinkRow(icon: "gamecontroller", label: "Discord",
                        value: account.discord_username,
                        linked: account.discord_id != nil)
                LinkRow(icon: "g.circle", label: "Google",
                        value: account.oauth_google_email,
                        linked: account.oauth_google_id != nil)
                LinkRow(icon: "chevron.left.forwardslash.chevron.right",
                        label: "GitHub",
                        value: account.oauth_github_username,
                        linked: account.oauth_github_id != nil)
            }

            Section("Raccourcis") {
                Link(destination: URL(string: "https://shardtwn.fr/dashboard")!) {
                    ExternalRow(icon: "slider.horizontal.3", title: "Dashboard", subtitle: "Configurer le bot")
                }
                Link(destination: URL(string: "https://shardtwn.fr/account")!) {
                    ExternalRow(icon: "person.crop.circle", title: "Compte web", subtitle: "Sessions, passkeys, sécurité")
                }
                Link(destination: URL(string: "https://shardtwn.fr/premium")!) {
                    ExternalRow(icon: "crown", title: "Premium", subtitle: "Plans et fonctionnalités")
                }
            }
        }
        .refreshable { await auth.refresh() }
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

private struct LinkRow: View {
    let icon: String
    let label: String
    let value: String?
    let linked: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).frame(width: 28).foregroundStyle(.indigo)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.body)
                if let v = value, !v.isEmpty {
                    Text(v).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(linked ? "Lié" : "Non lié")
                .font(.caption.weight(.semibold))
                .foregroundStyle(linked ? .green : .secondary)
        }
    }
}

private struct ExternalRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.title3).foregroundStyle(.indigo).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "arrow.up.right.square").foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    AccountView().environmentObject(AuthSession())
}
