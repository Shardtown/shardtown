import Foundation
import Combine

/// Gère le chargement des guildes Discord du user via `/api/shard/server`.
/// État typé `Phase` pour que la vue affiche loading / vide / erreur / liste.
@MainActor
final class GuildsStore: ObservableObject {

    enum Phase {
        case idle
        case loading
        case loaded(LoadedData)
        case empty                  // user OK mais aucune guilde admin
        case notLinked              // Discord pas lié au compte Shardtown
        case error(String)
    }

    struct LoadedData {
        let user: ShardServerResponse.DiscordUser?
        let guilds: [ShardServerResponse.DiscordGuild]
        let botGuildIds: Set<String>

        /// Guildes triées : bot présent d'abord.
        var sorted: [ShardServerResponse.DiscordGuild] {
            guilds.sorted { a, b in
                let aIn = botGuildIds.contains(a.id)
                let bIn = botGuildIds.contains(b.id)
                if aIn && !bIn { return true }
                if !aIn && bIn { return false }
                return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
            }
        }
    }

    @Published private(set) var phase: Phase = .idle

    private let api = ShardAPI()

    func load() async {
        phase = .loading
        do {
            let res = try await api.fetchServer()
            if res.guilds.isEmpty {
                phase = .empty
            } else {
                phase = .loaded(LoadedData(
                    user: res.user,
                    guilds: res.guilds,
                    botGuildIds: Set(res.botGuildIds ?? [])
                ))
            }
        } catch ShardAPIError.notLinked {
            phase = .notLinked
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    /// Renvoie true si le bot Shard est présent sur cette guilde.
    func hasBot(_ guildId: String) -> Bool {
        if case .loaded(let data) = phase {
            return data.botGuildIds.contains(guildId)
        }
        return false
    }
}
