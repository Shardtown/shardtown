# ShardLink — App iOS

App iPhone qui prend l'**IP/port d'un serveur Minecraft Bedrock distant** et le diffuse sur ton Wi-Fi pour qu'il apparaisse comme une **partie LAN** sur ta console (Xbox, Switch, PS, iPad de la cousine, etc.).

Inspiré de Bedrock Together / Phantom.

```
ShardLink/
├── project.yml              ← spec XcodeGen (génère le .xcodeproj)
├── ShardLink/
│   ├── ShardLinkApp.swift   ← @main
│   ├── Models/              ← Server + ServerStore (persistance Documents/)
│   ├── Networking/
│   │   ├── RakNet.swift            ← parsing/build des paquets ping/pong
│   │   ├── LANBroadcaster.swift    ← écoute UDP 19132, répond aux pings
│   │   └── UDPRelay.swift          ← relais paquets jeu → serveur distant
│   ├── Views/                      ← SwiftUI (Root, Liste, Add, Détail, Empty)
│   └── Resources/
│       ├── Info.plist              ← NSLocalNetworkUsageDescription + NSBonjourServices
│       └── ShardLink.entitlements
└── README.md (ce fichier)
```

---

## 1. Comment ça marche techniquement

Minecraft Bedrock découvre les parties LAN avec un protocole simple basé sur RakNet :

1. Le client console **broadcast** un *Unconnected Ping* (`0x01`) en UDP sur `255.255.255.255:19132`.
2. N'importe quel serveur Bedrock du même Wi-Fi qui écoute le port 19132 **répond** un *Unconnected Pong* (`0x1C`) en unicast vers la source.
3. Le pong contient un MOTD `MCPE;<nom>;<protocole>;<version>;<online>;<max>;<guid>;...` que le client parse et affiche dans **Jouer → Amis → Parties LAN**.

ShardLink :
- ouvre un `NWListener` UDP sur le port **19132**,
- pour chaque ping reçu, renvoie un pong avec le nom/MOTD configurés,
- pour tout le reste du trafic (Open Connection Request, etc.), il **forwarde** vers le serveur Bedrock distant via un `NWConnection` UDP unique, et renvoie les réponses au client.

> 💡 Pas d'entitlement multicast nécessaire : on **écoute** sur un port unicast, on ne broadcast jamais. iOS demande seulement la permission "Réseau local" (déjà déclarée dans `Info.plist`).

---

## 2. Build local (Xcode)

Pré-requis :
- macOS récent
- **Xcode 15+** installé (App Store)
- **XcodeGen** : `brew install xcodegen`

```bash
cd mobile-app-mockup/ShardLink
xcodegen generate
open ShardLink.xcodeproj
```

Dans Xcode :

1. Sélectionne la target **ShardLink** → onglet **Signing & Capabilities**
2. Coche **Automatically manage signing** et choisis ton **Team** (compte Apple gratuit OK pour test sur ton propre iPhone)
3. Change le **Bundle Identifier** si `fr.shardtown.shardlink` est pris : par exemple `com.tonpseudo.shardlink`
4. Branche ton iPhone en USB (ou Wi-Fi sync activé), choisis-le en target → **▶ Run**

**Premier lancement sur l'iPhone** : iOS affichera une popup *"ShardLink souhaite trouver et se connecter aux appareils sur votre réseau local"* → **Autoriser**. Sans ça, le port 19132 ne reçoit rien.

---

## 3. Tester la diffusion

1. Lance ShardLink sur l'iPhone (en Wi-Fi).
2. **+** → ajoute un serveur, ex :
   - Nom : `Test`
   - Hôte : `play.shardtown.fr` (ou n'importe quelle IP Bedrock publique)
   - Port : `19132`
   - MOTD : `Diffusé par ShardLink`
3. Tape sur le serveur dans la liste → écran "Diffusion active".
4. Sur ta **console / autre device sur le même Wi-Fi**, ouvre Minecraft Bedrock → **Jouer** → **Amis** → tu dois voir `Test · Diffusé par ShardLink` dans la section *Parties LAN*.
5. Sélectionne-le → la console se connecte → ShardLink relaie tout au serveur distant.

Le compteur **Pings** dans l'écran de détail augmente à chaque ping reçu de la console — c'est ton indicateur "ça marche" immédiat.

### Si ça ne marche pas
- iPhone et console doivent être sur **le même SSID** (et le routeur ne doit pas avoir l'**isolation client** activée — c'est le piège classique des Wi-Fi invités).
- Si tu vois 0 ping après 30 s, vérifie l'autorisation Réseau local : **Réglages iOS → ShardLink → Réseau local** doit être ON.
- Pour debug, attache Xcode (Window → Devices) et regarde les logs `os_log` du listener.

---

## 4. Publication

Tu as 3 chemins, du plus simple au plus officiel.

### A. Test perso (gratuit, 7 jours)
Un compte Apple ID suffit. Xcode signe avec un cert "free" qui expire au bout de **7 jours** — il faut re-déployer chaque semaine. Parfait pour itérer, pas pour distribuer.

### B. TestFlight (recommandé pour bêta)
Pré-requis : **Apple Developer Program** — 99 €/an, à activer sur [developer.apple.com](https://developer.apple.com/programs/).

1. Sur [App Store Connect](https://appstoreconnect.apple.com/) → **My Apps** → **+** → **New App**.
   - Bundle ID : exactement celui du projet (`fr.shardtown.shardlink` ou ton custom)
   - Nom : `ShardLink`
2. Dans Xcode → Product → **Archive** (sélectionne *Any iOS Device* en target).
3. Quand l'archive s'ouvre dans l'Organizer → **Distribute App** → **App Store Connect** → **Upload**.
4. Retour sur App Store Connect → onglet **TestFlight** → la build apparaît après ~10 min de traitement.
5. Ajoute des testeurs internes (jusqu'à 100, ton équipe) ou crée un **lien public TestFlight** (jusqu'à 10 000 testeurs externes — passe par un *Beta App Review* léger, 1-2 jours).
6. Partage le lien → tes amis installent l'app TestFlight → ils ont ShardLink.

### C. App Store public
Même chose que B, mais ensuite :

1. Onglet **App Store** sur la fiche de l'app → remplis :
   - Description, mots-clés, captures (6.7" + 6.1" obligatoires)
   - Icône 1024×1024
   - **Privacy** : déclarer que tu n'utilises **aucune donnée perso** (tout est local)
   - **Export Compliance** : "No" sur le chiffrement custom (tu n'en utilises pas)
   - **Catégorie** : Utilitaires
2. **Submit for Review**.
3. ⚠️ **Point sensible Apple** : ce type d'app (proxy LAN Minecraft) a déjà été approuvé plusieurs fois (Bedrock Together, Phantom for Bedrock, etc.) mais certains reviewers tatillonnent sur l'usage du nom *"Minecraft"* dans les screenshots/description. **Évite-le** ou utilise *"jeu Bedrock"* / *"jeux compatibles RakNet"*. Le nom de l'app ne doit pas contenir "Minecraft".
4. Review en 24-48h en général. Si refusé : Apple répond avec la raison précise, tu corriges, tu re-submit.

---

## 5. Limites connues (v1)

- **Pas de mode background** — la diffusion s'arrête si tu lock l'iPhone ou changes d'app. (Pour v2 : `UIBackgroundModes: voip` ou `audio` avec audio silencieux, mais Apple n'aime pas les hacks → mieux vaut prévenir l'utilisateur de garder l'app ouverte.)
- **1 console à la fois** — le relais UDP n'a pas de table de sessions par IP source. Pour 2+ consoles simultanées, il faut indexer `currentDownstream` par `remoteEndpoint`.
- **Pas d'authentification Xbox Live** — si le serveur distant requiert `online-mode=true` (auth Xbox), le client console s'authentifiera lui-même contre le serveur, pas de souci. Tout marche comme une connexion directe.

---

## 6. Pour aller plus loin

- Ajouter un **graphe live** du trafic (KB/s) dans l'écran détail.
- Détecter si le port 19132 est déjà pris (ex : un autre serveur Bedrock sur l'iPhone) et fallback sur 19134.
- Reflet web : exposer la même UI dans le dashboard ShardTown principal pour pilotage à distance via l'API bot.
