# Shardtown — Desktop (Tauri)

App macOS native pour le dashboard Shardtown. Tauri 2 + React + Vite. Auth par token personnel stocké dans le trousseau macOS, communication exclusive avec `https://shardtwn.fr/api/...`.

Successeur du shell Electron de `desktop/` (à supprimer une fois cette version validée).

## Pré-requis

```bash
# Rust (si pas déjà installé)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Outils Xcode (la première fois)
xcode-select --install
```

## Build

```bash
cd desktop-tauri
npm install
npm run tauri:build
```

→ DMG produit dans `src-tauri/target/release/bundle/dmg/Shardtown_<version>_<arch>.dmg`.
Première compile Rust : 3-8 min. Ensuite c'est instantané.

Le DMG est non-signé. Au premier lancement : clic-droit → *Ouvrir* (ou `xattr -dr com.apple.quarantine "/Applications/Shardtown.app"`).

## Dev

```bash
npm run tauri:dev
```

Pour pointer vers un serveur local :
```bash
VITE_API_BASE=http://localhost:3000 npm run tauri:dev
```

## Architecture

```
desktop-tauri/
├── public/logo.png          # logo in-app (boot, login, sidebar)
├── src/                     # React app
│   ├── App.tsx              # state machine boot → login → dashboard
│   ├── api.ts               # Bearer fetch (via tauri-plugin-http)
│   ├── token-store.ts       # invoke() wrappers vers les commandes Rust
│   ├── routes/
│   │   ├── Login.tsx        # paste token, valide via /api/account/me
│   │   └── Dashboard.tsx    # sidebar nav + main panel + statusbar
│   └── styles.css
└── src-tauri/               # Rust + Tauri
    ├── src/lib.rs           # commandes token_get / token_set / token_clear (keyring)
    ├── Cargo.toml           # tauri 2, plugin-http, plugin-shell, keyring
    ├── tauri.conf.json      # window config, CSP, bundle DMG
    ├── icons/icon.icns      # icon généré via iconutil
    └── capabilities/        # permissions http (shardtwn.fr only) + shell open
```

## Auth

Le token vit dans le trousseau macOS, service `fr.shardtwn.dashboard`, account `default`. Visible dans Keychain Access pour audit. Jamais persisté en clair sur disque.

À la première ouverture : écran "colle un token". Le bouton *Générer un token* ouvre `shardtwn.fr/account` dans Safari (depuis cette page tu crées un PAT, puis tu le colles dans l'app).

À chaque boot : on relit le trousseau, on hit `/api/account/me`. Si 401 → retour à l'écran login avec message "Token expiré ou révoqué".

## Onglets dashboard

- **Tableau de bord** : hero status (n° de bots liés), 3 quick-actions (ShardGuard, Shard, Wiki), grid de cartes compte (email, Discord ShardGuard, Discord Shard, créé le).
- **ShardGuard** : liste live des serveurs où le user est admin, badge "Bot configuré" / "À inviter" selon présence du bot dans la guilde, bouton "Synchroniser" (rafraîchit le cache des guildes Discord côté serveur).
- **Shard** : pareil pour le bot Shard.

## Raccourcis clavier

- ⌘1 / ⌘2 / ⌘3 — switch d'onglet (Tableau de bord / ShardGuard / Shard)
- ⌘R — recharge les données de l'onglet actif

## Endpoints API utilisés

Tous derrière `Authorization: Bearer st_…`. Liste consommée par l'app :

- `GET /api/account/me` — profil de base + comptes Discord liés
- `GET /api/account/guilds?bot=shardguard|shard` — guildes admin du user, annotées avec `bot_present` selon que le bot est déjà dans la guilde
- `POST /api/account/discord/refresh-guilds` / `POST /api/account/shard/refresh-guilds` — re-fetch la liste depuis Discord et update le cache DB

Ces endpoints sont protégés par le middleware bearer ajouté à `server.js` (skip CSRF si bearer-auth, voir [Personal access tokens](../../obsidian/Securite/Personal%20access%20tokens.md) côté Obsidian).

## Distribution

DMG privé : tu envoies le bundle, le destinataire fait clic-droit → Ouvrir une fois.

Pour signer/notariser (distribution publique sans warning Gatekeeper) :
- Apple Developer ID ($99/an)
- `tauri.conf.json > bundle.macOS.signingIdentity` = nom du certificat
- `bundle.macOS.entitlements` + workflow notarytool
