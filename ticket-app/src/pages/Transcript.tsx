import { useParams, Link } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import type { Message } from '@/api/client';

export function TranscriptView() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi(() => api.transcript(id!), [id]);

  if (loading) return <Loading />;
  if (error || !data) return <Err msg={error || 'Introuvable'} />;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="../transcripts" className="text-xs btn-ghost px-0 mb-3 inline-flex">← Retour</Link>
          <h1 className="page-title">Transcript #{data.id}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="badge badge-purple capitalize">{data.category}</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {data.messages.length} message{data.messages.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Fermé le {new Date(data.closed_at).toLocaleString('fr-FR')}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="glass rounded-xl divide-y divide-white/[0.04]">
        {data.messages.map(msg => <MessageRow key={msg.id} msg={msg} />)}
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: Message }) {
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(msg.timestamp).toLocaleDateString('fr-FR');

  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <img
        src={msg.author.avatarURL}
        alt=""
        className="w-9 h-9 rounded-full flex-shrink-0 object-cover mt-0.5"
        onError={e => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={`text-sm font-medium ${msg.author.isBot ? 'text-blue-400' : 'text-white'}`}>
            {msg.author.displayName}
            {msg.author.isBot && <span className="ml-1.5 badge badge-purple text-xs py-0 px-1">BOT</span>}
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{date} {time}</span>
          {msg.edited && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>(modifié)</span>}
        </div>

        {msg.content && (
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.content}
          </p>
        )}

        {msg.embeds.map((embed, i) => (
          <div key={i} className="mt-2 rounded-md overflow-hidden border-l-4 pl-3 py-2"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: embed.color || '#7c3aed' }}>
            {embed.title && <p className="text-sm font-semibold text-white">{embed.title}</p>}
            {embed.description && <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap' }}>{embed.description}</p>}
            {embed.fields?.map((f, j) => (
              <div key={j} className={`mt-2 ${f.inline ? 'inline-block mr-4' : ''}`}>
                <p className="text-xs font-semibold text-white">{f.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{f.value}</p>
              </div>
            ))}
            {embed.image && <img src={embed.image} alt="" className="mt-2 max-w-xs rounded" />}
          </div>
        ))}

        {msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer"
                className="text-xs flex items-center gap-1.5 px-2 py-1 rounded"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#a78bfa' }}>
                📎 {a.name}
              </a>
            ))}
          </div>
        )}

        {msg.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.reactions.map((r, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {r.emoji} {r.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="p-8 flex items-center justify-center h-64">
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement du transcript...</span>
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="p-8">
      <div className="glass rounded-xl p-6 text-center">
        <p className="text-red-400">{msg}</p>
        <Link to="../transcripts" className="btn-ghost mt-3 text-sm">← Retour aux transcripts</Link>
      </div>
    </div>
  );
}
