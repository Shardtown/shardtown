import SwiftUI

/// Onglet "Shard" — liste des guildes Discord du user via `/api/shard/server`.
struct ShardDashboardView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var guildsStore = GuildsStore()

    var body: some View {
        NavigationStack {
            content
                .siteBackground()
                .navigationTitle("Shard")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await guildsStore.load() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.body.weight(.semibold))
                                .frame(width: 30, height: 30)
                        }
                        .glassEffect(.regular.interactive(), in: Circle())
                    }
                }
                .task { await guildsStore.load() }
                .refreshable { await guildsStore.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch guildsStore.phase {
        case .idle, .loading:
            ProgressView("Chargement de tes guildes…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .empty:
            ContentUnavailableView {
                Label("Aucune guilde admin", systemImage: "person.3.fill")
            } description: {
                Text("Tu n'as les droits d'administration sur aucune guilde Discord. Demande à un owner de te promouvoir, ou ajoute Shard à ta propre guilde.")
            } actions: {
                Link(destination: URL(string: "https://shardtwn.fr/invite")!) {
                    Label("Ajouter Shard à une guilde", systemImage: "plus")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                }
                .glassEffect(.regular.tint(.accentColor).interactive(), in: Capsule())
            }

        case .notLinked:
            notLinkedState

        case .error(let msg):
            ContentUnavailableView {
                Label("Erreur de chargement", systemImage: "exclamationmark.triangle.fill")
            } description: {
                Text(msg)
            } actions: {
                Button {
                    Task { await guildsStore.load() }
                } label: {
                    Label("Réessayer", systemImage: "arrow.clockwise")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                }
                .glassEffect(.regular.tint(.accentColor).interactive(), in: Capsule())
            }

        case .loaded(let data):
            loadedList(data: data)
        }
    }

    // MARK: - État "compte Discord non lié"

    private var notLinkedState: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "link.circle.fill")
                    .font(.system(size: 64, weight: .light))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.tint)
                    .padding(.top, 48)
                Text("Lie ton compte Discord")
                    .font(.title2.bold())
                Text("Pour voir tes guildes et configurer Shard, tu dois d'abord lier ton compte Discord à ton compte Shardtown.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .padding(.horizontal, 32)

                Link(destination: URL(string: "https://shardtwn.fr/account/connections")!) {
                    Label("Lier mon Discord", systemImage: "arrow.up.right")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                }
                .glassEffect(.regular.tint(.accentColor).interactive(), in: Capsule())
                .padding(.top, 8)

                Button {
                    Task { await guildsStore.load() }
                } label: {
                    Text("J'ai lié, rafraîchir")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                }
                .glassEffect(.regular.interactive(), in: Capsule())
            }
        }
    }

    // MARK: - Liste guildes chargée

    private func loadedList(data: GuildsStore.LoadedData) -> some View {
        List {
            if let user = data.user {
                Section {
                    HStack(spacing: 12) {
                        DiscordAvatar(user: user, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.username)
                                .font(.headline)
                            Text("Connecté via Discord")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                ForEach(data.sorted) { g in
                    NavigationLink {
                        ShardGuildView(
                            guildId: g.id,
                            guildName: g.name,
                            guildIcon: g.icon
                        )
                    } label: {
                        GuildRow(guild: g, botPresent: data.botGuildIds.contains(g.id))
                    }
                }
            } header: {
                Text("Tes guildes")
            } footer: {
                Text("Les guildes où **Shard** est présent apparaissent en premier. Tape sur une guilde pour configurer ses modules.")
            }

            Section {
                Link(destination: URL(string: "https://shardtwn.fr/invite")!) {
                    Label("Ajouter Shard à une guilde", systemImage: "plus.app.fill")
                }
            } footer: {
                Text("Tu seras redirigé vers Discord pour autoriser le bot.")
            }
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
    }
}

// MARK: - Avatar Discord

private struct DiscordAvatar: View {
    let user: ShardServerResponse.DiscordUser
    let size: CGFloat

    private var avatarURL: URL? {
        guard let avatar = user.avatar else { return nil }
        let ext = avatar.hasPrefix("a_") ? "gif" : "png"
        return URL(string: "https://cdn.discordapp.com/avatars/\(user.id)/\(avatar).\(ext)?size=128")
    }

    private var monogram: String {
        String(user.username.prefix(2)).uppercased()
    }

    var body: some View {
        AsyncImage(url: avatarURL) { phase in
            switch phase {
            case .success(let img):
                img.resizable().scaledToFill()
            default:
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var fallback: some View {
        ZStack {
            LinearGradient(
                colors: [.indigo, .purple],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text(monogram)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

// MARK: - Row guilde

private struct GuildRow: View {
    let guild: ShardServerResponse.DiscordGuild
    let botPresent: Bool

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
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: fallbackIcon
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(guild.name)
                    .font(.body.weight(.medium))
                if botPresent {
                    Label("Shard actif", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                        .labelStyle(.titleAndIcon)
                } else {
                    Text("Shard non installé")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var fallbackIcon: some View {
        ZStack {
            LinearGradient(
                colors: [.indigo.opacity(0.7), .purple.opacity(0.7)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text(monogram)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

#Preview {
    ShardDashboardView()
        .environmentObject(SessionStore())
}
