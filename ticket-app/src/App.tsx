import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from '@/api/client';
import type { Me, Guild } from '@/api/client';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Tickets } from '@/pages/Tickets';
import { Transcripts } from '@/pages/Transcripts';
import { TranscriptView } from '@/pages/Transcript';
import { Stats } from '@/pages/Stats';
import { Config } from '@/pages/Config';
import { Status } from '@/pages/Status';

export default function App() {
  const [me, setMe]         = useState<Me | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guild, setGuild]   = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [meData, guildsData] = await Promise.all([api.me(), api.guilds()]);
        setMe(meData);
        setGuilds(guildsData);
        if (guildsData.length > 0) {
          const saved = localStorage.getItem('ticket_guild');
          const found = saved ? guildsData.find(g => g.id === saved) : null;
          setGuild(found ?? guildsData[0]);
        }
      } catch {
        // Not authenticated — will show login
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function onGuildChange(g: Guild) {
    setGuild(g);
    localStorage.setItem('ticket_guild', g.id);
  }

  if (loading) return <Splash />;

  if (!me || !guild) {
    return (
      <BrowserRouter basename="/support">
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter basename="/support">
      <Routes>
        <Route path="/" element={<Layout me={me} guild={guild} guilds={guilds} onGuildChange={onGuildChange} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />} />
          <Route path="tickets"     element={<Tickets />} />
          <Route path="transcripts" element={<Transcripts />} />
          <Route path="transcript/:id" element={<TranscriptView />} />
          <Route path="stats"       element={<Stats />} />
          <Route path="config"      element={<Config />} />
          <Route path="status"      element={<Status />} />
          <Route path="*"           element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(124,58,237,0.5)', borderTopColor: '#7c3aed' }} />
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement...</p>
      </div>
    </div>
  );
}
