# SPA Migration — Notes pour les prochaines sessions

## État actuel
Tout est migré sauf les 2 pages de configuration de bots :

- `/shard/guild/:id` — 12 onglets de config Shard (still EJS at `views/shard/config.ejs`, 2257 lignes)
- `/shardguard/guild/:id` — 10 onglets de config ShardGuard (still EJS at `views/shardguard/config.ejs`, 2946 lignes)

Les 2 pages restent fonctionnelles via Express (les routes EJS render existent toujours). La SPA catch-all ne les écrase PAS car le path `/shard/guild/:id` matche encore la route Express explicite avant le catch-all.

## Architecture rappel
- React app : `status-app/` (Vite + React 19 + TS + Tailwind v3 + shadcn). Build → `status-app/dist/`
- Express : `server.js` sert `dist/index.html` pour toute route non-API/OAuth/admin/_legacy
- Auth : sessions Express (passport-discord pour ShardGuard, custom OAuth `req.session.shardUser` pour Shard, scrypt + CSRF pour admin)
- API endpoints existants pour les configs : `POST /shard/guild/:id/config`, `POST /shardguard/guild/:id/config`, plus toutes les sub-routes (`/poll`, `/giveaway`, `/ticket-panel`, `/deploy`, `/panic`, etc.)

Pour porter ces 2 pages :
1. Créer `GET /api/shard/guild/:id` qui renvoie `{ guild, settings, channels, roles, emojis, polls, giveaways, scheduledAnnouncements, shopItems }` (refactorer la route `GET /shard/guild/:guildID` existante)
2. Créer `GET /api/shardguard/guild/:id` (idem, avec stats + chartData en plus)
3. Implémenter les composants React (voir blueprints ci-dessous)
4. Supprimer les `res.render('shard/config', ...)` et `res.render('shardguard/config', ...)` → catch-all SPA prend le relais

---

## Blueprint Shard config (`views/shard/config.ejs` 2257L)

### Onglets (dans l'ordre d'affichage)
**Community** — Arrivée & Départ · Auto Rôle · Anniversaires · Annonces Planifiées
**Engagement** — Niveaux · Économie · Giveaways · Sondages
**Tools** — Vocal Temporaire · Embed Builder · Réactions Auto · Tickets

### Server data attendue
```ts
{
  guild: { id, name, icon? },
  channels: { id, name }[],
  voiceChannels: { id, name }[],
  categories: { id, name }[],
  roles: { id, name, color? }[],
  guildEmojis: { id, name, animated }[],
  settings: {
    // Welcome/Leave
    welcomeChannelId, welcomeTitle, welcomeMessage, welcomeFooter, welcomeColor,
    leaveChannelId, leaveTitle, leaveMessage, leaveFooter, leaveColor,
    isPremium,
    // Auto-role
    autoRoleId,
    // Birthdays
    birthdayChannelId, birthdayMessage, birthdayRoleId,
    // Levels
    levelsEnabled, xpMin, xpMax, xpCooldown, levelUpChannelId, levelUpMessage, levelUpColor,
    levelThresholds: { level: number, xp: number }[],
    levelRewards: { level: number, roleId: string }[],
    xpRoleMultipliers: { roleId: string, multiplier: number }[],
    // Economy
    currencyName, dailyMin, dailyMax, referralReward,
    shopItems: { id, name, price }[],
    // Tickets
    ticketEnabled, ticketCategoryId, ticketSupportRoleId, ticketLogChannelId, ticketMaxPerUser,
    ticketPanelChannelId, ticketPanelTitle, ticketPanelDescription, ticketPanelColor,
    // TempVoice
    tempvoiceTriggerChannelId, tempvoiceCategoryId, tempvoiceNamePattern,
    // Auto-reactions
    autoReactions: { text: string, emoji: string }[],
  },
  polls: { id, question, choices, endsAt }[],
  giveaways: { id, prize, winnersCount, endsAt }[],
  scheduledAnnouncements: { id, channelId, message, interval, nextRun }[],
}
```

### Endpoints client → server (POST sauf indication)
| Path | Body | Purpose |
|---|---|---|
| `/shard/guild/:id/config` | full FormData | Save tous les champs |
| `/shard/guild/:id/test` | `{ type: 'welcome'|'leave', channelId, title, message, footer, color }` | Tester message |
| `/shard/guild/:id/send-embed` | `{ channelId, title, description, footer, color, image }` | Envoyer embed |
| `/shard/guild/:id/reactions` | `{ autoReactions: [{text, emoji}] }` | Sync réactions |
| `/shard/guild/:id/rewards` | `{ levelRewards: [{level, roleId}] }` | Sync récompenses XP |
| `/shard/guild/:id/poll` | `{ channelId, question, choices[], duration, durationUnit, anonymous }` | Créer sondage |
| `/shard/guild/:id/poll/:pollId/end` | — | Clôturer sondage |
| `/shard/guild/:id/giveaway` | `{ channelId, prize, winnersCount, duration, durationUnit, minRoleId, minLevel }` | Créer giveaway |
| `/shard/guild/:id/giveaway/:gwId/end` | — | Terminer giveaway |
| `/shard/guild/:id/scheduled` | `{ channelId, message, interval, firstRun }` | Créer annonce |
| `/shard/guild/:id/scheduled/:id` (DELETE) | — | Supprimer annonce |
| `/shard/guild/:id/shop` | `{ name, price }` | Ajouter item shop |
| `/shard/guild/:id/shop/:id` (DELETE) | — | Retirer item shop |
| `/shard/guild/:id/ticket-panel` | `{ channelId, title, description, color }` | Update panel tickets |
| `/shard/guild/:id/backup` / `/restore` | — | Backup/restore |

### Structure de fichiers proposée
```
src/routes/shard/Guild.tsx              # Layout: tab nav + outlet
src/components/shard/ShardConfigShell.tsx
src/components/shard/tabs/
  WelcomeTab.tsx          [med]
  AutoRoleTab.tsx         [small]
  BirthdaysTab.tsx        [small]
  ScheduledTab.tsx        [med]
  LevelsTab.tsx           [LARGE — 3 dynamic tables]
  EconomyTab.tsx          [med]
  GiveawaysTab.tsx        [med]
  PollsTab.tsx            [med]
  TempVoiceTab.tsx        [small]
  EmbedBuilderTab.tsx     [med]
  ReactionsTab.tsx        [med]
  TicketsTab.tsx          [LARGE — premium gating]
src/components/shard/shared/
  ColorPicker.tsx · ChannelSelect.tsx · RoleSelect.tsx · DynamicList.tsx · SaveBar.tsx · TestButton.tsx
```

---

## Blueprint ShardGuard config (`views/shardguard/config.ejs` 2946L)

### Onglets (dans l'ordre)
1. **Général** — Member count, langue, rôle vérifié, salon vérif, server lock, code accès, premium
2. **Règlement** — Éditeur bilingue FR/EN (rules dynamiques)
3. **Système Captcha** — Digits, noise, attempts, timeout
4. **Sécurité** — Anti-raid, quarantaine
5. **Statut/Logs** — Charts (Chart.js : croissance, vérifications) + table logs avec filtres
6. **Membres** — Table membres avec filtres + modal détail + actions (warn/mute/kick/ban)
7. **Avertissements** — Seuils warn → mute/kick/ban
8. **Rôles Modérateurs** — Grille checkbox des rôles
9. **Mots Interdits** — Liste de mots + bulk import
10. **Automod** — Anti-spam, anti-links, anti-caps, anti-raid, slowmode, panic mode, webhook alert, backup/restore

### Server data attendue
```ts
{
  guild: { id, name },
  settings: { /* ~60 champs config */ },
  roles: { id, name, color }[],
  channels: { id, name }[],
  stats: { totalMembers: number },
  chartData: Record<string, { join, leave, success, failed }>,
}
```

### Endpoints existants
| Path | Method | Purpose |
|---|---|---|
| `/shardguard/guild/:id/config` | POST | Save config |
| `/shardguard/api/guild/:id/members` | GET | Liste membres + warnCount |
| `/shardguard/api/guild/:id/member/:uid/warns` | GET | Warns du membre |
| `/shardguard/api/guild/:id/member/:uid/sanctions` | GET | Sanctions du membre |
| `/shardguard/api/guild/:id/member/:uid/action` | POST | `{ action, reason, duration, username }` |
| `/shardguard/api/guild/:id/logs?event=&status=&search=` | GET | Logs filtrés |
| `/shardguard/api/guild/:id/audit` | GET | Audit étendu |
| `/shardguard/api/guild/:id/panic` | POST | Toggle panic mode |
| `/shardguard/api/guild/:id/deploy?type=verification` | POST | Envoie message captcha |
| `/shardguard/api/guild/:id/bulk/:action` | POST | Bulk verify/kick |
| `/guild/:id/backup` / `/restore` | POST | Backup config |

### Structure proposée
```
src/routes/shardguard/Guild.tsx           # Layout
src/components/shardguard/tabs/
  GeneralTab · RulesTab · VerificationTab · SecurityTab · WarnsTab · ModRolesTab · BannedWordsTab    [small]
  StatsTab (Chart.js) · LogsTab            [med]
  MembersTab (modal + sanctions) · AutomodTab (8 sub-sections + panic + webhook + backup)  [LARGE]
src/components/shardguard/modals/
  AlertModal · ConfirmModal · ActionPromptModal · MemberModal
```

### Charts
Chart.js déjà utilisé. Pour React, soit garder Chart.js via `react-chartjs-2`, soit migrer vers Recharts. Données :
- Growth chart (line) : 14 jours d'arrivées/départs
- Verification chart (stacked bar) : succès/échecs

---

## Estimation
- Shard config : ~1800-2200 lignes React, 2-3 sessions focalisées (par groupe d'onglets : Community / Engagement / Tools)
- ShardGuard config : ~1500-2000 lignes React, 2 sessions focalisées (config statique + charts/membres)
- Total restant : 4-5 sessions de travail intensif

## Préview server local
- `node .claude/preview-server.js` (port 4173) — sert le SPA + mocks
- Cookies pour mocks : `preview-user=1` (utilisateur connecté), `preview-admin=1` (admin connecté)
- Routes mockées : `/api/me`, `/api/premium`, `/api/shard/server`, `/api/shardguard/server`, `/api/admin`, `/api/admin/csrf`, `/api/stats`
