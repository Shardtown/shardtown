interface Props {
  loading: boolean;
  allOnline: boolean;
  offlineShards: number;
  avgPing: number;
  lastUpdateText: string;
}

export function Banner({ loading, allOnline, offlineShards, avgPing, lastUpdateText }: Props) {
  if (loading) {
    return (
      <div className="mb-5 rounded-2xl border border-white/5 bg-[#0a0a0a] px-6 py-5 flex items-center gap-4">
        <div className="w-3 h-3 rounded-full bg-white/10" />
        <div className="flex-1">
          <p className="font-bold text-base">Vérification du statut…</p>
          <p className="text-sm text-white/30 mt-0.5">Connexion à l'API en cours</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-5 rounded-2xl border px-6 py-5 flex items-center gap-4 transition-all duration-500 ${
        allOnline ? "bg-emerald-500/5 border-emerald-500/15" : "bg-red-500/5 border-red-500/15"
      }`}
    >
      <div
        className={`w-3 h-3 rounded-full flex-shrink-0 transition-all duration-500 ${
          allOnline
            ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
            : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse"
        }`}
      />
      <div className="flex-1">
        <p className="font-bold text-base">
          {allOnline ? "Tous les systèmes opérationnels" : "Incident en cours"}
        </p>
        <p className={`text-sm mt-0.5 font-mono-num ${allOnline ? "text-emerald-400/50" : "text-red-400/50"}`}>
          {allOnline
            ? `Aucun incident détecté · Latence moyenne ${avgPing}ms`
            : `${offlineShards} shard${offlineShards > 1 ? "s" : ""} hors ligne · Nos équipes sont informées`}
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="flex items-center justify-end gap-1.5 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Dernière mise à jour</span>
        </div>
        <p className="text-xs font-bold text-white/40 font-mono-num">{lastUpdateText}</p>
      </div>
    </div>
  );
}
