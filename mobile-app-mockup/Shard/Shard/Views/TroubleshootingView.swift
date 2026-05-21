import SwiftUI

struct TroubleshootingView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Problèmes fréquents") {
                    FaqRow(
                        question: "Le bot ne donne pas le rôle vérifié",
                        answer: "Le rôle du bot doit être placé au-dessus du rôle vérifié dans Paramètres serveur → Rôles. Discord refuse les actions sur des rôles supérieurs au sien."
                    )
                    FaqRow(
                        question: "Le captcha ne s'affiche pas dans le salon",
                        answer: "Vérifie que le bot a les permissions « Voir le salon », « Envoyer des messages » et « Joindre des fichiers » dans le salon de vérification. Une permission refusée fait tomber l'action en silence."
                    )
                    FaqRow(
                        question: "Le règlement apparaît vide pour mes membres anglophones",
                        answer: "Tu dois remplir les deux onglets (Français + English) dans Shard → Règlement. Le bot affiche la version qui correspond à la langue choisie dans Général ; si l'autre est vide, elle est vide."
                    )
                    FaqRow(
                        question: "Trop de membres sont auto-kick",
                        answer: "Ton captcha est probablement trop difficile. Repasse le bruit en « Moyen », garde 6 chiffres et 3 essais. Surveille la liste Logs pour vérifier le ratio vrais membres / bots."
                    )
                    FaqRow(
                        question: "Le bot apparaît hors-ligne",
                        answer: "Vérifie l'état de la plateforme sur shardtwn.fr/status. Si tout est vert mais que le bot reste hors-ligne sur ton serveur, retire-le puis ré-invite-le depuis le dashboard."
                    )
                }

                Section {
                    Link(destination: URL(string: "https://shardtwn.fr/status")!) {
                        LinkRow(icon: "waveform.path.ecg", title: "Page Statut", subtitle: "État en temps réel de tous les services")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/assistant")!) {
                        LinkRow(icon: "sparkles", title: "Samia (assistante IA)", subtitle: "Pose ta question, réponse instantanée")
                    }
                    Link(destination: URL(string: "mailto:contact@shardtwn.fr")!) {
                        LinkRow(icon: "envelope", title: "contact@shardtwn.fr", subtitle: "Support humain pour les cas bloquants")
                    }
                } header: {
                    Text("Toujours bloqué ?")
                } footer: {
                    Text("Décris ton problème avec le nom du serveur, le module concerné et une capture si possible — ça fait gagner un aller-retour.")
                }
            }
            .navigationTitle("Dépannage")
        }
    }
}

private struct FaqRow: View {
    let question: String
    let answer: String
    @State private var expanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            Text(answer)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        } label: {
            Text(question)
                .font(.body)
                .foregroundStyle(.primary)
        }
    }
}

private struct LinkRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.indigo)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "arrow.up.right.square")
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    TroubleshootingView()
}
