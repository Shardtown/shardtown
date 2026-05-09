# Shardtown — Desktop (macOS)

Coquille Electron qui charge `https://shardtwn.fr/outils` dans une fenêtre native macOS. Le backend reste en prod ; ce dépôt produit juste le `.dmg` qu'on installe.

## Build

```bash
cd desktop
npm install        # ~200 Mo, télécharge Electron + electron-builder
npm run dist:mac   # produit dist/Shardtown-0.1.0.dmg (universal x64+arm64)
```

Le DMG est **non signé** (Apple Developer ID requis pour signer). Au premier lancement :
- soit clic-droit sur l'app → *Ouvrir* puis confirmer ;
- soit `xattr -dr com.apple.quarantine "/Applications/Shardtown.app"` après installation.

## Dev

```bash
npm start          # ouvre la fenêtre en pointant sur la prod
SHARDTOWN_URL=http://localhost:3000/outils npm start   # contre un serveur local
```

## Structure

- `main.js` — process principal Electron, création de la BrowserWindow, gestion des liens externes (OAuth/Stripe ouvrent dans Safari pour ne pas piéger la session).
- `preload.js` — vide volontairement, mais requis pour que `contextIsolation` soit respecté.
- `build/icon.png` — 1024×1024 issu de `image/favicon.png`. electron-builder le convertit en `.icns` à la volée.

## Distribution

DMG privé : tu l'envoies à qui tu veux, le destinataire suit la procédure clic-droit/Ouvrir une fois. Pour passer en distribution publique sans frottement Gatekeeper, ajouter à terme :

- Apple Developer ID ($99/an)
- `mac.identity` = nom du certificat
- `mac.notarize: true` (Xcode + `xcrun notarytool`)
