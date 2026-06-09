import React from 'react';
import {
    DiscordMessages,
    DiscordMessage,
    DiscordReply,
    DiscordEmbed,
    DiscordEmbedDescription,
    DiscordEmbedField,
    DiscordEmbedFields,
    DiscordEmbedFooter,
    DiscordReactions,
    DiscordReaction,
    DiscordActionRow,
    DiscordButton,
    DiscordImageAttachment,
    DiscordAudioAttachment,
    DiscordFileAttachment,
    DiscordVideoAttachment,
    DiscordInvite,
} from '@skyra/discord-components-react';
import { parseDiscordMarkdown, colorToHex, parseCustomEmoji, getEmojiImageUrl } from '../../utils/discordMarkdown';
import { formatDiscordTimestamp } from '../../utils/timeUtils';
import './DiscordMessagesView.css';

export interface MessageAsset {
    type: 'image' | 'video' | 'file' | 'audio';
    url: string;
    alt?: string;
    width?: number;
    height?: number;
    poster?: string;
    name?: string;
    bytes?: number;
    bytesUnit?: string;
    contentType?: string;
}

export interface MessageEmbed {
    color?: string | number | null;
    title?: string;
    description?: string;
    image?: string;
    thumbnail?: string;
    footer?: { text: string };
    fields?: { name: string; value: string; inline?: boolean }[];
}

export interface MessageReaction {
    emoji: string;
    count: number;
}

export interface MessageComponentButton {
    label?: string;
    url?: string;
    disabled?: boolean;
    style?: string | number;
}

export interface MessageAuthor {
    name: string;
    avatarURL?: string;
    isApp?: boolean;
    isVerified?: boolean;
}

export interface MessageMentions {
    users?: Array<{ id: string; name: string; displayName?: string }>;
    roles?: Array<{ id: string; name: string }>;
    channels?: Array<{ id: string; name: string }>;
}

export interface MessageData {
    id?: string;
    author: MessageAuthor;
    content?: string;
    timestamp?: string | number;
    edited?: boolean;
    reply?: {
        author: MessageAuthor;
        content: string;
    };
    assets?: MessageAsset[];
    embeds?: MessageEmbed[];
    reactions?: MessageReaction[];
    components?: { components: MessageComponentButton[] }[];
    discordInvites?: {
        name: string;
        url: string;
        icon?: string;
        online?: number;
        members?: number;
        verified?: boolean;
        partnered?: boolean;
    }[];
    mentions?: MessageMentions;
}

interface Props {
    messages: MessageData[];
}

export const DiscordMessagesView: React.FC<Props> = ({ messages }) => (
    <DiscordMessages className="discord-messages-container" noBackground>
        {messages.map((msg, msgIdx) => (
            <DiscordMessage
                key={msg.id ?? msgIdx}
                author={msg.author.name}
                avatar={msg.author.avatarURL}
                bot={msg.author.isApp}
                verified={msg.author.isVerified}
                timestamp={formatDiscordTimestamp(msg.timestamp)}
                edited={msg.edited}
            >
                {msg.reply && (
                    <DiscordReply
                        author={msg.reply.author.name}
                        avatar={msg.reply.author.avatarURL}
                        style={{ maxWidth: '100%' }}
                        bot={msg.reply.author.isApp}
                    >
                        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            {msg.reply.content.split('\n')[0]}
                        </span>
                    </DiscordReply>
                )}

                {msg.content && parseDiscordMarkdown(msg.content, 0, msg.mentions)}

                {msg.assets?.map((asset, idx) => {
                    switch (asset.type) {
                        case 'image':
                            return (
                                <DiscordImageAttachment
                                    key={idx}
                                    slot="attachments"
                                    url={asset.url}
                                    alt={asset.alt}
                                    width={asset.width ? asset.width / 3 : undefined}
                                    height={asset.height ? asset.height / 3 : undefined}
                                />
                            );
                        case 'video':
                            return (
                                <DiscordVideoAttachment
                                    key={idx}
                                    slot="attachments"
                                    href={asset.url}
                                    poster={asset.poster}
                                />
                            );
                        case 'file':
                            return (
                                <DiscordFileAttachment
                                    key={idx}
                                    slot="attachments"
                                    href={asset.url}
                                    name={asset.name}
                                    bytes={asset.bytes}
                                    bytesUnit={asset.bytesUnit}
                                    type={asset.contentType}
                                />
                            );
                        case 'audio':
                            return (
                                <DiscordAudioAttachment
                                    key={idx}
                                    slot="attachments"
                                    href={asset.url}
                                    name={asset.name}
                                    bytes={asset.bytes}
                                    bytesUnit={asset.bytesUnit}
                                />
                            );
                        default:
                            return null;
                    }
                })}

                {msg.embeds?.map((embed, idx) => (
                    <div key={idx}>
                        <DiscordEmbed
                            slot="embeds"
                            color={colorToHex(embed.color)}
                            embedTitle={embed.title}
                            image={embed.image ?? undefined}
                        >
                            {embed.description && (
                                <DiscordEmbedDescription slot="description">
                                    {parseDiscordMarkdown(embed.description, 0, msg.mentions)}
                                </DiscordEmbedDescription>
                            )}
                            {embed.thumbnail && (
                                <DiscordImageAttachment slot="thumbnail" url={embed.thumbnail} alt="thumbnail" />
                            )}
                            {embed.fields && embed.fields.length > 0 && (
                                <DiscordEmbedFields slot="fields">
                                    {embed.fields.map((field, fIdx) => (
                                        <DiscordEmbedField key={fIdx} fieldTitle={field.name} inline={field.inline}>
                                            {parseDiscordMarkdown(field.value, 0, msg.mentions)}
                                        </DiscordEmbedField>
                                    ))}
                                </DiscordEmbedFields>
                            )}
                            {embed.footer && <DiscordEmbedFooter slot="footer">{embed.footer.text}</DiscordEmbedFooter>}
                        </DiscordEmbed>
                    </div>
                ))}

                {msg.reactions && msg.reactions.length > 0 && (
                    <DiscordReactions slot="reactions">
                        {msg.reactions.map((reaction, rIdx) => {
                            const parsed = parseCustomEmoji(reaction.emoji);
                            const imgUrl = parsed ? getEmojiImageUrl(reaction.emoji) : null;
                            return (
                                <DiscordReaction
                                    key={rIdx}
                                    emoji={imgUrl || reaction.emoji}
                                    count={reaction.count}
                                />
                            );
                        })}
                    </DiscordReactions>
                )}

                {msg.discordInvites?.map((invite, idx) => (
                    <DiscordInvite
                        key={idx}
                        name={invite.name}
                        url={invite.url}
                        icon={invite.icon}
                        online={invite.online}
                        members={invite.members}
                        verified={invite.verified}
                        partnered={invite.partnered}
                    />
                ))}

                {msg.components?.map((row, rowIdx) => (
                    <DiscordActionRow key={rowIdx} slot="components" style={{ marginTop: '2px' }}>
                        {row.components.map((btn, btnIdx) => {
                            const styleMap: Record<string | number, 'primary' | 'secondary' | 'success' | 'destructive'> = {
                                1: 'primary', 2: 'secondary', 3: 'success', 4: 'destructive',
                                'primary': 'primary', 'secondary': 'secondary', 'success': 'success', 'destructive': 'destructive',
                            };
                            return (
                                <DiscordButton
                                    key={btnIdx}
                                    url={btn.url}
                                    disabled={btn.disabled}
                                    type={styleMap[btn.style ?? 2] || 'secondary'}
                                >
                                    {btn.label}
                                </DiscordButton>
                            );
                        })}
                    </DiscordActionRow>
                ))}
            </DiscordMessage>
        ))}
    </DiscordMessages>
);
