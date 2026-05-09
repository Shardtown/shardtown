# Shardtown — Desktop (Tauri)

Coquille Tauri 2 qui empaquette la SPA `status-app/` en application macOS native, authentifiée par token personnel (Bearer) stocké dans le trousseau macOS.

**Architecture unifiée** : un seul code source frontend (`status-app/`) alimente le site web (cookies + CSRF) et l'app desktop (Bearer + Keychain). Le module `status-app/src/lib/desktop.ts` détecte le runtime via `window.__TAURI_INTERNALS__` et `api/client.ts` route les requêtes en conséquence.

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
cd status-app && npm install   # déps SPA + tauri-apps clients
cd ../desktop-tauri
npm install                    # @tauri-apps/cli
npm run tauri:build            # build SPA puis bundle DMG
```

→ DMG produit dans `src-tauri/target/release/bundle/dmg/Shardtown_<version>_<arch>.dmg`.
Première compile Rust : 3-8 min. Ensuite c'est instantané.

DMG non-signé. Premier lancement : clic-droit → *Ouvrir*.

## Dev

```bash
cd desktop-tauri
npm run tauri:dev
```

Tauri lance Vite (port 5174) sur la SPA puis ouvre une fenêtre native qui pointe dessus avec hot-reload.

Pour un dev contre un serveur local :
- lance `node server.js` sur le port habituel
- `VITE_API_BASE=http://localhost:3000 npm run tauri:dev` (à ajouter dans status-app/vite.config.ts si nécessaire)

## Comment ça marche

1. La SPA détecte Tauri via `IS_DESKTOP` (`window.__TAURI_INTERNALS__`).
2. Le composant `<DesktopGate>` enveloppe l'app : lit le keychain au boot, valide le token via `/api/account/me`, puis monte la SPA. Sans token : écran "Colle ton token".
3. `api/client.ts` :
   - Web → `fetch` avec `credentials: include` et CSRF header.
   - Tauri → `tauri-plugin-http` côté Rust avec `Authorization: Bearer st_…`.
4. Côté serveur, le middleware bearer (dans `server.js`) :
   - reconnaît `Authorization: Bearer st_…` et hydrate `req.session.account`, `req.user`, `req.session.shardUser` depuis les colonnes `accounts.*`. Tous les endpoints existants fonctionnent sans modif.
   - skip CSRF pour les requêtes bearer (pas de cookie ambient → pas de risque CSRF).
5. Routes marketing (`/`, `/wiki`, `/premium`, `/terms`, `/privacy`, `/status`, `/assistant`) : redirigées vers `/outils` en mode Tauri.

## Auth

Token au format `st_<64 hex chars>` généré sur shardtwn.fr/account → section "Tokens d'accès personnel" (limite 20 par compte).

Stocké dans le trousseau macOS, service `fr.shardtwn.dashboard`, account `default`. Visible dans Keychain Access pour audit. Jamais persisté en clair sur disque.

À chaque boot de l'app : on relit le trousseau, on hit `/api/account/me`. Si 401 → retour à l'écran login avec le motif affiché.

## Endpoints utilisés

Tous derrière `Authorization: Bearer st_…` :

- `GET /api/account/me` — profil (validation au boot)
- `GET /api/me` — Discord user (hydraté par le middleware bearer)
- `GET /api/account/guilds?bot=…` — guildes admin annotées avec `bot_present`
- `POST /api/account/{discord|shard}/refresh-guilds` — re-sync depuis Discord
- `GET /api/shardguard/server`, `/api/shard/server` — dashboard data
- `GET/POST /api/shardguard/guild/:id`, `/api/shard/guild/:id` — config bot
- `/shardguard/api/guild/:id/logs`, `/shardguard/api/guild/:id/members` — logs et membres
- Auth bypass CSRF pour bearer.

## macOS native niceties

- Menu bar localisé en français (Shardtown / Édition / Présentation / Fenêtre)
- About dialog avec version (depuis Cargo.toml), copyright, lien vers shardtwn.fr
- Window state persisté entre lancements (`tauri-plugin-window-state`)
- Raccourcis natifs : ⌘C / ⌘V / ⌘X · ⌘W / ⌘M / ⌘Q · plein écran

## Distribution

DMG privé. Pour signer/notariser publiquement :
- Apple Developer ID ($99/an)
- `tauri.conf.json > bundle.macOS.signingIdentity` = nom du certificat
- `bundle.macOS.entitlements` + workflow notarytool
