export function formatMinutes(totalMinutes: number): string {
    const heures = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const heuresPart = heures > 0 ? `${heures} heure${heures > 1 ? 's' : ''}` : '';
    const minutesPart = minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}` : '';
    if (heuresPart && minutesPart) return `${heuresPart} ${minutesPart}`;
    if (heuresPart) return heuresPart;
    if (minutesPart) return minutesPart;
    return '0 minute';
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
        });
    } catch { return ''; }
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return ''; }
}

export function formatDiscordTimestamp(ts: string | number | undefined): string {
    if (!ts) return '';
    try {
        const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
        return d.toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return ''; }
}
