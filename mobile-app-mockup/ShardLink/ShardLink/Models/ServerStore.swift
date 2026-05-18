import Foundation
import Combine

@MainActor
final class ServerStore: ObservableObject {
    @Published var servers: [Server] = []

    private let storageURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("servers.json")
    }()

    init() {
        load()
    }

    func add(_ server: Server) {
        servers.append(server)
        save()
    }

    func update(_ server: Server) {
        guard let idx = servers.firstIndex(where: { $0.id == server.id }) else { return }
        servers[idx] = server
        save()
    }

    func remove(at offsets: IndexSet) {
        servers.remove(atOffsets: offsets)
        save()
    }

    func remove(_ server: Server) {
        servers.removeAll { $0.id == server.id }
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: storageURL) else { return }
        if let decoded = try? JSONDecoder().decode([Server].self, from: data) {
            servers = decoded
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(servers) {
            try? data.write(to: storageURL, options: .atomic)
        }
    }
}
