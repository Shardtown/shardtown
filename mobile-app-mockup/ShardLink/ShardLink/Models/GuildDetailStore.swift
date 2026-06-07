import Foundation
import Combine

/// Charge les settings + channels/roles d'une guilde, track les modifs,
/// pousse les changements via `POST /shard/guild/:id/config`.
@MainActor
final class GuildDetailStore: ObservableObject {

    enum Phase {
        case loading
        case loaded(ShardGuildData)
        case error(String)
    }

    @Published private(set) var phase: Phase = .loading
    /// Settings en cours d'édition (modifiable depuis les vues).
    @Published var draft: ShardSettings = ShardSettings()
    /// Settings tels qu'ils étaient au dernier load/save — pour le diff dirty.
    @Published private(set) var pristine: ShardSettings = ShardSettings()
    @Published private(set) var isSaving: Bool = false
    @Published var saveError: String?

    var isDirty: Bool { draft != pristine }

    private let guildId: String
    private let api = ShardAPI()
    private let auth = AuthAPI()

    init(guildId: String) {
        self.guildId = guildId
    }

    // MARK: - Load

    func load() async {
        phase = .loading
        do {
            let data = try await api.fetchGuild(id: guildId)
            phase = .loaded(data)
            draft = data.settings
            pristine = data.settings
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    // MARK: - Save

    func save() async {
        guard isDirty else { return }
        saveError = nil
        isSaving = true
        defer { isSaving = false }
        do {
            let csrf = try await auth.currentCsrfToken()
            try await api.saveSettings(guildId: guildId, settings: draft, csrfToken: csrf)
            pristine = draft
        } catch {
            saveError = error.localizedDescription
        }
    }

    func discard() {
        draft = pristine
        saveError = nil
    }

    // MARK: - Accesseurs pratiques pour les pickers

    var channels: [DiscordChannel] {
        if case .loaded(let d) = phase { return d.channels } else { return [] }
    }
    var voiceChannels: [DiscordChannel] {
        if case .loaded(let d) = phase { return d.voiceChannels ?? [] } else { return [] }
    }
    var categories: [DiscordChannel] {
        if case .loaded(let d) = phase { return d.categories ?? [] } else { return [] }
    }
    var roles: [DiscordRole] {
        if case .loaded(let d) = phase { return d.roles } else { return [] }
    }
    var guildName: String {
        if case .loaded(let d) = phase { return d.guild.name } else { return "" }
    }
    var guildIcon: String? {
        if case .loaded(let d) = phase { return d.guild.icon } else { return nil }
    }
}
