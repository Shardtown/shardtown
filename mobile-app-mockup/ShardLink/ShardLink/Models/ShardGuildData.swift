import Foundation

// MARK: - Settings d'une guilde — miroir partiel de api/shard.ts ShardSettings

/// Tous les settings éditables d'une guilde Shard. On garde tout en String
/// pour matcher la souplesse de l'API serveur (qui accepte int|string sur
/// pas mal de champs) et éviter les parsings au save.
struct ShardSettings: Codable, Equatable, Sendable {
    // Welcome
    var welcomeChannelId: String = ""
    var welcomeTitle: String = ""
    var welcomeMessage: String = ""
    var welcomeFooter: String = ""
    var welcomeColor: String = "#3b82f6"

    // Leave
    var leaveChannelId: String = ""
    var leaveTitle: String = ""
    var leaveMessage: String = ""
    var leaveFooter: String = ""
    var leaveColor: String = "#6b7280"

    // AutoRole
    var autoRoleId: String = ""

    // TempVoice
    var tempVoiceTrigger: String = ""
    var tempVoiceCategory: String = ""
    var tempVoiceName: String = ""

    // Levels
    var levelsEnabled: Int? = 0
    var xpMin: Int = 15
    var xpMax: Int = 25
    var xpCooldown: Int = 60
    var levelUpChannelId: String = ""
    var levelUpMessage: String = ""
    var levelUpColor: String = "#3b82f6"

    // Tickets
    var ticketEnabled: Int? = 0
    var ticketCategoryId: String = ""
    var ticketSupportRoleId: String = ""
    var ticketLogChannelId: String = ""
    var ticketMaxPerUser: Int = 1
    var ticketPanelChannelId: String = ""
    var ticketPanelTitle: String = ""
    var ticketPanelDescription: String = ""
    var ticketPanelColor: String = "#3b82f6"

    // Birthday
    var birthdayChannelId: String = ""
    var birthdayMessage: String = ""
    var birthdayRoleId: String = ""

    // Economy
    var economyEnabled: Int? = 0
    var economyCurrencyName: String = "coins"
    var economyDailyMin: Int = 50
    var economyDailyMax: Int = 200

    // Global
    var timezone: String = "Europe/Paris"
    var embedColor: String = "#5865F2"

    /// Construit le dict à POST sur /shard/guild/:id/config.
    func asPayload() -> [String: Any] {
        [
            "welcomeChannelId": welcomeChannelId,
            "welcomeTitle": welcomeTitle,
            "welcomeMessage": welcomeMessage,
            "welcomeFooter": welcomeFooter,
            "welcomeColor": welcomeColor,
            "leaveChannelId": leaveChannelId,
            "leaveTitle": leaveTitle,
            "leaveMessage": leaveMessage,
            "leaveFooter": leaveFooter,
            "leaveColor": leaveColor,
            "autoRoleId": autoRoleId,
            "tempVoiceTrigger": tempVoiceTrigger,
            "tempVoiceCategory": tempVoiceCategory,
            "tempVoiceName": tempVoiceName,
            "levelsEnabled": levelsEnabled ?? 0,
            "xpMin": xpMin,
            "xpMax": xpMax,
            "xpCooldown": xpCooldown,
            "levelUpChannelId": levelUpChannelId,
            "levelUpMessage": levelUpMessage,
            "levelUpColor": levelUpColor,
            "ticketEnabled": ticketEnabled ?? 0,
            "ticketCategoryId": ticketCategoryId,
            "ticketSupportRoleId": ticketSupportRoleId,
            "ticketLogChannelId": ticketLogChannelId,
            "ticketMaxPerUser": ticketMaxPerUser,
            "ticketPanelChannelId": ticketPanelChannelId,
            "ticketPanelTitle": ticketPanelTitle,
            "ticketPanelDescription": ticketPanelDescription,
            "ticketPanelColor": ticketPanelColor,
            "birthdayChannelId": birthdayChannelId,
            "birthdayMessage": birthdayMessage,
            "birthdayRoleId": birthdayRoleId,
            "economyEnabled": economyEnabled ?? 0,
            "economyCurrencyName": economyCurrencyName,
            "economyDailyMin": economyDailyMin,
            "economyDailyMax": economyDailyMax,
            "timezone": timezone,
            "embedColor": embedColor,
        ]
    }
}

// MARK: - Channel / Role Discord

struct DiscordChannel: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
}

struct DiscordRole: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let color: Int?
}

// MARK: - Réponse complète /api/shard/guild/:id

struct ShardGuildData: Codable, Sendable {
    struct Guild: Codable, Sendable {
        let id: String
        let name: String
        let icon: String?
    }
    let guild: Guild
    let channels: [DiscordChannel]
    let voiceChannels: [DiscordChannel]?
    let categories: [DiscordChannel]?
    let roles: [DiscordRole]
    let settings: ShardSettings
}
