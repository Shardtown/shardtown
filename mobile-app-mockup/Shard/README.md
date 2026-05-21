# Shard — App iOS (mockup)

Mockup d'une app iOS compagnon du bot Discord **Shard**. Trois onglets : **Comment utiliser**, **Dépannage**, **À propos**. Tout en SwiftUI natif, aucune dépendance externe.

```
Shard/
├── project.yml                     ← spec XcodeGen (génère le .xcodeproj)
├── Shard/
│   ├── ShardApp.swift              ← @main
│   ├── Views/
│   │   ├── RootView.swift          ← TabView (3 onglets)
│   │   ├── HowToUseView.swift      ← Comment utiliser (étapes + liens)
│   │   ├── TroubleshootingView.swift ← Dépannage (FAQ + support)
│   │   └── AboutView.swift         ← À propos (version, liens, légal)
│   └── Resources/
│       ├── Info.plist
│       └── Shard.entitlements
└── README.md (ce fichier)
```

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

L'app n'utilise pas le réseau local, ne stocke aucune donnée et ne demande aucune permission — c'est une vitrine statique.
