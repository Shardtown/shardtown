import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, AtSign, LogOut, ShieldCheck, ShieldAlert, Calendar } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiGet, apiPost } from "@/api/client";
import type { Account as AccountT } from "@/api/account";

export function Account() {
  const nav = useNavigate();
  const [account, setAccount] = useState<AccountT | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ account: AccountT | null }>("/api/account/me");
      if (!r.account) {
        nav("/account/login", { replace: true });
        return;
      }
      setAccount(r.account);
    } finally { setLoading(false); }
  }, [nav]);

  useEffect(() => { refresh(); }, [refresh]);

  async function logout() {
    await apiPost("/api/account/logout").catch(() => {});
    nav("/account/login", { replace: true });
  }

  if (loading || !account) {
    return (
      <AppLayout>
        <section className="container-wide pt-32 md:pt-40">
          <div className="h-12 w-64 bg-white/5 rounded animate-pulse" />
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="container-wide pt-20 md:pt-28 pb-32">
        <header className="flex items-center gap-4 flex-wrap justify-between mb-10">
          <div>
            <p className="text-[11px] font-bold tracking-[0.32em] text-blue-300/70 uppercase mb-3">
              Mon compte
            </p>
            <h1 className="font-extrabold tracking-[-0.02em] leading-[0.95] text-4xl md:text-6xl">
              {account.pseudo}
            </h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold uppercase tracking-[0.18em]"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </button>
        </header>

        {!account.email_verified && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold mb-1">Email non vérifié</p>
              <p className="text-amber-200/80">
                Clique le lien envoyé à {account.email}. Tu peux aussi le redemander depuis le login.
              </p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Tile icon={Mail} label="Email" value={account.email} verified={account.email_verified} />
          <Tile icon={AtSign} label="Pseudo" value={account.pseudo} />
          <Tile icon={Calendar} label="Inscrit le" value={new Date(account.created_at).toLocaleDateString("fr-FR")} />
          <Tile
            icon={User}
            label="Discord"
            value={account.discord_username ? `${account.discord_username}` : "Non lié"}
            muted={!account.discord_username}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-6">
          <h2 className="font-extrabold tracking-tight text-xl mb-2">Lier Discord</h2>
          <p className="text-white/55 text-sm mb-5">
            Lie ton compte Discord pour accéder aux dashboards de tes serveurs.
            <br /><span className="text-white/35 text-[12px]">(Disponible bientôt)</span>
          </p>
          <button
            type="button"
            disabled
            className="btn-liquid btn-liquid--discord rounded-full px-5 py-3 font-bold text-sm inline-flex items-center gap-2 opacity-50 cursor-not-allowed"
          >
            Lier mon Discord
          </button>
        </div>
      </section>
    </AppLayout>
  );
}

function Tile({
  icon: Icon, label, value, verified, muted,
}: { icon: typeof Mail; label: string; value: string; verified?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-1.5 text-white/40 mb-3">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
        {verified && <ShieldCheck className="w-3 h-3 text-emerald-300 ml-auto" />}
      </div>
      <p className={`text-base font-bold tracking-tight break-all ${muted ? "text-white/40 italic" : "text-white"}`}>{value}</p>
    </div>
  );
}
