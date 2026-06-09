import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import { DiscordMessagesView, type MessageData, type MessageAsset } from '@/components/DiscordMessagesView/DiscordMessagesView';

/* ── Raw message format stored in DB by exportMessages() ── */
interface RawAuthor {
    id?: string;
    username?: string;
    displayName?: string;
    avatarURL?: string;
    isBot?: boolean;
    isApp?: boolean;
    name?: string;
}

interface RawAttachment {
    name?: string;
    url: string;
    contentType?: string;
}

interface RawEmbed {
    color?: string | number | null;
    title?: string;
    description?: string;
    image?: string | null;
    thumbnail?: string | null;
    footer?: { text: string } | null;
    fields?: { name: string; value: string; inline?: boolean }[];
    timestamp?: string | null;
}

interface RawMessage {
    id?: string;
    content?: string;
    timestamp?: number | string;
    edited?: boolean;
    author?: RawAuthor;
    embeds?: RawEmbed[];
    attachments?: RawAttachment[];
    reactions?: { emoji: string; count: number }[];
    assets?: MessageAsset[];
}

interface TranscriptDetail {
    id: string;
    author_pseudo?: string;
    category?: string;
    created_at?: string;
    closed_at?: string;
    guild_id?: string;
    /** New format (MessageData[]) */
    messages_data?: MessageData[];
    /** DB format — field returned by getTranscriptById */
    messages?: RawMessage[];
}

/* ── Convert DB raw format → MessageData ── */
function toMessageData(raw: RawMessage): MessageData {
    const author = raw.author ?? {};
    const name = author.displayName || author.username || author.name || 'Inconnu';

    const assets: MessageAsset[] = [];

    // Legacy: attachments array from exportMessages()
    if (raw.attachments) {
        for (const a of raw.attachments) {
            const ct = a.contentType || '';
            let type: MessageAsset['type'] = 'file';
            if (ct.startsWith('image/')) type = 'image';
            else if (ct.startsWith('video/')) type = 'video';
            else if (ct.startsWith('audio/')) type = 'audio';
            assets.push({ type, url: a.url, name: a.name, contentType: a.contentType });
        }
    }
    // Already-converted assets
    if (raw.assets) assets.push(...raw.assets);

    const embeds = (raw.embeds ?? []).map(e => ({
        color: e.color ?? undefined,
        title: e.title ?? undefined,
        description: e.description ?? undefined,
        image: e.image ?? undefined,
        thumbnail: e.thumbnail ?? undefined,
        footer: e.footer ?? undefined,
        fields: e.fields ?? undefined,
    }));

    return {
        id: raw.id,
        author: {
            name,
            avatarURL: author.avatarURL,
            isApp: author.isBot ?? author.isApp,
        },
        content: raw.content || undefined,
        timestamp: raw.timestamp,
        edited: raw.edited,
        assets: assets.length > 0 ? assets : undefined,
        embeds: embeds.length > 0 ? embeds : undefined,
        reactions: raw.reactions,
    };
}

export default function Transcript() {
    const { guildId, id } = useParams<{ guildId: string; id: string }>();
    const navigate = useNavigate();
    const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        get<TranscriptDetail>(`/api/support/transcript/${id}`)
            .then(data => setTranscript(data))
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [id]);

    // Resolve messages from either format
    const rawMessages: MessageData[] = (() => {
        if (!transcript) return [];
        if (transcript.messages_data?.length) return transcript.messages_data;
        if (transcript.messages?.length) return transcript.messages.map(toMessageData);
        return [];
    })();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Transcription</p>
                    {loading && <p className="text-white/50 text-sm">Chargement…</p>}
                    {!loading && notFound && <p className="text-white/50 text-sm">Transcription introuvable.</p>}
                    {!loading && transcript && (
                        <>
                            <h2 className="text-xl font-extrabold tracking-tight font-mono">{transcript.id}</h2>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {transcript.category && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                                        {transcript.category}
                                    </span>
                                )}
                                {transcript.author_pseudo && (
                                    <span className="text-white/40 text-xs">{transcript.author_pseudo}</span>
                                )}
                                {rawMessages.length > 0 && (
                                    <span className="text-white/30 text-xs">{rawMessages.length} message{rawMessages.length !== 1 ? 's' : ''}</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => navigate(`/guild/${guildId}/transcripts`)}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.1] text-sm font-semibold text-white/60 hover:text-white hover:bg-white/[0.09] transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" width="7" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m9 1-7 7 7 7" />
                    </svg>
                    Retour
                </button>
            </div>

            {!loading && transcript && (
                <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl overflow-hidden">
                    {rawMessages.length === 0 ? (
                        <div className="p-10 text-center">
                            <p className="text-white/40 text-sm">Aucun message dans cette transcription.</p>
                        </div>
                    ) : (
                        <DiscordMessagesView messages={rawMessages} />
                    )}
                </div>
            )}
        </div>
    );
}
