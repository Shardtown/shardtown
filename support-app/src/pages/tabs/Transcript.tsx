import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get } from '@/api/client';
import { DiscordMessagesView, type MessageData } from '@/components/DiscordMessagesView/DiscordMessagesView';
import './Transcript.css';

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
        <div className="page-transcript">
            <div className="transcript-header pala-item pala-item-subtitle primary">
                <div className="pala-item pala-item-subtitle primary">
                    <div className="pala-item-subtitle-container">
                        <h4>Transcription</h4>
                    </div>
                    {loading && <p className="pala-item-subtitle-text">Chargement...</p>}
                    {!loading && notFound && <p className="pala-item-subtitle-text">Transcription introuvable.</p>}
                    {!loading && transcript && (
                        <p className="pala-item-subtitle-text">
                            ID : {transcript.id}
                            {transcript.category && <> · Catégorie : <span className="transcript-info-value">{transcript.category}</span></>}
                            {transcript.author_pseudo && <> · Auteur : <span className="transcript-info-value">{transcript.author_pseudo}</span></>}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    className="pala-item-button second width-auto"
                    style={{ minHeight: 36, padding: '0 1em', width: 'auto' }}
                    onClick={() => navigate(`/guild/${guildId}/transcripts`)}
                >
                    <span className="pala-item-button-content">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.182 16.121" width="7" height="auto">
                            <path fill="none" stroke="currentColor" strokeWidth="3" d="m9.121 1.061-7 7 7 7" />
                        </svg>
                        <p>Retour</p>
                    </span>
                </button>
            </div>

            {!loading && transcript && (
                <div className="transcript-messages pala-item">
                    {(!transcript.messages_data || transcript.messages_data.length === 0) ? (
                        <div className="pala-empty"><p>Aucun message dans cette transcription.</p></div>
                    ) : (
                        <DiscordMessagesView messages={transcript.messages_data} />
                    )}
                </div>
            )}
        </div>
    );
}
