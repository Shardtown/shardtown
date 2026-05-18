import Foundation

struct Server: Identifiable, Codable, Equatable, Hashable {
    var id: UUID = UUID()
    var name: String
    var host: String
    var port: UInt16
    var motd: String
    var autoStart: Bool

    static let example = Server(
        name: "Serveur des potes",
        host: "play.shardtown.fr",
        port: 19132,
        motd: "ShardTown · Survie",
        autoStart: false
    )
}
