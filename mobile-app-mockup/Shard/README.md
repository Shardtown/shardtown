# Shard — App iOS

App iOS compagnon du bot Discord **Shard**. Quatre onglets : **Comment utiliser**, **Dépannage**, **À propos** et **Mon compte** (connexion OAuth Discord / Google / GitHub via le bridge mobile de shardtwn.fr).

```
Shard/
├── project.yml                       ← spec XcodeGen (génère le .xcodeproj)
├── Shard/
│   ├── ShardApp.swift                ← @main + injection AuthSession
│   ├── Auth/
│   │   ├── AuthSession.swift         ← ObservableObject (token + account)
│   │   ├── OAuthClient.swift         ← ASWebAuthenticationSession + scheme shardapp
│   │   ├── PKCE.swift                ← code_verifier / code_challenge (RFC 7636)
│   │   └── KeychainStore.swift       ← stockage Bearer token (afterFirstUnlock)
│   ├── Networking/
│   │   └── APIClient.swift           ← HTTP + Bearer auth
│   ├── Models/
│   │   └── Account.swift             ← miroir du JSON publicAccount
│   ├── Views/
│   │   ├── RootView.swift            ← TabView (4 onglets)
│   │   ├── HowToUseView.swift        ← Comment utiliser
│   │   ├── TroubleshootingView.swift ← Dépannage
│   │   ├── AboutView.swift           ← À propos
│   │   ├── LoginView.swift           ← 3 boutons OAuth
│   │   └── AccountView.swift         ← profil + comptes liés + déconnexion
│   └── Resources/
│       ├── Info.plist                ← scheme `shardapp://` enregistré
│       └── Shard.entitlements
└── README.md
```

## Flow d'authentification

```
iOS                   shardtwn.fr                  Provider (GitHub/…)
 │                         │                              │
 ├─ open ASWebAuthSession ─►                              │
 │  /api/mobile/auth/start │ (stash PKCE challenge)       │
 │  ?code_challenge=…      ├─► redirect to authorize ────►│
 │                         │                              │
 │                         │◄── code + state ─────────────┤
 │                         │                              │
 │                         │ exchange + find/create acct  │
 │                         │ issue auth_code              │
 │  ◄── shardapp://auth/callback?code=… ──┤               │
 │                         │                              │
 ├─ POST /api/mobile/auth/exchange ──────►│               │
 │  { code, code_verifier }│ verify SHA256(verifier)     │
 │                         │ mint Bearer token            │
 │  ◄── { token, account } ┤                              │
 │  store in Keychain      │                              │
```

PKCE garantit qu'un code intercepté est inutilisable sans le `code_verifier`, qui ne quitte jamais l'app avant l'échange final.

## Build local

Pré-requis :
- macOS récent
- **Xcode 15+** (App Store)
- **XcodeGen** : `brew install xcodegen`

```bash
cd mobile-app-mockup/Shard
xcodegen generate
open Shard.xcodeproj
```

Dans Xcode :
1. Target **Shard** → **Signing & Capabilities** → coche **Automatically manage signing** et choisis ton **Team**.
2. Change le **Bundle Identifier** si `fr.shardtown.shard` est pris (par ex. `com.tonpseudo.shard`).
3. Branche ton iPhone → **▶ Run**.

## Configuration côté provider OAuth

Bonne nouvelle : le flow mobile **réutilise le callback web existant**, `https://shardtwn.fr/api/account/oauth/{discord|google|github}/callback`. Le serveur détecte en interne (via le state token) s'il doit faire le flow web (cookie session → `/account`) ou le flow mobile (deep link → `shardapp://`).

- **Google** et **GitHub** : ✅ aucune config OAuth à changer, l'URL est déjà enregistrée pour le web.
- **Discord** : ajouter `https://shardtwn.fr/api/account/oauth/discord/callback` aux Redirects de l'OAuth App ([Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects). L'URL existante `/auth/discord/callback` reste pour le flow passport web.

Variables d'environnement requises côté serveur (déjà utilisées pour le web) :
```
APP_URL=https://shardtwn.fr
CLIENT_ID=…                 # Discord
CLIENT_SECRET=…             # Discord
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
```

## Sécurité

- **Token au Keychain** (`kSecAttrAccessibleAfterFirstUnlock`) — jamais en `UserDefaults`.
- **PKCE S256** sur chaque flow OAuth.
- **`prefersEphemeralWebBrowserSession`** : pas de cookies Safari persistants après auth.
- **Scheme exclusif** `shardapp://` enregistré dans `CFBundleURLTypes` — iOS garantit que seule l'app la capture pendant la session.
- **Bearer token** réutilise `account_personal_tokens` côté serveur (mêmes garanties que les tokens desktop).
