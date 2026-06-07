import Foundation
import SwiftUI

/// Outil disponible dans l'écosystème Shardtown mobile.
/// Pour l'instant ShardLink est le seul outil actif — les autres sont
/// affichés comme "à venir" dans l'écran Accueil pour annoncer la roadmap.
struct ShardTool: Identifiable, Hashable {
    let id: String
    let name: String
    let tagline: String
    let icon: String          // SF Symbol
    let accentName: String    // blue/green/orange/purple/red
    let available: Bool

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
        default: .accentColor
        }
    }
}

enum ToolCatalog {
    static let all: [ShardTool] = [
        ShardTool(
            id: "shardlink",
            name: "ShardLink",
            tagline: "Diffuse tes serveurs Bedrock en LAN sur la console",
            icon: "antenna.radiowaves.left.and.right",
            accentName: "blue",
            available: true
        ),
        ShardTool(
            id: "stats",
            name: "Stats",
            tagline: "Statistiques live de tes serveurs Shardtown",
            icon: "chart.line.uptrend.xyaxis",
            accentName: "green",
            available: false
        ),
        ShardTool(
            id: "bot",
            name: "Shard Bot",
            tagline: "Pilote tes guildes Discord et configure les modules",
            icon: "bolt.fill",
            accentName: "purple",
            available: true
        ),
        ShardTool(
            id: "premium",
            name: "Premium",
            tagline: "Gère ton abonnement et tes codes promo",
            icon: "crown.fill",
            accentName: "yellow",
            available: false
        ),
        ShardTool(
            id: "notif",
            name: "Notifications",
            tagline: "Alertes serveur, modération, donations",
            icon: "bell.badge.fill",
            accentName: "red",
            available: false
        )
    ]

    static var shardlink: ShardTool { all.first { $0.id == "shardlink" }! }
}
