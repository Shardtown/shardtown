import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, isApiError } from "@/api/client";
import { useAccount } from "@/api/account";
import { startOAuthLink } from "@/lib/oauthLink";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface BotServerData {
  guilds: Guild[];
  botGuildIds: string[];
  clientId: string;
  user: { id: string; username: string; avatar: string | null } | null;
}

const BOT_LABEL = "Shard";
const BOT_IMAGE = "/image/shard.png";

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// Single Discord bot ("Shard"). Behind the scenes two legacy bot identities
// still answer (community via /api/shard/server, security via
// /api/shardguard/server) — we query both in parallel and merge so the user
// sees one unified list whether they linked Discord OAuth, Shard OAuth, or
// both.
export function ShardServer() {
  const { account, loading: accountLoading } = useAccount();
  const [data, setData] = useState<BotServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [pickerGuildId, setPickerGuildId] = useState<string | null>(null);

  const hasDiscord = !!account?.discord_id;
  const hasShard = !!account?.shard_id;
  const neitherLinked = !!account && !hasDiscord && !hasShard;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [securityRes, communityRes] = await Promise.allSettled([
        apiGet<BotServerData>("/api/shardguard/server"),
        apiGet<BotServerData>("/api/shard/server"),
      ]);

      const security = securityRes.status === "fulfilled" ? securityRes.value : null;
      const community = communityRes.status === "fulfilled" ? communityRes.value : null;
      const both401 =
        [securityRes, communityRes].every(
          r => r.status === "rejected" && isApiError(r.reason) && (r.reason.status === 401 || r.reason.status === 403),
        );

      if (cancelled) return;

      if (both401) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      const guildsMap = new Map<string, Guild>();
      [security, community].forEach(d => {
        d?.guilds.forEach(g => guildsMap.set(g.id, g));
      });
      const botGuildIds = new Set<string>([
        ...(security?.botGuildIds ?? []),
        ...(community?.botGuildIds ?? []),
      ]);

      const user = security?.user ?? community?.user ?? null;
      const clientId = community?.clientId || security?.clientId || "";

      setData({
        guilds: Array.from(guildsMap.values()).sort((a, b) => {
          const aIn = botGuildIds.has(a.id);
          const bIn = botGuildIds.has(b.id);
          if (aIn && !bIn) return -1;
          if (!aIn && bIn) return 1;
          return a.name.localeCompare(b.name, "fr");
        }),
        botGuildIds: Array.from(botGuildIds),
        clientId,
        user,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || accountLoading) {
    return (
      <AppLayout>
        <section className="container-wide pt-12">
          <div className="h-8 w-32 bg-white/5 rounded animate-pulse mb-8" />
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-3xl h-32 animate-pulse" />
            ))}
          </div>
        </section>
      </AppLayout>
    );
  }

  // Signed in to Shardtown but neither Discord identity is linked — guilds
  // come from Discord OAuth, so nothing to show until at least one is linked.
  if (account && neitherLinked) {
    return (
      <AppLayout>
        <section className="container-wide pt-24 max-w-2xl mx-auto text-center">
          <img
            src={BOT_IMAGE}
            alt=""
            className="w-16 h-16 rounded-2xl border border-white/10 mx-auto mb-8 object-cover"
          />
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Une dernière étape</p>
          <h1
            className="font-extrabold leading-tight tracking-tight uppercase mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            Connecte ton Discord
          </h1>
          <p className="text-white/50 text-lg mb-10 leading-relaxed">
            On a besoin d'accéder à la liste de tes serveurs Discord pour t'afficher ceux où tu
            peux configurer {BOT_LABEL}.
          </p>
          <button
            type="button"
            onClick={() => { void startOAuthLink("discord"); }}
            className="btn-liquid btn-liquid--discord rounded-full px-8 py-4 font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Se connecter avec Discord <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-white/30 text-xs mt-6">
            Permissions demandées : <span className="text-white/50">identité publique</span> et <span className="text-white/50">liste des serveurs</span>.
          </p>
        </section>
      </AppLayout>
    );
  }

  if (unauthorized || !data?.user) {
    return (
      <AppLayout>
        <section className="container-wide pt-24 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-8">
            <Lock className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Connexion requise</p>
          <h1
            className="font-extrabold leading-tight tracking-tight uppercase mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {BOT_LABEL}
          </h1>
          <p className="text-white/50 text-lg mb-10 leading-relaxed">
            Connectez-vous à votre compte Shardtown pour gérer vos serveurs.
          </p>
          <Link
            to="/account/login"
            className="btn-liquid btn-liquid--primary rounded-full px-8 py-4 font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Se connecter <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </AppLayout>
    );
  }

  const { guilds, botGuildIds, clientId } = data;
  const botGuildSet = new Set(botGuildIds);
  const guildsWithBot = guilds.filter(g => botGuildSet.has(g.id));
  const guildsWithoutBot = guilds.filter(g => !botGuildSet.has(g.id));

  function inviteBot(guildId: string) {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=${encodeURIComponent("bot applications.commands")}&guild_id=${guildId}`;
    window.location.assign(url);
  }

  return (
    <AppLayout>
      <section className="container-wide pt-32 md:pt-40 pb-32">
        <div className="max-w-3xl mb-20">
          <div className="flex items-center gap-3 mb-6">
            <img src={BOT_IMAGE} alt={BOT_LABEL} className="w-9 h-9 rounded-xl object-cover border border-white/10" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/40">{BOT_LABEL}</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Vos serveurs
          </h1>
          <p className="text-lg text-white/50 leading-relaxed">
            Configurez {BOT_LABEL} sur les serveurs où vous êtes administrateur,
            ou invitez-la sur ceux qu'il manque.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-20">
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-7 hover:border-white/15 transition-colors">
            <div className="text-4xl md:text-5xl font-extrabold font-mono-num mb-2">{guilds.length}</div>
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Communautés</p>
          </div>
          <div className="bg-white/[0.02] border border-blue-500/20 rounded-2xl p-7 hover:border-blue-500/40 transition-colors">
            <div className="text-4xl md:text-5xl font-extrabold font-mono-num mb-2 text-blue-400">{guildsWithBot.length}</div>
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Serveurs actifs</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-7 hover:border-white/15 transition-colors col-span-2 md:col-span-1">
            <div className="text-4xl md:text-5xl font-extrabold mb-2 text-white/30">GRATUIT</div>
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Statut du compte</p>
          </div>
        </div>

        <div className="mb-10">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Configurés</p>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {guildsWithBot.length} serveur{guildsWithBot.length !== 1 ? "s" : ""} actif{guildsWithBot.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {guildsWithBot.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-20">
            {guildsWithBot.map(g => (
              <Link
                key={g.id}
                to={`/shard/guild/${g.id}`}
                className="group bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 flex items-center gap-5 hover:border-white/20 hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all"
              >
                <div className="relative flex-shrink-0">
                  {g.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`}
                      alt=""
                      className="w-14 h-14 rounded-2xl border border-white/10 object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-base text-white/40 group-hover:scale-105 transition-transform duration-500">
                      {initials(g.name)}
                    </div>
                  )}
                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base truncate mb-1.5">{g.name}</h3>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    Configurer
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" strokeWidth={2.5} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl mb-20">
            <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Aucun serveur actif pour le moment</p>
          </div>
        )}

        {guildsWithoutBot.length > 0 && (
          <>
            <div className="mb-10">
              <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">Disponibles</p>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Vos autres communautés
              </h2>
              <p className="text-white/40 mt-3 text-sm">Cliquez sur une carte pour y inviter {BOT_LABEL}.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guildsWithoutBot.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setPickerGuildId(g.id)}
                  className="group bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 flex items-center gap-5 hover:border-white/20 hover:bg-white/[0.04] hover:-translate-y-0.5 hover:opacity-100 opacity-70 transition-all text-left grayscale hover:grayscale-0"
                >
                  <div className="flex-shrink-0">
                    {g.icon ? (
                      <img
                        src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`}
                        alt=""
                        className="w-14 h-14 rounded-2xl border border-white/10 object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-base text-white/40 group-hover:scale-105 transition-transform duration-500">
                        {initials(g.name)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate mb-1.5">{g.name}</h3>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-white/50">
                      Inviter {BOT_LABEL}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" strokeWidth={2.5} />
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {pickerGuildId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={() => setPickerGuildId(null)}
          onKeyDown={e => e.key === "Escape" && setPickerGuildId(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-[#0d0d10]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPickerGuildId(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              ✕
            </button>
            <p className="text-xs font-black tracking-[0.3em] text-white/30 uppercase mb-2">Ajouter</p>
            <h3 className="text-2xl font-bold uppercase mb-8">Inviter {BOT_LABEL}</h3>
            <button
              type="button"
              onClick={() => inviteBot(pickerGuildId)}
              className="flex items-center gap-5 p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/10 transition-all w-full text-left group"
            >
              <img src={BOT_IMAGE} alt={BOT_LABEL} className="w-12 h-12 rounded-xl object-cover border border-white/10" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base mb-1">{BOT_LABEL}</p>
                <p className="text-xs text-white/40">Sécurité, communauté &amp; engagement</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </div>
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
