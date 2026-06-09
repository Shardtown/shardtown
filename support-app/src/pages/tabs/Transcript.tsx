import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import { DiscordMessagesView, type MessageData } from '@/components/DiscordMessagesView/DiscordMessagesView';

interface TranscriptDetail {
    id: string;
    author_pseudo?: string;
    category?: string;
    created_at?: string;
    closed_at?: string;
    guild_id?: string;
    messages_data?: MessageData[];
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card-glass rounded-2xl p-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Transcription</p>
                    {loading && <p className="text-white/50 text-sm">Chargement...</p>}
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
                <div className="card-glass rounded-2xl overflow-hidden">
                    {(!transcript.messages_data || transcript.messages_data.length === 0) ? (
                        <div className="p-10 text-center">
                            <p className="text-white/40 text-sm">Aucun message dans cette transcription.</p>
                        </div>
                    ) : (
                        <DiscordMessagesView messages={transcript.messages_data} />
                    )}
                </div>
            )}
        </div>
    );
}
