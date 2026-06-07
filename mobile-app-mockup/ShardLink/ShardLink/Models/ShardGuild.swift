import Foundation
import SwiftUI

/// Guilde Discord configurée avec Shard. Pour l'instant les données sont
/// statiques (mock) — branchera l'API Shardtown plus tard via un GuildStore.
struct ShardGuild: Identifiable, Hashable {
    let id: String
    let name: String
    let iconURL: String?       // (non utilisé en mock, monogramme à la place)
    let memberCount: Int
    let isPremium: Bool
    /// IDs des modules actifs (référencent `ShardModuleCatalog.all`).
    let activeModules: Set<String>
}

struct ShardModule: Identifiable, Hashable {
    let id: String
    let name: String
    let tagline: String
    let icon: String       // SF Symbol
    let accentName: String
    /// True pour les modules qui s'affichent en sous-section "premium only".
    let premiumOnly: Bool

    var accent: Color {
        switch accentName {
        case "blue": .blue
        case "green": .green
        case "orange": .orange
        case "purple": .purple
        case "pink": .pink
        case "red": .red
        case "yellow": .yellow
        case "indigo": .indigo
        case "teal": .teal
        case "mint": .mint
        case "cyan": .cyan
        case "brown": .brown
        default: .accentColor
        }
    }
}

enum ShardModuleCatalog {
    static let all: [ShardModule] = [
        .init(id: "welcome",   name: "Bienvenue",      tagline: "Message d'accueil personnalisé", icon: "hand.wave.fill",         accentName: "blue",   premiumOnly: false),
        .init(id: "leave",     name: "Départs",        tagline: "Embed quand un membre part",     icon: "figure.walk.departure",  accentName: "indigo", premiumOnly: false),
        .init(id: "autorole",  name: "Auto-rôle",      tagline: "Rôle assigné à l'arrivée",       icon: "person.badge.shield.checkmark.fill", accentName: "teal", premiumOnly: false),
        .init(id: "levels",    name: "Niveaux",        tagline: "Système XP & récompenses",       icon: "trophy.fill",            accentName: "yellow", premiumOnly: false),
        .init(id: "tickets",   name: "Tickets",        tagline: "Support privé multi-staff",      icon: "ticket.fill",            accentName: "pink",   premiumOnly: false),
        .init(id: "tempvoice", name: "Vocaux temp.",   tagline: "Salons vocaux auto à la demande",icon: "waveform",               accentName: "cyan",   premiumOnly: false),
        .init(id: "birthday",  name: "Anniversaires",  tagline: "Souhaits automatiques + rôle",   icon: "gift.fill",              accentName: "pink",   premiumOnly: false),
        .init(id: "economy",   name: "Économie",       tagline: "Monnaie virtuelle & daily",      icon: "creditcard.fill",        accentName: "green",  premiumOnly: false),
        .init(id: "polls",     name: "Sondages",       tagline: "Polls avec emoji & timer",       icon: "chart.bar.fill",         accentName: "orange", premiumOnly: false),
        .init(id: "giveaway",  name: "Giveaways",      tagline: "Tirages au sort temporisés",     icon: "sparkles.tv.fill",       accentName: "purple", premiumOnly: false),
        .init(id: "reactions", name: "Auto-réactions", tagline: "Mots-clés → emoji auto",         icon: "face.smiling.inverse",   accentName: "mint",   premiumOnly: false),
        .init(id: "shop",      name: "Shop",           tagline: "Achète des rôles avec ta monnaie", icon: "bag.fill",            accentName: "brown",  premiumOnly: false),
        .init(id: "premium",   name: "Premium",        tagline: "Custom bot & branding",          icon: "crown.fill",             accentName: "yellow", premiumOnly: true),
    ]

    static func module(id: String) -> ShardModule? {
        all.first { $0.id == id }
    }
}

/// Source des guildes — mock pour l'instant.
enum ShardGuildCatalog {
    static let all: [ShardGuild] = [
        ShardGuild(
            id: "shardtown",
            name: "Shardtown Officiel",
            iconURL: nil,
            memberCount: 12_842,
            isPremium: true,
            activeModules: ["welcome", "leave", "autorole", "levels", "tickets", "economy", "premium"]
        ),
        ShardGuild(
            id: "minigames",
            name: "Mini-Jeux Bedrock",
            iconURL: nil,
            memberCount: 3_217,
            isPremium: false,
            activeModules: ["welcome", "levels", "polls", "giveaway"]
        ),
        ShardGuild(
            id: "perso",
            name: "Serveur Perso",
            iconURL: nil,
            memberCount: 47,
            isPremium: false,
            activeModules: ["welcome"]
        )
    ]
}
