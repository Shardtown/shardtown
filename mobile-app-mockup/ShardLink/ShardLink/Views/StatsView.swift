import SwiftUI

/// Vue Stats — alimente avec /api/stats (public) qui renvoie les bots avec
/// leur statut, nb guildes, nb membres et historique 7j.
struct StatsView: View {
    @StateObject private var store = StatsStore()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                switch store.phase {
                case .idle, .loading:
                    loadingState
                case .error(let msg):
                    errorState(msg)
                case .loaded(let data):
                    loadedState(data)
                }

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
            Text("STATS")
                .font(.system(size: 11, weight: .heavy))
                .kerning(3)
                .foregroundStyle(ShardtownTheme.statusOk)
            Text("Écosystème Shardtown")
                .font(.system(size: 32, weight: .bold))
                .tracking(-0.8)
                .foregroundStyle(.white)
            Text("Statut live des bots et de leurs guildes Discord.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    private var loadingState: some View {
        HStack {
            Spacer()
            ProgressView().tint(.white)
            Spacer()
        }
        .frame(height: 200)
    }

    private func errorState(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 28))
                .foregroundStyle(ShardtownTheme.statusErr)
            Text(msg)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Button("Réessayer") { Task { await store.load() } }
                .tint(ShardtownTheme.accent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func loadedState(_ data: StatsResponse) -> some View {
        VStack(spacing: 14) {
            globalSummary(data.current)
            ForEach(data.current) { bot in
                BotStatsCard(bot: bot)
            }
        }
    }

    private func globalSummary(_ bots: [BotStats]) -> some View {
        let totalGuilds = bots.reduce(0) { $0 + $1.guilds }
        let totalMembers = bots.reduce(0) { $0 + $1.members }
        let onlineCount = bots.filter(\.online).count

        return HStack(spacing: 10) {
            summaryItem(value: "\(bots.count)", label: "Bots", color: ShardtownTheme.accent)
            summaryItem(value: "\(onlineCount)", label: "En ligne", color: ShardtownTheme.statusOk)
            summaryItem(value: totalGuilds.formatted(), label: "Guildes", color: .indigo)
            summaryItem(value: shortNumber(totalMembers), label: "Membres", color: .purple)
        }
    }

    private func summaryItem(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy))
                .kerning(1)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(ShardtownTheme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func shortNumber(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        return "\(n)"
    }
}

// MARK: - Bot card

private struct BotStatsCard: View {
    let bot: BotStats

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [.indigo, .purple],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(bot.label)
                        .font(.system(size: 17, weight: .semibold))
                        .tracking(-0.3)
                        .foregroundStyle(.white)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(bot.online ? ShardtownTheme.statusOk : ShardtownTheme.statusErr)
                            .frame(width: 6, height: 6)
                        Text(bot.online ? "EN LIGNE" : "HORS LIGNE")
                            .font(.system(size: 10, weight: .heavy))
                            .kerning(1)
                            .foregroundStyle(bot.online ? ShardtownTheme.statusOk : ShardtownTheme.statusErr)
                    }
                }
                Spacer()
            }

            HStack(spacing: 20) {
                statRow(value: bot.guilds.formatted(), label: "Guildes")
                Divider().frame(height: 32).background(Color.white.opacity(0.08))
                statRow(value: shortNumber(bot.members), label: "Membres")
                if let shards = bot.shards, !shards.isEmpty {
                    Divider().frame(height: 32).background(Color.white.opacity(0.08))
                    statRow(value: "\(shards.count)", label: "Shards")
                }
                Spacer()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ShardtownTheme.bg1)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func statRow(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 17, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .heavy))
                .kerning(1)
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    private func shortNumber(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        return "\(n)"
    }
}

// MARK: - Store

@MainActor
final class StatsStore: ObservableObject {
    enum Phase {
        case idle, loading
        case loaded(StatsResponse)
        case error(String)
    }

    @Published var phase: Phase = .idle
    private let api = StatsAPI()

    func load() async {
        phase = .loading
        do {
            let data = try await api.fetchStats()
            phase = .loaded(data)
        } catch {
            phase = .error(error.localizedDescription)
        }
    }
}

#Preview {
    StatsView()
        .preferredColorScheme(.dark)
}
