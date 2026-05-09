# Shardtown — Desktop (Tauri)

App macOS native pour le dashboard Shardtown. Tauri 2 + React + Vite. Auth par token personnel stocké dans le trousseau macOS, communication exclusive avec `https://shardtwn.fr/api/...`.

Successeur du shell Electron de `desktop/` (à déprécier une fois cette version validée).

## Pré-requis

```bash
# Rust (si pas déjà installé)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Outils Xcode
xcode-select --install
```

## Build

```bash
cd desktop-tauri
npm install              # ~30s — JS deps
npm run tauri:build      # 3–8 min la première fois (compile Rust + crates)
                         # → src-tauri/target/release/bundle/dmg/Shardtown_0.1.0_*.dmg
```

Le DMG est non-signé. Au premier lancement : clic-droit → *Ouvrir* (ou `xattr -dr com.apple.quarantine`).

## Dev

```bash
npm run tauri:dev        # hot-reload sur le frontend, recompile Rust à la demande
```

Pour pointer vers un serveur local :
```bash
VITE_API_BASE=http://localhost:3000 npm run tauri:dev
```

## Architecture

```
desktop-tauri/
├── src/                     # React app
│   ├── App.tsx              # state machine boot → login → dashboard
│   ├── api.ts               # Bearer fetch vers shardtwn.fr (via tauri-plugin-http)
│   ├── token-store.ts       # invoke() vers les commandes Rust Keychain
│   ├── routes/
│   │   ├── Login.tsx        # paste token, valide via /api/account/me, persiste
│   │   └── Dashboard.tsx    # accueil + cartes compte + boutons
│   └── styles.css
└── src-tauri/               # Rust + Tauri
    ├── src/lib.rs           # commandes token_get / token_set / token_clear
    ├── Cargo.toml           # tauri 2, plugin-http, plugin-shell, keyring
    ├── tauri.conf.json      # window config + bundle DMG
    └── capabilities/        # permissions http (shardtwn.fr only) + shell open
```

## Auth

Le token vit dans le trousseau macOS sous le service `fr.shardtwn.dashboard`, account `default`. Visible dans Keychain Access pour audit. Jamais persisté en clair sur disque.

À la première ouverture : écran "colle un token". Le bouton "Générer un token" ouvre `shardtwn.fr/account` dans Safari (depuis cette page tu crées un PAT, puis tu le colles dans l'app).

À chaque boot : on relit le trousseau, on hit `/api/account/me`. Si 401 → retour à l'écran login avec message "Token expiré ou révoqué".

## Distribution

DMG privé : tu envoies le bundle, le destinataire fait clic-droit → Ouvrir une fois.

Pour signer/notariser (distribution publique sans warning Gatekeeper) :
- Apple Developer ID ($99/an)
- `tauri.conf.json > bundle.macOS.signingIdentity` = nom du certificat
- `bundle.macOS.entitlements` + workflow notarytool
