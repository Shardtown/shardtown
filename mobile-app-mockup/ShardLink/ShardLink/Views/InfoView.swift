import SwiftUI

struct InfoView: View {
    @EnvironmentObject var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                if let account = session.currentAccount {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.title)
                                .foregroundStyle(.tint)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(account.pseudo)
                                    .font(.headline)
                                if let email = account.email {
                                    Text(email)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if account.emailVerified == true {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(.green)
                                    .font(.title3)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Aide") {
                    NavigationLink {
                        HowToUseView()
                    } label: {
                        Label("Comment utiliser", systemImage: "book.fill")
                    }
                    NavigationLink {
                        TroubleshootingView()
                    } label: {
                        Label("Dépannage", systemImage: "wrench.adjustable.fill")
                    }
                    NavigationLink {
                        SupportView()
                    } label: {
                        Label("Support", systemImage: "lifepreserver.fill")
                    }
                }

                Section("À propos") {
                    NavigationLink {
                        AboutView()
                    } label: {
                        Label("À propos de ShardLink", systemImage: "info.circle.fill")
                    }
                    LabeledContent("Version") {
                        Text("1.0 (1)")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }

                if session.currentAccount != nil {
                    Section {
                        Button(role: .destructive) {
                            Task { await session.signOut() }
                        } label: {
                            Label("Se déconnecter", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(SiteBackground())
            .navigationTitle("Informations")
        }
    }
}

// MARK: - Comment utiliser

struct HowToUseView: View {
    var body: some View {
        List {
            Section {
                StepCard(
                    number: 1,
                    title: "Connecte-toi au Wi-Fi de ta console",
                    detail: "L'iPhone et la console (Xbox/Switch/PS) doivent être sur le **même réseau Wi-Fi**. Sinon la diffusion LAN n'est pas visible."
                )
                StepCard(
                    number: 2,
                    title: "Ajoute un serveur",
                    detail: "Onglet **Serveurs** → bouton **+** en haut à droite. Renseigne le nom, l'hôte (ex `play.shardtwn.fr`) et le port (par défaut **19132**)."
                )
                StepCard(
                    number: 3,
                    title: "Lance la diffusion",
                    detail: "Touche le serveur dans la liste. L'iPhone commence à répondre aux pings Bedrock du réseau local."
                )
                StepCard(
                    number: 4,
                    title: "Rejoins depuis la console",
                    detail: "Sur ta console : Minecraft → **Jouer** → **Amis**. Le serveur apparaît dans **Parties LAN**, prêt à être rejoint."
                )
            }
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            .listRowBackground(Color.clear)
            .listSectionSeparator(.hidden)

            Section("Bon à savoir") {
                BulletRow(text: "**Garde l'app ouverte** : iOS suspend les apps en arrière-plan, ce qui stoppe la diffusion.")
                BulletRow(text: "**Autorisation Réseau local** : si tu as refusé, va dans Réglages → ShardLink → Réseau local.")
                BulletRow(text: "**Plusieurs consoles** : la diffusion fonctionne pour toutes les consoles du Wi-Fi simultanément.")
            }
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
        .navigationTitle("Comment utiliser")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct StepCard: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("\(number)")
                    .font(.callout.bold())
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(Color.accentColor)
                    .clipShape(Circle())
                Text(title)
                    .font(.headline)
            }
            Text((try? AttributedString(markdown: detail)) ?? AttributedString(detail))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineSpacing(2)
                .padding(.leading, 36)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct BulletRow: View {
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.accentColor)
                .frame(width: 5, height: 5)
                .padding(.top, 7)
            Text((try? AttributedString(markdown: text)) ?? AttributedString(text))
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineSpacing(2)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Dépannage

struct TroubleshootingView: View {
    var body: some View {
        List {
            FAQItem(
                question: "Mon serveur n'apparaît pas dans la liste LAN de la console",
                answer: """
                1. Vérifie que **l'iPhone et la console sont sur le même Wi-Fi**.
                2. Sur certains routeurs, l'option **isolation client** doit être désactivée — c'est elle qui bloque la communication entre appareils du même réseau.
                3. Confirme que ShardLink a la permission **Réseau local** activée (Réglages iOS → ShardLink).
                4. Garde l'app ouverte au premier plan pendant que tu cherches sur la console.
                """
            )
            FAQItem(
                question: "Je vois le serveur mais le clic-join donne une erreur \"NetherNet\"",
                answer: """
                Depuis Minecraft Bedrock **1.21.50+**, Microsoft a migré le handshake LAN vers leur protocole NetherNet (WebRTC). Le clic-pour-join cross-Internet via proxy n'est plus possible.

                **Solution** : ouvre Minecraft → menu **Serveurs** → ajoute manuellement l'adresse affichée dans l'app. Tu joueras directement, sans passer par le LAN.
                """
            )
            FAQItem(
                question: "La diffusion s'arrête toute seule",
                answer: """
                iOS **suspend les apps** quand elles passent en arrière-plan ou que l'écran s'éteint, ce qui coupe le socket UDP.

                **Solution** : garde l'iPhone déverrouillé et ShardLink au premier plan pendant que tu joues. Tu peux régler le délai avant veille dans Réglages iOS → Affichage → Verrouillage auto.
                """
            )
            FAQItem(
                question: "Le port 19132 est déjà utilisé",
                answer: """
                Une autre app ou un autre service iOS tient déjà le port Bedrock. Quitte les autres apps de proxy LAN Minecraft que tu pourrais avoir installées (Phantom, Bedrock Together, etc.) avant de relancer ShardLink.
                """
            )
            FAQItem(
                question: "Je ne reçois aucun ping",
                answer: """
                Si le compteur Pings reste à 0 dans l'écran détail :

                - L'autorisation **Réseau local** est probablement refusée → Réglages → ShardLink → active-la.
                - Ta console n'est peut-être pas sur le même SSID (vérifie le Wi-Fi dans les paramètres console).
                - Sur l'iPhone, désactive le **mode Avion** s'il est actif.
                """
            )
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
        .navigationTitle("Dépannage")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct FAQItem: View {
    let question: String
    let answer: String

    @State private var expanded = false

    var body: some View {
        Section {
            DisclosureGroup(isExpanded: $expanded) {
                Text((try? AttributedString(markdown: answer)) ?? AttributedString(answer))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
                    .padding(.vertical, 6)
            } label: {
                Text(question)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
            }
        }
    }
}

// MARK: - Support

struct SupportView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.badge.checkmark")
                        .font(.system(size: 48, weight: .light))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.tint)
                    Text("Hugo Lefebvre")
                        .font(.title3.bold())
                    Text("Studio Shardtown · Auteur & support")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
            .listRowBackground(Color.clear)

            Section("Contact") {
                ContactRow(icon: "envelope.fill", label: "Email", value: "support@shardtwn.fr", url: "mailto:support@shardtwn.fr")
                ContactRow(icon: "bubble.left.and.bubble.right.fill", label: "Discord", value: "shardtwn.fr/discord", url: "https://shardtwn.fr/discord")
                ContactRow(icon: "globe", label: "Site web", value: "shardtwn.fr", url: "https://shardtwn.fr")
            }

            Section {
                Link(destination: URL(string: "mailto:bugs@shardtwn.fr?subject=ShardLink%20iOS%20%E2%80%94%20bug")!) {
                    Label("Envoyer un rapport de bug", systemImage: "ladybug.fill")
                }
            } header: {
                Text("Signaler un bug")
            } footer: {
                Text("Décris ce qui s'est passé et joins une capture d'écran si possible. Mentionne ta version de Minecraft et de l'app.")
            }
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
        .navigationTitle("Support")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ContactRow: View {
    let icon: String
    let label: String
    let value: String
    let url: String

    var body: some View {
        if let u = URL(string: url) {
            Link(destination: u) {
                HStack {
                    Label(label, systemImage: icon)
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(value)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - À propos

struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 14) {
                    Image("ShardtownLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
                    Text("Shardtown")
                        .font(.title.bold())
                    Text("Version 1.0")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
            .listRowBackground(Color.clear)

            Section {
                Text("L'app mobile officielle de l'écosystème **Shardtown** — accède à tous tes outils depuis ton iPhone. Le premier outil disponible est **ShardLink** qui transforme ton téléphone en relais LAN pour serveurs Minecraft Bedrock distants.")
                    .font(.subheadline)
                    .lineSpacing(3)
            }

            Section("Studio") {
                LabeledContent("Édité par") {
                    Text("Studio Shardtown")
                        .foregroundStyle(.secondary)
                }
                LabeledContent("Année") {
                    Text("2026")
                        .foregroundStyle(.secondary)
                }
                LabeledContent("Made in") {
                    Text("🇫🇷 France")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Link(destination: URL(string: "https://shardtwn.fr/terms")!) {
                    Label("Conditions d'utilisation", systemImage: "doc.text")
                }
                Link(destination: URL(string: "https://shardtwn.fr/privacy")!) {
                    Label("Politique de confidentialité", systemImage: "lock.shield")
                }
            } header: {
                Text("Légal")
            } footer: {
                Text("ShardLink n'est pas affilié à Mojang AB ou Microsoft. Minecraft est une marque déposée de Mojang AB.")
            }
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
        .navigationTitle("À propos")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    InfoView()
        .environmentObject(SessionStore())
}
