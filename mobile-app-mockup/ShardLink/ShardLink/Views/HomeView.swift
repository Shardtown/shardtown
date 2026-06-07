import SwiftUI

/// Accueil — c'est ICI que vit la marque Shardtown.
/// Hub éditorial : wordmark studio en haut, outils en cards égales,
/// dernières nouvelles, signature studio. ShardLink n'est qu'un outil
/// parmi les autres, pas la feature centrale.
struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var store: ServerStore
    @EnvironmentObject var broadcaster: LANBroadcaster

    var onOpenShardLink: () -> Void
    var onOpenShard: () -> Void
    var onOpenStats: () -> Void
    var onOpenPremium: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                topChip
                identity
                if broadcaster.isRunning {
                    liveStrip
                }
                tools
                news
                signature
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 80)
        }
        .scrollIndicators(.hidden)
        .siteBackground()
    }

    // MARK: - Top chip (compte)

    private var topChip: some View {
        HStack {
            Spacer()
            HStack(spacing: 8) {
                Circle()
                    .fill(ShardtownTheme.accentGradient)
                    .frame(width: 22, height: 22)
                    .overlay(
                        Text(String(session.currentAccount?.pseudo.prefix(1).uppercased() ?? "?"))
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(.white)
                    )
                Text(session.currentAccount?.pseudo ?? "—")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.04))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.06), lineWidth: 1))
        }
        .padding(.top, 6)
    }

    // MARK: - Identity (wordmark studio)

    private var identity: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("STUDIO")
                .font(.system(size: 11, weight: .heavy))
                .kerning(3)
                .foregroundStyle(ShardtownTheme.accent)

            Text("Shardtown")
                .font(.system(size: 44, weight: .bold))
                .tracking(-1.2)
                .foregroundStyle(.white)

            Text("Les outils qui font tourner les communautés Minecraft francophones. Bots Discord, dashboard, et apps natives — par un studio indépendant.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.white.opacity(0.62))
                .lineSpacing(4)
                .frame(maxWidth: 340, alignment: .leading)
        }
    }

    // MARK: - Live strip (contextual quand une diffusion tourne)

    private var liveStrip: some View {
        Button(action: onOpenShardLink) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(ShardtownTheme.statusOk.opacity(0.25))
                        .frame(width: 28, height: 28)
                    Circle()
                        .fill(ShardtownTheme.statusOk)
                        .frame(width: 10, height: 10)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("ShardLink diffuse")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                    if let active = broadcaster.currentServer {
                        Text(active.name)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(14)
            .background(Color.white.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(ShardtownTheme.statusOk.opacity(0.25), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tools (billing égal, pas de hiérarchie ShardLink-first)

    private var tools: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle("Outils", count: 4)

            VStack(spacing: 10) {
                StudioToolCard(
                    name: "Shard",
                    description: "Bot Discord — accueil, niveaux, tickets, économie",
                    icon: "bolt.fill",
                    badge: "Discord",
                    accent: Color(red: 0.545, green: 0.361, blue: 0.965),
                    action: onOpenShard
                )
                StudioToolCard(
                    name: "ShardLink",
                    description: "Diffuse tes serveurs Bedrock en partie LAN",
                    icon: "antenna.radiowaves.left.and.right",
                    badge: broadcaster.isRunning ? "Actif" : "iOS",
                    badgeIsLive: broadcaster.isRunning,
                    accent: ShardtownTheme.accent,
                    action: onOpenShardLink
                )
                StudioToolCard(
                    name: "Stats",
                    description: "Analytics live des bots et de leurs guildes",
                    icon: "chart.line.uptrend.xyaxis",
                    badge: "Live",
                    accent: Color(red: 0.063, green: 0.725, blue: 0.506),
                    action: onOpenStats
                )
                StudioToolCard(
                    name: "Premium",
                    description: "Custom bot, branding, support prioritaire",
                    icon: "crown.fill",
                    badge: "Stripe",
                    accent: Color(red: 0.984, green: 0.749, blue: 0.141),
                    action: onOpenPremium
                )
            }
        }
    }

    // MARK: - News

    private var news: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle("Dernières nouvelles")

            VStack(alignment: .leading, spacing: 18) {
                newsItem(
                    date: "20 mai 2026",
                    title: "ShardLink v1.0 disponible",
                    text: "L'outil de diffusion LAN sort officiellement sur iOS — disponible dans l'écosystème mobile."
                )
                divider
                newsItem(
                    date: "12 mai 2026",
                    title: "Refonte du dashboard Shard",
                    text: "Hub vue d'ensemble repensé, popup d'activation modules, hero promo carousel."
                )
                divider
                newsItem(
                    date: "5 mai 2026",
                    title: "Codes promo via /promo",
                    text: "Création de codes promo Premium directement depuis Discord (owner only)."
                )
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 1)
    }

    private func newsItem(date: String, title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(date.uppercased())
                .font(.system(size: 10, weight: .heavy))
                .kerning(1.5)
                .foregroundStyle(ShardtownTheme.accent)
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .tracking(-0.3)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.58))
                .lineSpacing(3)
        }
    }

    // MARK: - Signature studio

    private var signature: some View {
        VStack(alignment: .leading, spacing: 14) {
            divider.padding(.top, 8)
            HStack(alignment: .top, spacing: 12) {
                Image("ShardtownLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Studio Shardtown")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                    Text("Hugo Lefebvre · 🇫🇷 · 2026")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.45))
                }
                Spacer()
            }
            HStack(spacing: 8) {
                signatureLink("shardtwn.fr", url: "https://shardtwn.fr")
                signatureLink("Discord", url: "https://shardtwn.fr/discord")
                signatureLink("Support", url: "mailto:support@shardtwn.fr")
            }
            .padding(.top, 4)
        }
    }

    private func signatureLink(_ label: String, url: String) -> some View {
        Link(destination: URL(string: url)!) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.white.opacity(0.04))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.06), lineWidth: 1))
        }
    }

    // MARK: - Section title helper

    private func sectionTitle(_ text: String, count: Int? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text)
                .font(.system(size: 22, weight: .bold))
                .tracking(-0.5)
                .foregroundStyle(.white)
            if let count {
                Text("\(count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.4))
            }
            Spacer()
        }
    }
}

// MARK: - Studio tool card (carte individuelle avec bordure arrondie)

private struct StudioToolCard: View {
    let name: String
    let description: String
    let icon: String
    let badge: String
    var badgeIsLive: Bool = false
    let accent: Color
    var locked: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                // Icône avec gradient accent
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [accent, accent.opacity(0.7)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(name)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .tracking(-0.3)
                        Spacer(minLength: 4)
                        if badgeIsLive {
                            HStack(spacing: 4) {
                                Circle().fill(ShardtownTheme.statusOk).frame(width: 5, height: 5)
                                Text(badge.uppercased())
                                    .font(.system(size: 9, weight: .heavy))
                                    .kerning(0.8)
                            }
                            .foregroundStyle(ShardtownTheme.statusOk)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(ShardtownTheme.statusOk.opacity(0.12))
                            .clipShape(Capsule())
                        } else {
                            Text(badge.uppercased())
                                .font(.system(size: 9, weight: .heavy))
                                .kerning(0.8)
                                .foregroundStyle(.white.opacity(0.45))
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(Color.white.opacity(0.05))
                                .clipShape(Capsule())
                        }
                    }
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineSpacing(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Image(systemName: locked ? "lock.fill" : "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.3))
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(ShardtownTheme.bg1)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        badgeIsLive
                            ? ShardtownTheme.statusOk.opacity(0.25)
                            : Color.white.opacity(0.06),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(locked)
        .opacity(locked ? 0.55 : 1)
    }
}

#Preview {
    HomeView(onOpenShardLink: {}, onOpenShard: {}, onOpenStats: {}, onOpenPremium: {})
        .environmentObject(SessionStore())
        .environmentObject(ServerStore())
        .environmentObject(LANBroadcaster())
        .preferredColorScheme(.dark)
}
