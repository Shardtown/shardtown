import SwiftUI

// MARK: - Couleurs Discord (thème Onyx 2023+)

enum DiscordColor {
    static let bgPrimary    = Color(red: 0.118, green: 0.122, blue: 0.133)  // #1E1F22
    static let bgSecondary  = Color(red: 0.168, green: 0.176, blue: 0.192)  // #2B2D31
    static let bgTertiary   = Color(red: 0.184, green: 0.192, blue: 0.208)  // #2F3136
    static let bgEmbed      = Color(red: 0.184, green: 0.192, blue: 0.208)  // #2F3136
    static let textNormal   = Color(red: 0.949, green: 0.953, blue: 0.961)  // #F2F3F5
    static let textMuted    = Color(red: 0.710, green: 0.729, blue: 0.757)  // #B5BAC1
    static let textLink     = Color(red: 0.0,   green: 0.659, blue: 0.988)  // #00A8FC
    static let mentionBg    = Color(red: 0.345, green: 0.396, blue: 0.949).opacity(0.30)
    static let mentionText  = Color(red: 0.749, green: 0.776, blue: 1.0)
    static let blurple      = Color(red: 0.345, green: 0.396, blue: 0.949)  // #5865F2
    static let separator    = Color.white.opacity(0.06)
    static let buttonBlurple = Color(red: 0.345, green: 0.396, blue: 0.949)
    static let buttonGreen   = Color(red: 0.149, green: 0.682, blue: 0.380) // #248046
    static let buttonRed     = Color(red: 0.855, green: 0.286, blue: 0.286) // #DA373C
    static let buttonGrey    = Color(red: 0.310, green: 0.322, blue: 0.349) // #4E5058
}

// MARK: - Message Discord complet (avatar bot + name + embed)

struct DiscordMessagePreview<Embed: View>: View {
    let botName: String
    let avatarURL: URL?
    let timestamp: String
    @ViewBuilder var embed: () -> Embed
    var content: String = ""

    init(
        botName: String = "Shard",
        avatarURL: URL? = nil,
        timestamp: String = "Aujourd'hui",
        content: String = "",
        @ViewBuilder embed: @escaping () -> Embed
    ) {
        self.botName = botName
        self.avatarURL = avatarURL
        self.timestamp = timestamp
        self.content = content
        self.embed = embed
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(botName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(DiscordColor.textNormal)
                    botBadge
                    Text(timestamp)
                        .font(.system(size: 11))
                        .foregroundStyle(DiscordColor.textMuted)
                }
                if !content.isEmpty {
                    DiscordRichText(content)
                        .font(.system(size: 14))
                        .foregroundStyle(DiscordColor.textNormal)
                }
                embed()
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DiscordColor.bgPrimary)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .environment(\.colorScheme, .dark)
    }

    @ViewBuilder
    private var avatar: some View {
        AsyncImage(url: avatarURL) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            default:
                Circle()
                    .fill(LinearGradient(colors: [.indigo, .purple], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(Image(systemName: "bolt.fill").font(.body.weight(.semibold)).foregroundStyle(.white))
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
    }

    private var botBadge: some View {
        Text("APP")
            .font(.system(size: 9, weight: .bold))
            .kerning(0.4)
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 1.5)
            .background(DiscordColor.buttonBlurple)
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
    }
}

// MARK: - Embed Discord (avec barre couleur à gauche)

struct DiscordEmbedView: View {
    var color: String = "#3b82f6"
    var authorName: String? = nil
    var authorIconURL: URL? = nil
    var title: String = ""
    var titleURL: URL? = nil
    var description: String = ""
    var fields: [Field] = []
    var imageURL: URL? = nil
    var thumbnailURL: URL? = nil
    var footerText: String = ""
    var footerIconURL: URL? = nil
    var timestamp: String? = nil

    struct Field: Hashable {
        let name: String
        let value: String
        let inline: Bool
    }

    private var resolvedColor: Color {
        Color(hex: color) ?? DiscordColor.blurple
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Barre couleur à gauche
            Rectangle()
                .fill(resolvedColor)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 8) {
                if let authorName, !authorName.isEmpty {
                    HStack(spacing: 6) {
                        if let authorIconURL {
                            AsyncImage(url: authorIconURL) { phase in
                                if case .success(let img) = phase { img.resizable().scaledToFill() }
                                else { Color.gray.opacity(0.3) }
                            }
                            .frame(width: 22, height: 22)
                            .clipShape(Circle())
                        }
                        Text(authorName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(DiscordColor.textNormal)
                    }
                }

                if !title.isEmpty {
                    if titleURL != nil {
                        Text(title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(DiscordColor.textLink)
                    } else {
                        Text(title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(DiscordColor.textNormal)
                    }
                }

                if !description.isEmpty {
                    DiscordRichText(description)
                        .font(.system(size: 14))
                        .foregroundStyle(DiscordColor.textNormal)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !fields.isEmpty {
                    fieldsGrid
                        .padding(.top, 4)
                }

                if let imageURL {
                    AsyncImage(url: imageURL) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFit()
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                    }
                }

                if !footerText.isEmpty || timestamp != nil {
                    HStack(spacing: 6) {
                        if let footerIconURL {
                            AsyncImage(url: footerIconURL) { phase in
                                if case .success(let img) = phase { img.resizable().scaledToFill() }
                                else { Color.gray.opacity(0.3) }
                            }
                            .frame(width: 18, height: 18)
                            .clipShape(Circle())
                        }
                        if !footerText.isEmpty {
                            Text(footerText)
                                .font(.system(size: 12))
                                .foregroundStyle(DiscordColor.textMuted)
                        }
                        if let timestamp {
                            if !footerText.isEmpty {
                                Text("·").foregroundStyle(DiscordColor.textMuted).font(.system(size: 12))
                            }
                            Text(timestamp)
                                .font(.system(size: 12))
                                .foregroundStyle(DiscordColor.textMuted)
                        }
                    }
                    .padding(.top, 2)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Spacer(minLength: 0)

            // Thumbnail à droite (80x80)
            if let thumbnailURL {
                AsyncImage(url: thumbnailURL) { phase in
                    if case .success(let img) = phase { img.resizable().scaledToFill() }
                    else { Color.gray.opacity(0.2) }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .padding(.trailing, 12)
                .padding(.top, 10)
            }
        }
        .background(DiscordColor.bgEmbed)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    private var fieldsGrid: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(fields, id: \.self) { f in
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DiscordColor.textNormal)
                    DiscordRichText(f.value)
                        .font(.system(size: 14))
                        .foregroundStyle(DiscordColor.textNormal)
                }
            }
        }
    }
}

// MARK: - Bouton Discord (Primary/Success/Danger/Secondary)

struct DiscordButton: View {
    enum Style: Int { case primary = 1, secondary = 2, success = 3, danger = 4 }

    let label: String
    let emoji: String
    var style: Style = .primary

    private var bg: Color {
        switch style {
        case .primary:   DiscordColor.buttonBlurple
        case .secondary: DiscordColor.buttonGrey
        case .success:   DiscordColor.buttonGreen
        case .danger:    DiscordColor.buttonRed
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            if !emoji.isEmpty {
                Text(emoji).font(.system(size: 14))
            }
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

// MARK: - Rich text — markdown + mentions <@id>, <#id>, <:emoji:id>

struct DiscordRichText: View {
    let raw: String

    init(_ raw: String) { self.raw = raw }

    var body: some View {
        let resolved = renderMarkdown(replaceTokens(raw))
        Text(resolved)
            .textSelection(.enabled)
    }

    /// Remplace les variables {user} {server} {count} par des exemples.
    private func replaceTokens(_ s: String) -> String {
        s.replacingOccurrences(of: "{user}", with: "@nouveau-membre")
         .replacingOccurrences(of: "{server}", with: "Mon Serveur")
         .replacingOccurrences(of: "{count}", with: "1 247")
         .replacingOccurrences(of: "{level}", with: "5")
    }

    /// Parse markdown standard + style les @mentions.
    private func renderMarkdown(_ s: String) -> AttributedString {
        var attr: AttributedString
        do {
            attr = try AttributedString(
                markdown: s,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .inlineOnlyPreservingWhitespace
                )
            )
        } catch {
            attr = AttributedString(s)
        }

        // Style les mentions commençant par @ (sample output après tokens)
        let plain = String(attr.characters)
        if let range = plain.range(of: #"@[a-zA-Z0-9-_]+"#, options: .regularExpression) {
            if let attrRange = Range(NSRange(range, in: plain), in: attr) {
                attr[attrRange].foregroundColor = DiscordColor.mentionText
                attr[attrRange].backgroundColor = DiscordColor.mentionBg
            }
        }
        return attr
    }
}
