import Foundation
import Network

/// Relais UDP simple : tout paquet "jeu" reçu de la console est forwardé
/// vers le serveur Bedrock distant ; toute réponse du serveur est renvoyée
/// au client console via la `NWConnection` d'origine.
///
/// On garde **une** connexion UDP unique vers le serveur distant et on
/// renvoie ses réponses au dernier client ayant envoyé un paquet.
/// Suffisant pour 1 console à la fois — pour du multi-client, il faudrait
/// indexer une table de sessions par adresse source.
final class UDPRelay: @unchecked Sendable {

    private let remoteHost: String
    private let remotePort: UInt16
    private let queue = DispatchQueue(label: "shardlink.relay", qos: .userInitiated)

    private var upstream: NWConnection?
    private let lock = NSLock()
    private weak var currentDownstream: NWConnection?

    init(remoteHost: String, remotePort: UInt16) {
        self.remoteHost = remoteHost
        self.remotePort = remotePort
    }

    func start() {
        let host = NWEndpoint.Host(remoteHost)
        guard let port = NWEndpoint.Port(rawValue: remotePort) else { return }
        let conn = NWConnection(host: host, port: port, using: .udp)
        conn.stateUpdateHandler = { state in
            switch state {
            case .failed, .cancelled:
                conn.cancel()
            default:
                break
            }
        }
        conn.start(queue: queue)
        upstream = conn
        receiveFromUpstream()
    }

    func stop() {
        upstream?.cancel()
        upstream = nil
        lock.lock(); currentDownstream = nil; lock.unlock()
    }

    /// Forwarde un paquet venant du client console vers le serveur distant.
    /// Mémorise la connection de réponse pour pouvoir renvoyer au bon client.
    func forward(data: Data, replyVia downstream: NWConnection) {
        lock.lock(); currentDownstream = downstream; lock.unlock()
        upstream?.send(content: data, completion: .contentProcessed { _ in })
    }

    private func receiveFromUpstream() {
        upstream?.receiveMessage { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.lock.lock()
                let down = self.currentDownstream
                self.lock.unlock()
                down?.send(content: data, completion: .contentProcessed { _ in })
            }
            if error == nil && !isComplete {
                self.receiveFromUpstream()
            }
        }
    }
}
