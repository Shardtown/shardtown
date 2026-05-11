# Publier une mise à jour Shardtown Desktop

L'app embarque le **plugin Tauri Updater**. À chaque lancement elle vérifie
un manifeste public (`latest.json`) hébergé sur les GitHub Releases. Si la
version distante est plus récente que la version locale, un bouton de
téléchargement apparaît dans la topbar à gauche de la cloche.

Le flux complet :

```
nouvelle version → tauri build → upload sur GitHub Releases → users la voient
```

---

## Setup initial (à faire UNE seule fois)

### 1. Générer la paire de clés de signature

Les updates sont **signées avec ed25519**. La clé privée reste sur ta
machine, la publique est embarquée dans l'app.

```bash
cd desktop-tauri
npx tauri signer generate -w ~/.shardtown-updater.key
```

L'outil te demande un mot de passe (laisse vide pour un test rapide,
sinon mets-en un et conserve-le dans 1Password). Il sort :

- `~/.shardtown-updater.key` → **clé PRIVÉE** (NE JAMAIS COMMIT, NE JAMAIS PARTAGER)
- `~/.shardtown-updater.key.pub` → **clé PUBLIQUE** (à coller dans `tauri.conf.json`)

### 2. Coller la clé publique dans la config

Ouvre `src-tauri/tauri.conf.json` et remplace
`"REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE"` par le contenu de
`~/.shardtown-updater.key.pub`.

Commit ce changement — la clé publique est destinée à être publique.

### 3. Exporter le mot de passe de la clé en variable d'env

À chaque build, Tauri va signer le `.app.tar.gz` automatiquement, donc il
faut qu'il puisse déchiffrer la clé privée :

```bash
# Ajoute dans ~/.zshrc :
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.shardtown-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="ton-mot-de-passe-ou-vide"
```

Reload : `source ~/.zshrc`.

---

## Publier une nouvelle version

### 1. Bump la version

Dans **deux** fichiers (ils doivent matcher) :

- `desktop-tauri/src-tauri/tauri.conf.json` → `"version": "0.1.2"`
- `desktop-tauri/src-tauri/Cargo.toml` → `version = "0.1.2"`

### 2. Build

```bash
cd desktop-tauri
npm run tauri:build
```

Ça produit dans `src-tauri/target/release/bundle/` :

- `dmg/Shardtown_0.1.2_aarch64.dmg` — pour les nouveaux users
- `macos/Shardtown.app.tar.gz` — l'update payload
- `macos/Shardtown.app.tar.gz.sig` — la signature ed25519

### 3. Créer la release GitHub

```bash
cd desktop-tauri
VERSION=0.1.2
gh release create v$VERSION \
  --title "Shardtown $VERSION" \
  --notes "Bug fixes + nouveaux trucs" \
  src-tauri/target/release/bundle/dmg/Shardtown_${VERSION}_aarch64.dmg \
  src-tauri/target/release/bundle/macos/Shardtown.app.tar.gz \
  src-tauri/target/release/bundle/macos/Shardtown.app.tar.gz.sig
```

### 4. Générer + uploader le manifeste `latest.json`

```bash
VERSION=0.1.2
BASE="https://github.com/Shardtown/shardtown/releases/download/v$VERSION"

node scripts/make-manifest.mjs \
  --version $VERSION \
  --notes "Bug fixes + nouveaux trucs" \
  --sig-path src-tauri/target/release/bundle/macos/Shardtown.app.tar.gz.sig \
  --download-url-darwin-aarch64 $BASE/Shardtown.app.tar.gz \
  --out latest.json

gh release upload v$VERSION latest.json
```

C'est tout. Les apps déjà installées chez les users verront la nouvelle
version à leur prochain lancement (ou dans les 30 min, on poll en continu).

---

## Comment ça marche côté user

1. Au démarrage, l'app GET `https://github.com/Shardtown/shardtown/releases/latest/download/latest.json`
2. Compare la `version` du JSON à la sienne (déclarée dans `tauri.conf.json` au build)
3. Si distante > locale → expose un état "update disponible"
4. Le bouton **download** apparaît à gauche de la cloche dans la topbar
5. Clic → fenêtre avec version + notes → bouton **Installer**
6. L'app télécharge le `.app.tar.gz` depuis l'URL du manifeste
7. **Vérifie la signature** avec la clé publique embarquée — si elle ne matche pas, refuse l'update
8. Remplace le `.app` sur disque et redémarre

Aucune intervention manuelle des users : ils cliquent sur "Installer", point.

---

## Sécurité

- La **clé privée** ne quitte jamais ta machine. Même si ton repo GitHub est
  compromis, personne ne peut publier d'update malveillante : sans la clé
  privée, la signature ne matchera jamais la clé publique embarquée dans
  les apps déployées.
- Si tu perds la clé privée, **tu ne peux plus jamais updater les apps existantes**.
  Backup `~/.shardtown-updater.key` quelque part de sûr (1Password, vault, etc.).
- Le `latest.json` n'a pas besoin d'être en HTTPS strict — la confiance est
  ancrée dans la signature, pas dans le transport. Mais GitHub Releases est
  en HTTPS de toute façon.

---

## Premier install (à distribuer aux users)

Donne-leur simplement le lien direct vers la dernière release :

> https://github.com/Shardtown/shardtown/releases/latest

Ils téléchargent le `.dmg`, glissent dans Applications, lancent. Toutes les
updates suivantes se font automatiquement via le bouton in-app.

⚠️ Le `.dmg` n'est **pas notarisé Apple** tant que tu n'as pas un compte
Apple Developer ($99/an). Au premier lancement les users devront :
*clic-droit → Ouvrir → Ouvrir quand même* pour contourner Gatekeeper.
Pour un .dmg notarisé : voir `tauri.conf.json` → `bundle.macOS.signingIdentity`.
