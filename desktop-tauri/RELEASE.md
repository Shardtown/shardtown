# Publier une mise à jour Shardtown Desktop

L'app est **signée Developer ID Apple**, **notarisée**, et embarque le
**plugin Tauri Updater** pour les mises à jour automatiques. À chaque
lancement elle vérifie un manifeste public (`latest.json`) hébergé sur
`shardtwn.fr/updates/`. Si la version distante est plus récente que la
version locale, un bouton apparaît dans la topbar.

Build = **universal** (Apple Silicon arm64 + Intel x86_64) : un seul DMG
fonctionne sur tous les Mac depuis macOS 11.

Le flux complet :

```
nouvelle version → tag git → CI (build universal + sign + notarize) → rsync sur shardtwn.fr → users la voient
```

---

## Setup initial (à faire UNE seule fois)

Deux couches de signature indépendantes coexistent :

| Couche | Pour quoi ? | Algo | Où vit la clé privée ? |
|---|---|---|---|
| **Tauri Updater** | Authentifier les `.app.tar.gz` consommés par le plugin updater (la clé publique est embarquée dans l'app) | ed25519 (minisign) | GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` |
| **Apple Developer ID** | Faire passer Gatekeeper / notarisation (sinon écran rouge au premier lancement) | RSA 2048 dans un .p12 | GitHub Secret `APPLE_CERTIFICATE` (base64) |

### 1. Clé Tauri Updater (déjà fait, ne pas régénérer)

```bash
cd desktop-tauri
npx tauri signer generate -w ~/.shardtown-updater.key
```

- `~/.shardtown-updater.key` → **clé PRIVÉE** (NE JAMAIS COMMIT)
- `~/.shardtown-updater.key.pub` → **clé PUBLIQUE** (déjà collée dans `tauri.conf.json`)

⚠️ Si tu régénères, les apps déjà installées **ne pourront plus jamais
recevoir d'update** (la pubkey embarquée ne matchera plus). Backup la
clé privée dans 1Password.

### 2. Certificat Apple Developer ID Application

Pré-requis : un compte Apple Developer ($99/an) activé.

#### a. Créer le certificat sur le portail Apple

1. Va sur https://developer.apple.com/account/resources/certificates/list
2. Bouton `+` → choisis **"Developer ID Application"** (PAS "Mac App Distribution")
3. Génère une CSR depuis ton Mac :
   - *Keychain Access* → *Certificate Assistant* → *Request a Certificate From a Certificate Authority*
   - Email = ton Apple ID, "Saved to disk"
4. Upload la CSR sur le portail → télécharge le `.cer`
5. Double-clic sur le `.cer` pour l'importer dans le trousseau

#### b. Exporter en .p12 pour la CI

Dans *Keychain Access* :
- Catégorie "My Certificates"
- Clic droit sur **"Developer ID Application: Ton Nom (TEAM_ID)"** → *Export*
- Format : **Personal Information Exchange (.p12)**
- Mot de passe : choisis-en un fort, garde-le

Convertis en base64 :
```bash
base64 -i developer-id.p12 -o developer-id.p12.b64
cat developer-id.p12.b64 | pbcopy
```

#### c. Récupérer le Team ID et le nom complet de l'identité

```bash
# Liste les identités installées
security find-identity -v -p codesigning
# → renvoie une ligne du type
#   1) ABCDEF... "Developer ID Application: Jean Dupont (XXXXXXXXXX)"
#                                                        ^^^^^^^^^^
#                                                        Team ID (10 chars)
```

Copie **toute la chaîne entre guillemets** — c'est ton `APPLE_SIGNING_IDENTITY`.

### 3. Clé API App Store Connect (pour la notarisation)

On utilise une **clé API** plutôt qu'un mot de passe spécifique à
l'application : c'est plus sûr, révocable, et ne casse pas si tu changes
de mot de passe Apple ID.

1. Va sur https://appstoreconnect.apple.com/access/integrations/api
2. Onglet *Team Keys* (PAS *Individual*)
3. Bouton `+` → nom : `Shardtown CI`, accès : **Developer**
4. Télécharge le fichier `AuthKey_XXXXXXXXXX.p8` (**unique téléchargement**, garde-le précieusement)
5. Note le **Key ID** (10 chars, visible dans la liste) → `APPLE_API_KEY`
6. Note l'**Issuer ID** (UUID en haut de la page) → `APPLE_API_ISSUER`

---

## Secrets GitHub à configurer

Va sur https://github.com/Shardtown/shardtown/settings/secrets/actions
et ajoute :

### Updater Tauri (déjà en place)
| Secret | Valeur |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenu complet de `~/.shardtown-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mot de passe défini à la génération (ou vide) |

### Signature Apple
| Secret | Valeur |
|---|---|
| `APPLE_CERTIFICATE` | Contenu base64 du `.p12` (étape 2.b ci-dessus) |
| `APPLE_CERTIFICATE_PASSWORD` | Le mot de passe du `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Ton Nom (TEAM_ID)` |

### Notarisation Apple
| Secret | Valeur |
|---|---|
| `APPLE_API_ISSUER` | UUID issuer ID (étape 3.6) |
| `APPLE_API_KEY` | Key ID 10 chars (étape 3.5) |
| `APPLE_API_KEY_CONTENT` | Contenu **complet** du fichier `AuthKey_XXX.p8` |

### Déploiement (déjà en place)
| Secret | Valeur |
|---|---|
| `SHARDTWN_SSH_HOST` | hostname VPS |
| `SHARDTWN_SSH_USER` | user SSH |
| `SHARDTWN_SSH_KEY` | clé privée SSH avec write sur `updates/` |
| `SHARDTWN_UPDATES_PATH` | chemin absolu sur le VPS |

### Notifications (optionnel)
| Secret | Valeur |
|---|---|
| `SHARDTOWN_BOT_TOKEN` | Token bot Discord pour notifs build |
| `SHARDTOWN_RELEASE_CHANNEL_ID` | ID du salon Discord |

**Si les secrets Apple sont absents** : le workflow tourne quand même,
Tauri fait du *ad-hoc signing* et skip la notarisation. Le DMG produit
fonctionne en local mais déclenche Gatekeeper chez les users.

---

## Publier une nouvelle version (auto via CI)

```bash
# 1. bump version dans desktop-tauri/src-tauri/tauri.conf.json ET Cargo.toml
# 2. commit + push
git add -A && git commit -m "bump 0.1.30" && git push
# 3. tag + push du tag → CI déclenche tout
git tag v0.1.30 && git push origin v0.1.30
```

GitHub Actions (`.github/workflows/release.yml`) :
1. Tourne sur `macos-14` (Apple Silicon)
2. Importe le cert Apple dans un trousseau temporaire
3. Build **universal-apple-darwin** (Intel + arm64 dans un seul binaire)
4. Codesign avec hardened runtime + entitlements
5. Notarise via API key App Store Connect (~3-5 min de wait Apple)
6. Staple le ticket de notarisation sur le .app et le .dmg
7. Signe l'updater payload avec la clé ed25519
8. Génère `latest.json` pointant vers shardtwn.fr/updates/
9. Rsync tous les artifacts sur le VPS
10. Crée une Release GitHub privée pour archive

Durée totale : **15-20 min** (universal binary + notarisation).

---

## Publier manuellement (fallback / debug local)

Pré-requis : avoir les vars d'env Apple exportées (voir `~/.zshrc`).

```bash
# Exports pour la signature locale (mets-les dans ~/.zshrc)
export APPLE_SIGNING_IDENTITY="Developer ID Application: Ton Nom (XXXXXXXXXX)"
export APPLE_API_ISSUER="UUID-issuer"
export APPLE_API_KEY="KEYID"
export APPLE_API_KEY_PATH="$HOME/.appstoreconnect/AuthKey_KEYID.p8"
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.shardtown-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
```

```bash
cd desktop-tauri
npx tauri build --target universal-apple-darwin
```

Produit dans `src-tauri/target/universal-apple-darwin/release/bundle/` :
- `dmg/Shardtown_<version>_universal.dmg` — pour les nouveaux users (signé + notarisé)
- `macos/Shardtown.app.tar.gz` — payload updater
- `macos/Shardtown.app.tar.gz.sig` — signature ed25519

Vérifie la signature Apple :
```bash
codesign --verify --deep --strict --verbose=2 \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/Shardtown.app
spctl --assess --type execute --verbose \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/Shardtown.app
# → "accepted" + "source=Notarized Developer ID" si tout est OK
```

---

## Comment ça marche côté user

1. Au démarrage, l'app GET `https://shardtwn.fr/updates/latest.json`
2. Compare la `version` du JSON à la sienne (déclarée dans `tauri.conf.json` au build)
3. Si distante > locale → expose un état "update disponible"
4. Le bouton **download** apparaît à gauche de la cloche dans la topbar
5. Clic → fenêtre avec version + notes → bouton **Installer**
6. L'app télécharge le `.app.tar.gz` depuis l'URL du manifeste
7. **Vérifie la signature ed25519** avec la clé publique embarquée — si elle ne matche pas, refuse l'update
8. Remplace le `.app` sur disque et redémarre

Aucune intervention manuelle des users : ils cliquent sur "Installer", point.

---

## Sécurité

### Clé Tauri Updater
- La **clé privée ed25519** ne quitte jamais GitHub Secrets / 1Password.
- Même si le repo GitHub est compromis sans accès aux secrets, personne
  ne peut publier d'update malveillante : sans la clé privée, la
  signature ne matchera pas la pubkey embarquée dans les apps déployées.
- Si tu perds la clé privée, **tu ne peux plus jamais updater les apps
  existantes**. Backup `~/.shardtown-updater.key` dans 1Password.

### Certificat Apple Developer ID
- Le `.p12` exporté est protégé par mot de passe — même son contenu
  base64 sans le password ne sert à rien.
- Si tu suspectes une compromission : va sur le portail Apple Developer
  → révoque le cert, génère un nouveau. Les apps déjà signées avec
  l'ancien cert **continuent de fonctionner** (les tickets de
  notarisation sont permanents), seules les nouvelles releases doivent
  être re-signées.

### Clé API App Store Connect
- Limitée au rôle *Developer* (pas *Admin*) — peut notariser mais pas
  modifier l'équipe ni publier sur l'App Store.
- Révocable à tout moment depuis https://appstoreconnect.apple.com/access/integrations/api

---

## Premier install (à distribuer aux users)

Donne-leur le lien direct :

> https://shardtwn.fr/updates/Shardtown_latest_universal.dmg

(ou le lien de la dernière release GitHub si tu préfères)

Ils téléchargent le `.dmg`, glissent dans Applications, double-clic.
**Plus aucun avertissement Gatekeeper** — l'app s'ouvre comme n'importe
quelle app du Mac App Store. Toutes les updates suivantes se font
automatiquement via le bouton in-app.
