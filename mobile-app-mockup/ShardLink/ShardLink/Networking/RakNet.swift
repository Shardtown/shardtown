import Foundation

/// Helpers RakNet pour la découverte Bedrock LAN.
///
/// Le client console envoie un *Unconnected Ping* (ID 0x01) en broadcast UDP
/// sur le port 19132 du réseau local. Tout serveur Bedrock qui écoute ce port
/// répond avec un *Unconnected Pong* (ID 0x1C) en unicast vers la source.
/// Le pong contient un MOTD au format `MCPE;...;...;...` que le client
/// affiche dans l'onglet "Amis" / "Parties LAN".
enum RakNet {

    /// Magic RakNet : 16 octets fixes utilisés pour identifier le protocole.
    static let magic: [UInt8] = [
        0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
        0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78
    ]

    static let unconnectedPing: UInt8 = 0x01
    static let unconnectedPingOpenConnections: UInt8 = 0x02
    static let unconnectedPong: UInt8 = 0x1C

    /// Parse un Unconnected Ping et retourne (clientPingTime, clientGuid).
    /// Format : [id 1B][pingTime 8B][magic 16B][clientGuid 8B]
    static func parsePing(_ data: Data) -> (pingTime: UInt64, clientGuid: UInt64)? {
        guard data.count >= 33 else { return nil }
        let id = data[0]
        guard id == unconnectedPing || id == unconnectedPingOpenConnections else { return nil }
        let pingTime = readUInt64BE(data, offset: 1)
        guard Array(data[9..<25]) == magic else { return nil }
        let clientGuid = readUInt64BE(data, offset: 25)
        return (pingTime, clientGuid)
    }

    /// Construit un Unconnected Pong à renvoyer.
    /// Format : [id 1B][pingTime 8B][serverGuid 8B][magic 16B][motdLen 2B BE][motd UTF-8]
    static func buildPong(pingTime: UInt64, serverGuid: UInt64, motd: String) -> Data {
        var data = Data()
        data.append(unconnectedPong)
        appendUInt64BE(&data, pingTime)
        appendUInt64BE(&data, serverGuid)
        data.append(contentsOf: magic)
        let motdBytes = Array(motd.utf8)
        let len = UInt16(motdBytes.count)
        data.append(UInt8(len >> 8))
        data.append(UInt8(len & 0xFF))
        data.append(contentsOf: motdBytes)
        return data
    }

    /// Construit la chaîne MOTD que Minecraft parse.
    /// Format Bedrock (semicolon-separated) :
    /// MCPE;<line1>;<protocol>;<version>;<online>;<max>;<serverGuid>;<line2>;<gamemode>;<gamemodeNum>;<ipv4Port>;<ipv6Port>
    static func makeMotdString(
        line1: String,
        line2: String,
        protocolVersion: Int = 685,
        gameVersion: String = "1.21.50",
        online: Int = 0,
        max: Int = 20,
        serverGuid: UInt64,
        gamemode: String = "Survival",
        gamemodeNum: Int = 1,
        ipv4Port: UInt16 = 19132,
        ipv6Port: UInt16 = 19133
    ) -> String {
        // On nettoie les points-virgules dans le MOTD pour ne pas casser le parsing.
        let safe1 = line1.replacingOccurrences(of: ";", with: ":")
        let safe2 = line2.replacingOccurrences(of: ";", with: ":")
        return [
            "MCPE",
            safe1,
            String(protocolVersion),
            gameVersion,
            String(online),
            String(max),
            String(serverGuid),
            safe2,
            gamemode,
            String(gamemodeNum),
            String(ipv4Port),
            String(ipv6Port)
        ].joined(separator: ";")
    }

    // MARK: - Bit helpers (big-endian)

    private static func readUInt64BE(_ data: Data, offset: Int) -> UInt64 {
        var v: UInt64 = 0
        for i in 0..<8 {
            v = (v << 8) | UInt64(data[offset + i])
        }
        return v
    }

    private static func appendUInt64BE(_ data: inout Data, _ value: UInt64) {
        for i in (0..<8).reversed() {
            data.append(UInt8((value >> (i * 8)) & 0xFF))
        }
    }
}
