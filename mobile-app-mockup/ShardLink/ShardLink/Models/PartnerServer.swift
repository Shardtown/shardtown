import Foundation
import SwiftUI

/// Serveur partenaire curaté — affiché dans l'onglet Partenaires.
/// L'utilisateur peut soit l'ajouter à sa liste, soit lancer une diffusion directe.
struct PartnerServer: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let host: String
    let port: UInt16
    let description: String
    let tagline: String
    let icon: String        // SF Symbol
    let accentName: String  // Nom de Color (system, e.g. "blue", "green", "orange")
    let tags: [String]
    let verified: Bool

    var accent: Color {
        switch accentName {
        case "blue": .blue
        case "green": .green
        case "orange": .orange
        case "purple": .purple
        case "pink": .pink
        case "red": .red
        case "yellow": .yellow
        default: .accentColor
        }
    }

    func asServer() -> Server {
        Server(
            name: name,
            host: host,
            port: port,
            motd: tagline,
            autoStart: false
        )
    }
}

/// Source des partenaires — pour l'instant statique. Migrable vers un fetch
/// API Shardtown si on veut piloter ça à distance.
enum PartnerCatalog {
    static let all: [PartnerServer] = [
        PartnerServer(
            name: "Shardtown Survie",
            host: "play.shardtwn.fr",
            port: 19132,
            description: "Le serveur survie officiel Shardtown — économie, jobs, factions.",
            tagline: "Shardtown · Survie",
            icon: "mountain.2.fill",
            accentName: "blue",
            tags: ["Survie", "Économie", "Factions"],
            verified: true
        ),
        PartnerServer(
            name: "Shardtown Mini-Jeux",
            host: "minigames.shardtwn.fr",
            port: 19132,
            description: "Bedwars, SkyWars, BuildBattle. Compétitif, classements live.",
            tagline: "Shardtown · Mini-Jeux",
            icon: "gamecontroller.fill",
            accentName: "orange",
            tags: ["Mini-Jeux", "PvP", "Compétitif"],
            verified: true
        ),
        PartnerServer(
            name: "Shardtown Créatif",
            host: "build.shardtwn.fr",
            port: 19132,
            description: "Plot world créatif avec WorldEdit. Communauté de builders.",
            tagline: "Shardtown · Créatif",
            icon: "paintbrush.pointed.fill",
            accentName: "purple",
            tags: ["Créatif", "Builds", "WorldEdit"],
            verified: true
        ),
        PartnerServer(
            name: "Paladium",
            host: "play.paladium-bedrock.fr",
            port: 19132,
            description: "Le classique français — factions, RPG, donjons.",
            tagline: "Paladium · Bedrock",
            icon: "shield.lefthalf.filled",
            accentName: "red",
            tags: ["Factions", "RPG"],
            verified: false
        ),
        PartnerServer(
            name: "OneBlock FR",
            host: "oneblock.shardtwn.fr",
            port: 19132,
            description: "Un bloc, mille possibilités. Mode skyblock revisité.",
            tagline: "OneBlock · FR",
            icon: "cube.fill",
            accentName: "green",
            tags: ["SkyBlock", "Solo"],
            verified: false
        )
    ]
}
