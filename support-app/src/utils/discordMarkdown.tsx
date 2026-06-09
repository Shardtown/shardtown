import React from 'react';
import {
    DiscordBold,
    DiscordCode,
    DiscordCustomEmoji,
    DiscordItalic,
    DiscordLink,
    DiscordListItem,
    DiscordMention,
    DiscordOrderedList,
    DiscordQuote,
    DiscordSpoiler,
    DiscordUnderlined,
    DiscordUnorderedList
} from "@skyra/discord-components-react";

type MentionData = {
    users?: Array<{ id: string; name: string; displayName?: string }>;
    roles?: Array<{ id: string; name: string }>;
    channels?: Array<{ id: string; name: string }>;
};

type CustomEmoji = { name: string; id: string; animated: boolean };

const HEADING_STYLES = {
    h1: { margin: '0.5em 0', fontSize: '1.75em', fontWeight: 'bold' },
    h2: { margin: '0.5em 0', fontSize: '1.5em', fontWeight: 'bold' },
    h3: { margin: '0.5em 0', fontSize: '1.25em', fontWeight: 'bold' },
    subtext: { color: '#949ba4', fontSize: '0.875em', marginTop: '0.5em' },
} as const;

const MARKDOWN_PATTERNS = [
    { regex: /`([^`]+)`/g, type: 'code' },
    { regex: /\|\|([\s\S]*?)\|\|/g, type: 'spoiler' },
    { regex: /__([\s\S]*?)__/g, type: 'underline' },
    { regex: /\*\*\*([\s\S]*?)\*\*\*/g, type: 'boldItalic' },
    { regex: /\*\*([\s\S]*?)\*\*/g, type: 'bold' },
    { regex: /\*([\s\S]*?)\*/g, type: 'italic' },
    { regex: /_([\s\S]*?)_/g, type: 'italic' },
    { regex: /~~([\s\S]*?)~~/g, type: 'strikethrough' },
    { regex: /https?:\/\/[^\s)>]+/g, type: 'urlLink' },
    { regex: /\[([\s\S]*?)]\((https?:\/\/[^)]+)\)/g, type: 'link' },
    { regex: /<@!?(\d+)>/g, type: 'userMention' },
    { regex: /<#(\d+)>/g, type: 'channelMention' },
    { regex: /<@&(\d+)>/g, type: 'roleMention' },
    { regex: /<a?:(\w+):(\d+)>/g, type: 'emoji' },
] as const;

export const colorToHex = (color?: string | number | null): string | undefined => {
    if (color == null) return undefined;
    if (typeof color === 'string' && color.startsWith('#')) return color as string;
    if (typeof color !== 'number') return undefined;
    return ('#' + (color & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase());
};

export const parseCustomEmoji = (emojiString: string): CustomEmoji | null => {
    const match = emojiString.match(/<(a)?:(\w+):(\d+)>/);
    return match ? { animated: !!match[1], name: match[2], id: match[3] } : null;
};

export const getEmojiImageUrl = (emojiString: string): string | undefined => {
    const parsed = parseCustomEmoji(emojiString);
    if (!parsed) return undefined;
    const ext = parsed.animated ? 'gif' : 'png';
    return `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}`;
};

const findMentionName = (id: string, type: 'user' | 'channel' | 'role', mentions?: MentionData): string => {
    if (type === 'user') {
        const user = mentions?.users?.find(u => u.id === id);
        return user?.displayName ?? user?.name ?? 'User';
    }
    if (type === 'channel') return mentions?.channels?.find(c => c.id === id)?.name ?? 'Channel';
    if (type === 'role') return mentions?.roles?.find(r => r.id === id)?.name ?? 'Role';
    return '';
};

const renderMarkdownNode = (type: string, groups: RegExpExecArray, index: number, depth: number, mentions?: MentionData): React.ReactNode => {
    switch (type) {
        case 'boldItalic':
            return <DiscordBold key={`bolditalic-${index}`}><DiscordItalic>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</DiscordItalic></DiscordBold>;
        case 'bold':
            return <DiscordBold key={`bold-${index}`}>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</DiscordBold>;
        case 'italic':
            return <DiscordItalic key={`italic-${index}`}>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</DiscordItalic>;
        case 'underline':
            return <DiscordUnderlined key={`underline-${index}`}>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</DiscordUnderlined>;
        case 'strikethrough':
            return <s key={`strikethrough-${index}`}>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</s>;
        case 'spoiler':
            return <DiscordSpoiler key={`spoiler-${index}`}>{parseInlineMarkdown(groups[1], depth + 1, mentions)}</DiscordSpoiler>;
        case 'code':
            return <DiscordCode key={`code-${index}`}>{groups[1]}</DiscordCode>;
        case 'link':
            return <DiscordLink key={`link-${index}`} href={groups[2]} target="_blank" rel="noopener noreferrer">{groups[1]}</DiscordLink>;
        case 'urlLink':
            return <DiscordLink key={`urllink-${index}`} href={groups[0]} target="_blank" rel="noopener noreferrer">{groups[0]}</DiscordLink>;
        case 'userMention':
            return <DiscordMention key={`mention-${index}`}>{findMentionName(groups[1], 'user', mentions)}</DiscordMention>;
        case 'channelMention':
            return <DiscordMention key={`mention-${index}`} type="channel">{findMentionName(groups[1], 'channel', mentions)}</DiscordMention>;
        case 'roleMention':
            return <DiscordMention key={`mention-${index}`} type="role">{findMentionName(groups[1], 'role', mentions)}</DiscordMention>;
        case 'emoji':
            const emoji = parseCustomEmoji(groups[0]);
            return <DiscordCustomEmoji key={`emoji-${index}`} name={emoji?.name} url={getEmojiImageUrl(groups[0])} />;
        default:
            return null;
    }
};

const parseInlineMarkdown = (text: string, depth: number, mentions?: MentionData): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    const matches: { index: number; end: number; type: string; groups: RegExpExecArray }[] = [];

    for (const pattern of MARKDOWN_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({ index: match.index, end: match.index + match[0].length, type: pattern.type, groups: match });
        }
    }

    matches.sort((a, b) => a.index - b.index);

    for (const match of matches) {
        if (match.index < lastIndex) continue;
        if (match.index > lastIndex) nodes.push(text.substring(lastIndex, match.index));
        const node = renderMarkdownNode(match.type, match.groups, match.index, depth, mentions);
        if (node) nodes.push(node);
        lastIndex = match.end;
    }

    if (lastIndex < text.length) nodes.push(text.substring(lastIndex));
    return nodes.length > 0 ? nodes : [text];
};

const parseNestedList = (lines: string[], startIndex: number, baseIndentation: number, isOrdered: boolean, mentions?: MentionData): { items: React.ReactNode[]; nextIndex: number; startNumber?: number } => {
    const items: React.ReactNode[] = [];
    let i = startIndex;
    let startNumber = 1;
    const listRegex = isOrdered ? /^(\s*)(\d+)\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;

    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(listRegex);
        if (!match) break;
        const indentation = match[1].length;
        if (indentation < baseIndentation) break;
        if (isOrdered && baseIndentation === 0 && i === startIndex) startNumber = parseInt(match[2], 10);
        if (indentation > baseIndentation) {
            i--;
            const nested = parseNestedList(lines, i, indentation, isOrdered, mentions);
            if (nested.items.length > 0) {
                const ListComponent = isOrdered ? DiscordOrderedList : DiscordUnorderedList;
                items.push(<ListComponent key={`list-${i}`} {...(isOrdered && { start: nested.startNumber })}>{nested.items}</ListComponent>);
            }
            i = nested.nextIndex;
            continue;
        }
        const itemText = isOrdered ? match[3] : match[2];
        items.push(<DiscordListItem key={`li-${i}`}>{parseInlineMarkdown(itemText, 1, mentions)}</DiscordListItem>);
        i++;
        if (i < lines.length) {
            const nextLine = lines[i];
            const nextMatch = nextLine.match(isOrdered ? /^(\s*)(\d+)\.\s+/ : /^(\s*)[-*]\s+/);
            if (nextMatch && nextMatch[1].length > baseIndentation) {
                const nested = parseNestedList(lines, i, nextMatch[1].length, isOrdered, mentions);
                if (nested.items.length > 0) {
                    const ListComponent = isOrdered ? DiscordOrderedList : DiscordUnorderedList;
                    items.push(<ListComponent key={`list-${i}`} {...(isOrdered && { start: nested.startNumber })}>{nested.items}</ListComponent>);
                }
                i = nested.nextIndex;
            }
        }
    }

    return { items, nextIndex: i, ...(isOrdered && { startNumber }) };
};

const parseHeading = (text: string, level: 1 | 2 | 3, index: number, depth: number, mentions?: MentionData) => {
    const style = level === 1 ? HEADING_STYLES.h1 : level === 2 ? HEADING_STYLES.h2 : HEADING_STYLES.h3;
    const HeadingTag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
    return React.createElement(HeadingTag, { key: `h${level}-${index}`, style }, parseInlineMarkdown(text, depth + 1, mentions));
};

const parseBlockquote = (lines: string[], startIndex: number, index: number, depth: number, mentions?: MentionData) => {
    const blockquoteLines = [];
    let i = startIndex;
    while (i < lines.length && lines[i].trim().startsWith('> ')) {
        blockquoteLines.push(lines[i].substring(lines[i].indexOf('>') + 1).trim());
        i++;
    }
    return {
        node: <DiscordQuote key={`blockquote-${index}`}>{parseInlineMarkdown(blockquoteLines.join('\n'), depth + 1, mentions)}</DiscordQuote>,
        nextIndex: i,
    };
};

export const parseDiscordMarkdown = (text: string, depth: number = 0, mentions?: MentionData): React.ReactNode[] => {
    if (depth > 10) return [text];

    const nodes: React.ReactNode[] = [];
    const codeblockRegex = /(?<!\\)(?<start>```)(?<=```)(?:(?<lang>[a-z][a-z0-9]*)\s)?(?<content>[\s\S]*?)(?<!\\)(?=```)(?<end>(?:\\\\)*```)/gs;
    let lastIndex = 0;
    let match;

    while ((match = codeblockRegex.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(...parseDiscordMarkdownLines(text.substring(lastIndex, match.index), depth, mentions));
        const rawContent = match.groups?.content || '';
        const content = rawContent.replace(/^\n+|\n+$/g, '');
        nodes.push(<DiscordCode key={`codeblock-${match.index}`} multiline>{content}</DiscordCode>);
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) nodes.push(...parseDiscordMarkdownLines(text.substring(lastIndex), depth, mentions));
    return nodes.length > 0 ? nodes : [text];
};

const parseDiscordMarkdownLines = (text: string, depth: number, mentions?: MentionData): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('### ')) {
            nodes.push(parseHeading(line.substring(4), 3, i, depth, mentions));
            i++;
        } else if (trimmedLine.startsWith('## ')) {
            nodes.push(parseHeading(line.substring(3), 2, i, depth, mentions));
            i++;
        } else if (trimmedLine.startsWith('# ')) {
            nodes.push(parseHeading(line.substring(2), 1, i, depth, mentions));
            i++;
        } else if (trimmedLine.startsWith('-# ')) {
            nodes.push(<div key={`subtext-${i}`} style={HEADING_STYLES.subtext}>{parseInlineMarkdown(line.substring(3), depth + 1, mentions)}</div>);
            i++;
        } else if (trimmedLine.startsWith('> ')) {
            const result = parseBlockquote(lines, i, i, depth, mentions);
            nodes.push(result.node);
            i = result.nextIndex;
        } else if (trimmedLine.match(/^[-*]\s+/)) {
            const parsed = parseNestedList(lines, i, 0, false, mentions);
            if (parsed.items.length > 0) nodes.push(<DiscordUnorderedList key={`ul-${i}`}>{parsed.items}</DiscordUnorderedList>);
            i = parsed.nextIndex;
        } else if (trimmedLine.match(/^\d+\.\s+/)) {
            const parsed = parseNestedList(lines, i, 0, true, mentions);
            if (parsed.items.length > 0) nodes.push(<DiscordOrderedList key={`ol-${i}`} start={parsed.startNumber}>{parsed.items}</DiscordOrderedList>);
            i = parsed.nextIndex;
        } else if (trimmedLine === '') {
            nodes.push(<br key={`br-${i}`} />);
            i++;
        } else {
            nodes.push(<div key={`line-${i}`}>{parseInlineMarkdown(line, depth + 1, mentions)}</div>);
            i++;
        }
    }

    return nodes.length > 0 ? nodes : [text];
};
