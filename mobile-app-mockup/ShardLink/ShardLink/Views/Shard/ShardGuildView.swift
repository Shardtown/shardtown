import SwiftUI

/// Détail d'une guilde — fetch /api/shard/guild/:id, liste des modules,
/// save bar flottante en glass quand un changement est en cours.
struct ShardGuildView: View {
    let guildId: String
    let guildName: String
    let guildIcon: String?

    @StateObject private var store: GuildDetailStore

    init(guildId: String, guildName: String = "", guildIcon: String? = nil) {
        self.guildId = guildId
        self.guildName = guildName
        self.guildIcon = guildIcon
        _store = StateObject(wrappedValue: GuildDetailStore(guildId: guildId))
    }

    private var standardModules: [ShardModule] {
        ShardModuleCatalog.all.filter { !$0.premiumOnly }
    }
    private var premiumModules: [ShardModule] {
        ShardModuleCatalog.all.filter { $0.premiumOnly }
    }

    var body: some View {
        Group {
            switch store.phase {
            case .loading:
                ProgressView("Chargement de la guilde…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .error(let msg):
                ContentUnavailableView {
                    Label("Erreur", systemImage: "exclamationmark.triangle.fill")
                } description: {
                    Text(msg)
                } actions: {
                    Button { Task { await store.load() } } label: {
                        Label("Réessayer", systemImage: "arrow.clockwise")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 22).padding(.vertical, 14)
                    }
                    .glassEffect(.regular.tint(.accentColor).interactive(), in: Capsule())
                }
            case .loaded:
                loadedList
            }
        }
        .navigationTitle(store.guildName.isEmpty ? guildName : store.guildName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load() }
        .safeAreaInset(edge: .bottom) {
            if store.isDirty || store.isSaving {
                SaveBar(store: store)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
        }
    }

    @ViewBuilder
    private var loadedList: some View {
        List {
            Section {
                GuildHeroCard(
                    name: store.guildName,
                    icon: store.guildIcon,
                    guildId: guildId,
                    channelCount: store.channels.count,
                    roleCount: store.roles.count
                )
            }
            .listRowBackground(Color.clear)
            .listSectionSeparator(.hidden)

            Section {
                ForEach(standardModules) { module in
                    NavigationLink {
                        ShardModuleView(module: module, store: store)
                    } label: {
                        ModuleRow(module: module, isActive: isActive(module))
                    }
                }
            } header: {
                Text("Modules")
            } footer: {
                Text("Touche un module pour le configurer. Les modifications apparaissent dans la barre en bas et sont enregistrées d'un tap.")
            }

            if let err = store.saveError {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
            }

            Section { Color.clear.frame(height: 76) }
                .listRowBackground(Color.clear)
                .listSectionSeparator(.hidden)
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
    }

    /// Détermine si un module est "actif" à partir des settings réels.
    private func isActive(_ module: ShardModule) -> Bool {
        let s = store.draft
        switch module.id {
        case "welcome":   return !s.welcomeChannelId.isEmpty
        case "leave":     return !s.leaveChannelId.isEmpty
        case "autorole":  return !s.autoRoleId.isEmpty
        case "levels":    return (s.levelsEnabled ?? 0) != 0
        case "tickets":   return (s.ticketEnabled ?? 0) != 0
        case "tempvoice": return !s.tempVoiceTrigger.isEmpty
        case "birthday":  return !s.birthdayChannelId.isEmpty
        case "economy":   return (s.economyEnabled ?? 0) != 0
        default:          return false
        }
    }
}

// MARK: - Hero

private struct GuildHeroCard: View {
    let name: String
    let icon: String?
    let guildId: String
    let channelCount: Int
    let roleCount: Int

    private var iconURL: URL? {
        guard let icon else { return nil }
        let ext = icon.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "https://cdn.discordapp.com/icons/\(guildId)/\(icon).\(ext)?size=128")
    }

    private var monogram: String {
        name.split(separator: " ").compactMap { $0.first }.prefix(2).map(String.init).joined().uppercased()
    }

    var body: some View {
        VStack(spacing: 12) {
            AsyncImage(url: iconURL) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default:
                    LinearGradient(colors: [.indigo, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .overlay(
                            Text(monogram)
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                        )
                }
            }
            .frame(width: 76, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .indigo.opacity(0.25), radius: 14, x: 0, y: 6)

            Text(name)
                .font(.title3.bold())
            Text("\(channelCount) salons · \(roleCount) rôles")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }
}

// MARK: - Row module

private struct ModuleRow: View {
    let module: ShardModule
    let isActive: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(module.accent.gradient)
                    .frame(width: 36, height: 36)
                Image(systemName: module.icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(module.name)
                    .font(.subheadline.weight(.medium))
                Text(module.tagline)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            if isActive {
                Text("ON")
                    .font(.caption2.weight(.bold))
                    .kerning(0.6)
                    .foregroundStyle(.green)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Color.green.opacity(0.14))
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Save bar flottante (liquid glass)

private struct SaveBar: View {
    @ObservedObject var store: GuildDetailStore

    var body: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                Button { store.discard() } label: {
                    Text("Annuler")
                        .font(.body.weight(.semibold))
                        .padding(.horizontal, 18).padding(.vertical, 14)
                }
                .glassEffect(.regular.interactive(), in: Capsule())
                .disabled(store.isSaving)

                Button {
                    Task { await store.save() }
                } label: {
                    HStack(spacing: 8) {
                        if store.isSaving {
                            ProgressView().tint(.white)
                        }
                        Text(store.isSaving ? "Enregistrement…" : "Enregistrer")
                            .font(.body.weight(.semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14).padding(.horizontal, 24)
                }
                .glassEffect(.regular.tint(.accentColor).interactive(), in: Capsule())
                .disabled(store.isSaving)
            }
        }
    }
}
