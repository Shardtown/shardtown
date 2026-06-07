import SwiftUI

/// Vue Premium — alimente avec /api/account/premium pour savoir si l'user
/// a au moins une guilde Premium. Affiche la liste, les features incluses,
/// et un CTA pour upgrade via le web checkout (Stripe sur shardtwn.fr).
struct PremiumView: View {
    @StateObject private var store = PremiumStore()

    private let features: [(String, String)] = [
        ("crown.fill",                "Bot custom avec ton nom et avatar"),
        ("paintpalette.fill",         "Branding embeds personnalisé"),
        ("chart.bar.fill",            "Statistiques avancées"),
        ("lifepreserver.fill",        "Support prioritaire"),
        ("speedometer",               "Limites étendues"),
        ("sparkles",                  "Nouveautés en avant-première"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

                switch store.phase {
                case .idle, .loading:
                    loadingState
                case .loaded(let res):
                    loadedState(res)
                case .error(let msg):
                    errorState(msg)
                case .notAuth:
                    notAuthState
                }

                featuresList
                cta

                Spacer(minLength: 60)
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.load() }
        .task { await store.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PREMIUM")
                .font(.system(size: 11, weight: .heavy))
                .kerning(3)
                .foregroundStyle(Color(red: 0.984, green: 0.749, blue: 0.141))
            Text("Shard Premium")
                .font(.system(size: 32, weight: .bold))
                .tracking(-0.8)
                .foregroundStyle(.white)
            Text("Débloque les modules avancés et personnalise ton bot Discord.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.55))
                .lineSpacing(2)
        }
    }

    private var loadingState: some View {
        HStack { Spacer(); ProgressView().tint(.white); Spacer() }
            .frame(height: 80)
    }

    private func loadedState(_ res: AccountPremiumResponse) -> some View {
        VStack(spacing: 12) {
            statusBanner(active: res.is_premium, count: res.guilds.count)

            if !res.guilds.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("GUILDES PREMIUM")
                        .font(.system(size: 11, weight: .heavy))
                        .kerning(1.5)
                        .foregroundStyle(.white.opacity(0.4))
                        .padding(.top, 8)
                        .padding(.horizontal, 2)

                    ForEach(res.guilds) { guild in
                        PremiumGuildRow(guild: guild)
                    }
                }
            }
        }
    }

    private func errorState(_ msg: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(ShardtownTheme.statusErr)
            Text(msg)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Button("Réessayer") { Task { await store.load() } }
                .tint(ShardtownTheme.accent)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    private var notAuthState: some View {
        Text("Connecte-toi pour voir ton statut Premium.")
            .font(.system(size: 13))
            .foregroundStyle(.white.opacity(0.55))
            .frame(maxWidth: .infinity)
            .padding()
    }

    private func statusBanner(active: Bool, count: Int) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: active
                                ? [Color(red: 0.984, green: 0.749, blue: 0.141), Color(red: 0.973, green: 0.443, blue: 0.443)]
                                : [ShardtownTheme.bg2, ShardtownTheme.bg1],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 48, height: 48)
                Image(systemName: active ? "crown.fill" : "lock.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(active ? .white : .white.opacity(0.4))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(active ? "Premium actif" : "Pas de Premium actif")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text(active
                     ? "\(count) guilde\(count > 1 ? "s" : "") active\(count > 1 ? "s" : "")"
                     : "Active Premium sur une guilde pour débloquer les features.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.55))
            }
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(ShardtownTheme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(
                    active
                        ? Color(red: 0.984, green: 0.749, blue: 0.141).opacity(0.4)
                        : Color.white.opacity(0.06),
                    lineWidth: 1
                )
        )
    }

    private var featuresList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("INCLUS DANS PREMIUM")
                .font(.system(size: 11, weight: .heavy))
                .kerning(1.5)
                .foregroundStyle(.white.opacity(0.4))
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                ForEach(Array(features.enumerated()), id: \.offset) { idx, item in
                    HStack(spacing: 12) {
                        Image(systemName: item.0)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color(red: 0.984, green: 0.749, blue: 0.141))
                            .frame(width: 22)
                        Text(item.1)
                            .font(.system(size: 14))
                            .foregroundStyle(.white)
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)

                    if idx < features.count - 1 {
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                            .frame(height: 1)
                            .padding(.leading, 48)
                    }
                }
            }
            .background(ShardtownTheme.bg1)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
    }

    private var cta: some View {
        Link(destination: URL(string: "https://shardtwn.fr/premium")!) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up.right.circle.fill")
                    .font(.system(size: 16, weight: .bold))
                Text("Découvrir les offres")
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(
                LinearGradient(
                    colors: [
                        Color(red: 0.984, green: 0.749, blue: 0.141),
                        Color(red: 0.973, green: 0.443, blue: 0.443)
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Color(red: 0.984, green: 0.749, blue: 0.141).opacity(0.35), radius: 18, x: 0, y: 8)
        }
    }
}

// MARK: - Row Premium guilde

private struct PremiumGuildRow: View {
    let guild: AccountPremiumResponse.PremiumGuild

    private var iconURL: URL? {
        guard let icon = guild.icon else { return nil }
        let ext = icon.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "https://cdn.discordapp.com/icons/\(guild.id)/\(icon).\(ext)?size=128")
    }

    private var monogram: String {
        guild.name.split(separator: " ").compactMap { $0.first }.prefix(2).map(String.init).joined().uppercased()
    }

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: iconURL) { phase in
                if case .success(let img) = phase { img.resizable().scaledToFill() }
                else {
                    LinearGradient(colors: [.indigo, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .overlay(Text(monogram).font(.caption.weight(.bold)).foregroundStyle(.white))
                }
            }
            .frame(width: 38, height: 38)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            Text(guild.name)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
            Image(systemName: "crown.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(red: 0.984, green: 0.749, blue: 0.141))
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(ShardtownTheme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(red: 0.984, green: 0.749, blue: 0.141).opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Store

@MainActor
final class PremiumStore: ObservableObject {
    enum Phase {
        case idle, loading
        case loaded(AccountPremiumResponse)
        case notAuth
        case error(String)
    }

    @Published var phase: Phase = .idle
    private let api = StatsAPI()

    func load() async {
        phase = .loading
        do {
            let data = try await api.fetchAccountPremium()
            phase = .loaded(data)
        } catch let StatsAPIError.http(code, _) where code == 401 || code == 403 {
            phase = .notAuth
        } catch {
            phase = .error(error.localizedDescription)
        }
    }
}

#Preview {
    PremiumView()
        .preferredColorScheme(.dark)
}
