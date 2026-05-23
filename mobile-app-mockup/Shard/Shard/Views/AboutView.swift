import SwiftUI

struct AboutView: View {
    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 12) {
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
                        Text("Shard").font(.title.bold())
                        Text("Bot Discord tout-en-un")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Version \(version)")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowBackground(Color.clear)
                }

                Section("Le projet") {
                    Text("Shard est le bot Discord développé par Shardtown, un studio basé en France. Sécurité (captcha, anti-raid, modération automatique) et Communauté (niveaux, économie, tickets, sondages, giveaways, anniversaires) — deux modules dans un seul bot, configurables depuis un dashboard web unique.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section("Liens") {
                    Link(destination: URL(string: "https://shardtwn.fr")!) {
                        LinkRow(icon: "globe", title: "shardtwn.fr", subtitle: "Site officiel")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/wiki")!) {
                        LinkRow(icon: "book", title: "Wiki", subtitle: "Documentation complète")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/premium")!) {
                        LinkRow(icon: "crown", title: "Premium", subtitle: "Tarifs et comparatif")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/status")!) {
                        LinkRow(icon: "waveform.path.ecg", title: "Statut", subtitle: "État des services")
                    }
                }

                Section("Légal") {
                    Link(destination: URL(string: "https://shardtwn.fr/terms")!) {
                        LinkRow(icon: "doc.text", title: "Conditions générales", subtitle: nil)
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/privacy")!) {
                        LinkRow(icon: "hand.raised", title: "Politique de confidentialité", subtitle: nil)
                    }
                    Link(destination: URL(string: "mailto:contact@shardtwn.fr")!) {
                        LinkRow(icon: "envelope", title: "contact@shardtwn.fr", subtitle: nil)
                    }
                }

                Section {
                    Text("© 2026 Shardtown. Tous droits réservés.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("À propos")
        }
    }
}

private struct LinkRow: View {
    let icon: String
    let title: String
    let subtitle: String?

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.indigo)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "arrow.up.right.square")
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    AboutView()
}
