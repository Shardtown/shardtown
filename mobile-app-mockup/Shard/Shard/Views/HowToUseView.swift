import SwiftUI

struct HowToUseView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Step(number: 1,
                         title: "Invite Shard sur ton serveur",
                         body: "Connecte-toi à shardtwn.fr avec ton compte Discord, ouvre le Dashboard → Mes serveurs et clique sur « Inviter le bot ». Garde la case « Administrateur » cochée pour éviter les erreurs de permission.")
                    Step(number: 2,
                         title: "Configure la vérification",
                         body: "Dashboard Shard → onglet Général : choisis le salon de vérification (où le captcha s'affiche) et le rôle attribué aux membres validés. Place le rôle du bot au-dessus du rôle vérifié dans la hiérarchie Discord.")
                    Step(number: 3,
                         title: "Active les modules dont tu as besoin",
                         body: "Sécurité (captcha, anti-raid, automod, sanctions progressives) et Communauté (niveaux, économie, tickets, sondages, giveaways, anniversaires) sont indépendants — n'active que ce qui te concerne.")
                    Step(number: 4,
                         title: "Teste avec un compte secondaire",
                         body: "Rejoins ton serveur avec un compte test pour valider le flux : captcha → rôle vérifié → message de bienvenue → auto-rôle. Ajuste les paramètres jusqu'à ce que ça colle.")
                } header: {
                    Text("Démarrage rapide")
                } footer: {
                    Text("Toute la configuration se fait depuis le dashboard web — pas de commandes à apprendre.")
                }

                Section("Aller plus loin") {
                    Link(destination: URL(string: "https://shardtwn.fr/wiki")!) {
                        LinkRow(icon: "book", title: "Wiki complet", subtitle: "Documentation de chaque module")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/dashboard")!) {
                        LinkRow(icon: "slider.horizontal.3", title: "Dashboard", subtitle: "Configure le bot en quelques clics")
                    }
                    Link(destination: URL(string: "https://shardtwn.fr/premium")!) {
                        LinkRow(icon: "crown", title: "Premium", subtitle: "Repousser les limites du plan gratuit")
                    }
                }
            }
            .navigationTitle("Comment utiliser")
        }
    }
}

private struct Step: View {
    let number: Int
    let title: String
    let body: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(number)")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Circle().fill(.indigo))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(body).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
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
    HowToUseView()
}
