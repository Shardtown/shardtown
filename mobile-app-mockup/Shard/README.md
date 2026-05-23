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

Le serveur expose un **seul callback** par provider : `https://shardtwn.fr/api/mobile/auth/callback/{discord|google|github}`. Cette URL doit être ajoutée comme **callback / redirect URI autorisé** chez chaque provider :

- **Discord** ([Developer Portal](https://discord.com/developers/applications)) → OAuth2 → Redirects → ajouter l'URL.
- **Google** ([Cloud Console](https://console.cloud.google.com/apis/credentials)) → OAuth 2.0 Client → Authorized redirect URIs → ajouter l'URL.
- **GitHub** ([Developer Settings](https://github.com/settings/developers)) → OAuth Apps n'autorisent qu'**une seule** callback URL — crée une **2e OAuth App dédiée mobile** ou bascule l'unique existante (au prix de casser le flow web).

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
