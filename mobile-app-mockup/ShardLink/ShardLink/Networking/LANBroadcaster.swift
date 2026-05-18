import Foundation
import Network
import Combine

/// Diffuseur LAN : écoute UDP 19132, répond aux Unconnected Pings Bedrock
/// avec un Unconnected Pong portant le MOTD configuré, puis relaie le trafic
/// jeu vers le serveur distant via `UDPRelay`.
///
/// L'iPhone doit être sur le **même Wi-Fi** que la console. iOS demandera
/// l'autorisation "Réseau local" au premier démarrage (déclaré dans Info.plist).
@MainActor
final class LANBroadcaster: ObservableObject {

    @Published private(set) var isRunning: Bool = false
    @Published private(set) var currentServer: Server?
    @Published private(set) var startedAt: Date?
    @Published private(set) var pingCount: Int = 0
    @Published private(set) var lastError: String?

    /// Snapshot lisible depuis n'importe quelle file (mis à jour via une lock).
    private let core = BroadcasterCore()

    private let listenPort: NWEndpoint.Port = 19132
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "shardlink.broadcaster", qos: .userInitiated)
    private var relay: UDPRelay?

    // MARK: - Lifecycle

    func start(server: Server) {
        stop()
        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true
        params.includePeerToPeer = false

        do {
            let listener = try NWListener(using: params, on: listenPort)
            self.listener = listener
            self.currentServer = server
            self.startedAt = Date()
            self.pingCount = 0
            self.lastError = nil
            core.update(server: server)

            let relay = UDPRelay(remoteHost: server.host, remotePort: server.port)
            relay.start()
            self.relay = relay

            listener.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }
            listener.stateUpdateHandler = { [weak self] state in
                Task { @MainActor in
                    switch state {
                    case .ready:
                        self?.isRunning = true
                    case .failed(let err):
                        self?.lastError = "Listener: \(err.localizedDescription)"
                        self?.isRunning = false
                    case .cancelled:
                        self?.isRunning = false
                    default:
                        break
                    }
                }
            }
            listener.start(queue: queue)
        } catch {
            self.lastError = "Impossible d'ouvrir le port \(listenPort): \(error.localizedDescription)"
            self.isRunning = false
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        relay?.stop()
        relay = nil
        core.clear()
        isRunning = false
        currentServer = nil
        startedAt = nil
    }

    // MARK: - Connection handling (background queue)

    nonisolated private func handleConnection(_ connection: NWConnection) {
        connection.stateUpdateHandler = { state in
            if case .failed = state { connection.cancel() }
        }
        connection.start(queue: queue)
        receive(on: connection)
    }

    nonisolated private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.process(data: data, on: connection)
            }
            if error == nil && !isComplete {
                self.receive(on: connection)
            } else {
                connection.cancel()
            }
        }
    }

    nonisolated private func process(data: Data, on connection: NWConnection) {
        let firstByte = data.first ?? 0

        // Cas 1 — Unconnected Ping : on répond directement avec notre Pong.
        if firstByte == RakNet.unconnectedPing || firstByte == RakNet.unconnectedPingOpenConnections {
            guard let parsed = RakNet.parsePing(data) else { return }
            guard let snapshot = core.snapshot() else { return }
            let motd = RakNet.makeMotdString(
                line1: snapshot.name,
                line2: snapshot.motd,
                serverGuid: snapshot.guid
            )
            let pong = RakNet.buildPong(
                pingTime: parsed.pingTime,
                serverGuid: snapshot.guid,
                motd: motd
            )
            connection.send(content: pong, completion: .contentProcessed { _ in })
            Task { @MainActor in self.pingCount += 1 }
            return
        }

        // Cas 2 — Reste du trafic : on forwarde vers le serveur distant.
        relay?.forward(data: data, replyVia: connection)
    }
}

/// État partagé thread-safe entre la main actor et la file réseau.
private final class BroadcasterCore: @unchecked Sendable {
    struct Snapshot { let name: String; let motd: String; let guid: UInt64 }

    private let lock = NSLock()
    private var current: Snapshot?
    private let guid: UInt64 = UInt64.random(in: 1...UInt64.max)

    func update(server: Server) {
        lock.lock(); defer { lock.unlock() }
        current = Snapshot(name: server.name, motd: server.motd, guid: guid)
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        current = nil
    }

    func snapshot() -> Snapshot? {
        lock.lock(); defer { lock.unlock() }
        return current
    }
}
