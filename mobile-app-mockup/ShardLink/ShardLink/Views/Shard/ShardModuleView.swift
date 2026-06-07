import SwiftUI

/// Détail d'un module — tous wired sur le GuildDetailStore (settings réels).
/// Preview embed Discord native (interface Onyx).
struct ShardModuleView: View {
    let module: ShardModule
    @ObservedObject var store: GuildDetailStore

    var body: some View {
        List {
            Section {
                ModuleHeader(module: module)
            }
            .listRowBackground(Color.clear)
            .listSectionSeparator(.hidden)

            switch module.id {
            case "welcome":   welcomeContent
            case "leave":     leaveContent
            case "autorole":  autoRoleContent
            case "levels":    levelsContent
            case "tickets":   ticketsContent
            case "tempvoice": tempVoiceContent
            case "birthday":  birthdayContent
            case "economy":   economyContent
            case "polls":     pollsContent
            case "giveaway":  giveawayContent
            case "reactions": reactionsContent
            case "shop":      shopContent
            case "premium":   premiumContent
            default:          comingSoon
            }
        }
        .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
        .navigationTitle(module.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Welcome

    @ViewBuilder
    private var welcomeContent: some View {
        Section {
            ChannelPickerView(label: "Salon", id: $store.draft.welcomeChannelId, channels: store.channels, includeNone: true)
        } header: {
            Text("Où poster")
        } footer: {
            Text("Sélectionne **Aucun** pour désactiver le module.")
        }

        Section {
            TextField("Titre", text: $store.draft.welcomeTitle)
            TextField("Message", text: $store.draft.welcomeMessage, axis: .vertical)
                .lineLimit(2...6)
            TextField("Footer", text: $store.draft.welcomeFooter)
            HexColorRow(label: "Couleur", hex: $store.draft.welcomeColor)
        } header: { Text("Template") } footer: {
            Text("Variables : `{user}`, `{server}`, `{count}`.")
        }

        previewSection {
            DiscordMessagePreview {
                DiscordEmbedView(
                    color: store.draft.welcomeColor,
                    title: store.draft.welcomeTitle.fallback("Bienvenue !"),
                    description: store.draft.welcomeMessage.fallback("Hey {user}, bienvenue sur {server} 👋"),
                    footerText: store.draft.welcomeFooter
                )
            }
        }
    }

    // MARK: - Leave

    @ViewBuilder
    private var leaveContent: some View {
        Section {
            ChannelPickerView(label: "Salon", id: $store.draft.leaveChannelId, channels: store.channels, includeNone: true)
        } header: { Text("Où poster") }

        Section {
            TextField("Titre", text: $store.draft.leaveTitle)
            TextField("Message", text: $store.draft.leaveMessage, axis: .vertical)
                .lineLimit(2...6)
            TextField("Footer", text: $store.draft.leaveFooter)
            HexColorRow(label: "Couleur", hex: $store.draft.leaveColor)
        } header: { Text("Template") }

        previewSection {
            DiscordMessagePreview {
                DiscordEmbedView(
                    color: store.draft.leaveColor,
                    title: store.draft.leaveTitle.fallback("Au revoir {user}"),
                    description: store.draft.leaveMessage.fallback("{user} a quitté le serveur."),
                    footerText: store.draft.leaveFooter
                )
            }
        }
    }

    // MARK: - AutoRole

    @ViewBuilder
    private var autoRoleContent: some View {
        Section {
            RolePickerView(label: "Rôle à attribuer", id: $store.draft.autoRoleId, roles: store.roles, includeNone: true)
        } header: { Text("Configuration") } footer: {
            Text("Le rôle sera donné à chaque nouveau membre. **Aucun** pour désactiver.")
        }
    }

    // MARK: - Levels

    @ViewBuilder
    private var levelsContent: some View {
        Section {
            Toggle("Système activé", isOn: Binding(
                get: { (store.draft.levelsEnabled ?? 0) != 0 },
                set: { store.draft.levelsEnabled = $0 ? 1 : 0 }
            ))
        } header: { Text("État") }

        if (store.draft.levelsEnabled ?? 0) != 0 {
            Section {
                SliderRow(label: "XP min / message", value: Binding(
                    get: { Double(store.draft.xpMin) },
                    set: { store.draft.xpMin = Int($0) }
                ), range: 1...100, step: 1, suffix: "")

                SliderRow(label: "XP max / message", value: Binding(
                    get: { Double(store.draft.xpMax) },
                    set: { store.draft.xpMax = Int($0) }
                ), range: 1...100, step: 1, suffix: "")

                SliderRow(label: "Cooldown", value: Binding(
                    get: { Double(store.draft.xpCooldown) },
                    set: { store.draft.xpCooldown = Int($0) }
                ), range: 5...300, step: 5, suffix: "s")
            } header: { Text("Gains XP") }

            Section {
                ChannelPickerView(label: "Salon level-up", id: $store.draft.levelUpChannelId, channels: store.channels, includeNone: true)
                TextField("Message", text: $store.draft.levelUpMessage, axis: .vertical)
                    .lineLimit(2...4)
                HexColorRow(label: "Couleur", hex: $store.draft.levelUpColor)
            } header: { Text("Annonce") } footer: {
                Text("Variables : `{user}`, `{level}`.")
            }

            previewSection {
                DiscordMessagePreview {
                    DiscordEmbedView(
                        color: store.draft.levelUpColor,
                        title: "Niveau supérieur !",
                        description: store.draft.levelUpMessage.fallback("Bravo {user}, tu passes niveau {level} ! 🎉")
                    )
                }
            }
        }
    }

    // MARK: - Tickets

    @ViewBuilder
    private var ticketsContent: some View {
        Section {
            Toggle("Tickets activés", isOn: Binding(
                get: { (store.draft.ticketEnabled ?? 0) != 0 },
                set: { store.draft.ticketEnabled = $0 ? 1 : 0 }
            ))
        } header: { Text("État") }

        if (store.draft.ticketEnabled ?? 0) != 0 {
            Section {
                ChannelPickerView(label: "Catégorie tickets", id: $store.draft.ticketCategoryId, channels: store.categories, includeNone: true)
                RolePickerView(label: "Rôle support", id: $store.draft.ticketSupportRoleId, roles: store.roles, includeNone: true)
                ChannelPickerView(label: "Salon logs", id: $store.draft.ticketLogChannelId, channels: store.channels, includeNone: true)
            } header: { Text("Infrastructure") }

            Section {
                ChannelPickerView(label: "Salon panneau", id: $store.draft.ticketPanelChannelId, channels: store.channels, includeNone: true)
                TextField("Titre", text: $store.draft.ticketPanelTitle)
                TextField("Description", text: $store.draft.ticketPanelDescription, axis: .vertical)
                    .lineLimit(2...5)
                HexColorRow(label: "Couleur", hex: $store.draft.ticketPanelColor)
            } header: { Text("Panneau") }

            Section {
                SliderRow(label: "Tickets max / membre", value: Binding(
                    get: { Double(store.draft.ticketMaxPerUser) },
                    set: { store.draft.ticketMaxPerUser = Int($0) }
                ), range: 1...5, step: 1, suffix: "")
            } header: { Text("Limites") }

            previewSection {
                VStack(alignment: .leading, spacing: 8) {
                    DiscordMessagePreview {
                        DiscordEmbedView(
                            color: store.draft.ticketPanelColor,
                            title: store.draft.ticketPanelTitle.fallback("Ouvre un ticket"),
                            description: store.draft.ticketPanelDescription.fallback("Clique sur le bouton ci-dessous pour ouvrir un ticket avec l'équipe support.")
                        )
                    }
                    HStack {
                        DiscordButton(label: "Ouvrir un ticket", emoji: "🎫", style: .primary)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                    .background(DiscordColor.bgPrimary)
                }
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    // MARK: - TempVoice

    @ViewBuilder
    private var tempVoiceContent: some View {
        Section {
            ChannelPickerView(label: "Vocal trigger", id: $store.draft.tempVoiceTrigger, channels: store.voiceChannels, includeNone: true, voice: true)
            ChannelPickerView(label: "Catégorie", id: $store.draft.tempVoiceCategory, channels: store.categories, includeNone: true)
            TextField("Nom du vocal créé", text: $store.draft.tempVoiceName)
        } header: { Text("Configuration") } footer: {
            Text("Quand un membre rejoint le **vocal trigger**, un nouveau salon vocal est créé dans la catégorie choisie. Variable : `{user}`.")
        }
    }

    // MARK: - Birthday

    @ViewBuilder
    private var birthdayContent: some View {
        Section {
            ChannelPickerView(label: "Salon souhaits", id: $store.draft.birthdayChannelId, channels: store.channels, includeNone: true)
            RolePickerView(label: "Rôle anniversaire", id: $store.draft.birthdayRoleId, roles: store.roles, includeNone: true)
        } header: { Text("Configuration") }

        Section {
            TextField("Message", text: $store.draft.birthdayMessage, axis: .vertical)
                .lineLimit(2...4)
        } header: { Text("Message") } footer: {
            Text("Variables : `{user}` mentionne le membre.")
        }

        previewSection {
            DiscordMessagePreview(
                content: store.draft.birthdayMessage.fallback("🎂 Joyeux anniversaire {user} !")
            ) {
                EmptyView()
            }
        }
    }

    // MARK: - Economy

    @ViewBuilder
    private var economyContent: some View {
        Section {
            Toggle("Économie activée", isOn: Binding(
                get: { (store.draft.economyEnabled ?? 0) != 0 },
                set: { store.draft.economyEnabled = $0 ? 1 : 0 }
            ))
        } header: { Text("État") }

        if (store.draft.economyEnabled ?? 0) != 0 {
            Section {
                TextField("Nom de la monnaie", text: $store.draft.economyCurrencyName)
            } header: { Text("Monnaie") } footer: {
                Text("Ex : coins, shards, pièces.")
            }

            Section {
                SliderRow(label: "Daily min", value: Binding(
                    get: { Double(store.draft.economyDailyMin) },
                    set: { store.draft.economyDailyMin = Int($0) }
                ), range: 10...1000, step: 10, suffix: " \(store.draft.economyCurrencyName)")

                SliderRow(label: "Daily max", value: Binding(
                    get: { Double(store.draft.economyDailyMax) },
                    set: { store.draft.economyDailyMax = Int($0) }
                ), range: 10...1000, step: 10, suffix: " \(store.draft.economyCurrencyName)")
            } header: { Text("Récompense quotidienne") }

            previewSection {
                DiscordMessagePreview {
                    DiscordEmbedView(
                        color: "#10b981",
                        title: "Daily récolté !",
                        description: "@membre a reçu **\(store.draft.economyDailyMax) \(store.draft.economyCurrencyName)** pour son daily.",
                        footerText: "Reviens dans 24h"
                    )
                }
            }
        }
    }

    // MARK: - Modules via commandes Discord

    @ViewBuilder
    private var pollsContent: some View {
        commandsInfo(
            title: "Sondages",
            commandLines: [
                "/poll create question:\"Pizza ou burger ?\" choices:\"🍕,🍔\"",
                "/poll end id:5"
            ],
            description: "Crée des sondages avec emojis et timer depuis Discord. Les sondages se ferment automatiquement à la fin du timer ou sur commande."
        )
    }

    @ViewBuilder
    private var giveawayContent: some View {
        commandsInfo(
            title: "Giveaways",
            commandLines: [
                "/giveaway start prize:\"Nitro 1 mois\" duration:\"24h\" winners:1",
                "/giveaway end id:12",
                "/giveaway reroll id:12"
            ],
            description: "Lance des tirages au sort temporisés. Restrictions par rôle ou niveau supportées via les arguments optionnels."
        )
    }

    @ViewBuilder
    private var reactionsContent: some View {
        commandsInfo(
            title: "Auto-réactions",
            commandLines: [
                "/autoreact add trigger:\"bonjour\" emoji:👋",
                "/autoreact list",
                "/autoreact remove id:3"
            ],
            description: "Définis des paires mot-clé → emoji. Le bot réagit automatiquement quand le mot apparaît dans un message."
        )
    }

    @ViewBuilder
    private var shopContent: some View {
        commandsInfo(
            title: "Shop",
            commandLines: [
                "/shop add role:@VIP price:5000",
                "/shop list",
                "/shop buy role:@VIP"
            ],
            description: "Vends des rôles aux membres contre la monnaie virtuelle du serveur. Active l'**Économie** d'abord."
        )
    }

    @ViewBuilder
    private var premiumContent: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "crown.fill")
                    .font(.title2)
                    .foregroundStyle(.yellow)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Statut Premium")
                        .font(.subheadline.weight(.semibold))
                    Text("Gère ton abonnement et tes features Premium depuis le site.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
        Section {
            Link(destination: URL(string: "https://shardtwn.fr/premium")!) {
                Label("Voir le statut Premium", systemImage: "arrow.up.right")
            }
        }
    }

    // MARK: - Builder commun "via commandes Discord"

    @ViewBuilder
    private func commandsInfo(title: String, commandLines: [String], description: String) -> some View {
        Section {
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineSpacing(2)
        } header: { Text("Comment ça marche") }

        Section {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(commandLines, id: \.self) { line in
                    Text(line)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(DiscordColor.textNormal)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(DiscordColor.bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
            }
            .padding(.vertical, 4)
        } header: { Text("Commandes disponibles") }

        Section {
            Link(destination: URL(string: "https://shardtwn.fr/doc/shard/commands")!) {
                Label("Doc complète des commandes", systemImage: "book.fill")
            }
        }
    }

    // MARK: - Placeholder

    @ViewBuilder
    private var comingSoon: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "hammer.fill")
                    .font(.title2)
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Édition mobile bientôt")
                        .font(.subheadline.weight(.semibold))
                    Text("Configure ce module depuis le dashboard web en attendant.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Preview wrapper

    private func previewSection<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        Section {
            content()
                .padding(.vertical, 4)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
        } header: { Text("Aperçu Discord") }
    }
}

// MARK: - Header

private struct ModuleHeader: View {
    let module: ShardModule

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(module.accent.gradient)
                    .frame(width: 64, height: 64)
                    .shadow(color: module.accent.opacity(0.3), radius: 14, x: 0, y: 8)
                Image(systemName: module.icon)
                    .font(.title2.weight(.medium))
                    .foregroundStyle(.white)
            }
            Text(module.name)
                .font(.title3.bold())
            Text(module.tagline)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

// MARK: - ChannelPicker (text/voice/category)

private struct ChannelPickerView: View {
    let label: String
    @Binding var id: String
    let channels: [DiscordChannel]
    var includeNone: Bool = false
    var voice: Bool = false

    private var icon: String { voice ? "speaker.wave.2.fill" : "number" }
    private var prefix: String { voice ? "" : "# " }

    var body: some View {
        Picker(label, selection: $id) {
            if includeNone {
                Text("— Aucun —").tag("")
            }
            ForEach(channels) { c in
                Label("\(prefix)\(c.name)", systemImage: icon)
                    .tag(c.id)
            }
        }
    }
}

// MARK: - RolePicker

private struct RolePickerView: View {
    let label: String
    @Binding var id: String
    let roles: [DiscordRole]
    var includeNone: Bool = false

    var body: some View {
        Picker(label, selection: $id) {
            if includeNone {
                Text("— Aucun —").tag("")
            }
            ForEach(roles) { r in
                Label(r.name, systemImage: "person.fill")
                    .foregroundStyle(r.color.flatMap(Color.init(discordColor:)) ?? .primary)
                    .tag(r.id)
            }
        }
    }
}

// MARK: - HexColorRow

private struct HexColorRow: View {
    let label: String
    @Binding var hex: String

    var body: some View {
        HStack {
            ColorPicker(
                label,
                selection: Binding(
                    get: { Color(hex: hex) ?? .accentColor },
                    set: { hex = $0.hexString }
                ),
                supportsOpacity: false
            )
            Text(hex.uppercased())
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - SliderRow

private struct SliderRow: View {
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let suffix: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                Spacer()
                Text("\(Int(value))\(suffix)")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Slider(value: $value, in: range, step: step)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Color helpers

extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        let r = Double((v >> 16) & 0xFF) / 255
        let g = Double((v >> 8) & 0xFF) / 255
        let b = Double(v & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    init?(discordColor: Int) {
        guard discordColor > 0 else { return nil }
        let r = Double((discordColor >> 16) & 0xFF) / 255
        let g = Double((discordColor >> 8) & 0xFF) / 255
        let b = Double(discordColor & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    var hexString: String {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X",
                      Int((r * 255).rounded()),
                      Int((g * 255).rounded()),
                      Int((b * 255).rounded()))
    }
}

// MARK: - String fallback

private extension String {
    func fallback(_ default_: String) -> String {
        isEmpty ? default_ : self
    }
}
