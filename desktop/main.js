const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');

const APP_URL = process.env.SHARDTOWN_URL || 'https://shardtwn.fr/outils';
const APP_ORIGIN = new URL(APP_URL).origin;
const HOME_PATH = new URL(APP_URL).pathname;

// Only these paths render in the desktop window. Anything else on the same
// origin (marketing, wiki, premium, legal, status, assistant) is bounced
// back to the dashboard. Keeps the app focused on what it's for.
const DASHBOARD_PATHS = [
  /^\/outils(\/|$|\?)/,
  /^\/shard(\/|$|\?)/,
  /^\/shardguard(\/|$|\?)/,
  /^\/account(\/|$|\?)/,
  /^\/api\//, // OAuth callbacks
];

// Authentication providers must be reachable in-window so OAuth completes
// inside Electron's session (cookie jar separate from Safari). Everything
// else external opens in the user's default browser.
const OAUTH_HOSTS = new Set([
  'discord.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'github.com',
]);

const isDashboardPath = pathname => DASHBOARD_PATHS.some(re => re.test(pathname));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(APP_URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const u = new URL(url);
    if (u.origin === APP_ORIGIN) {
      if (!isDashboardPath(u.pathname)) {
        event.preventDefault();
        win.loadURL(`${APP_ORIGIN}${HOME_PATH}`);
      }
      return;
    }
    if (OAUTH_HOSTS.has(u.host)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // React Router uses pushState, which doesn't fire will-navigate. Catch it
  // here so client-side navigation to /wiki, /premium, etc. is bounced too.
  win.webContents.on('did-navigate-in-page', (_event, url) => {
    const u = new URL(url);
    if (u.origin === APP_ORIGIN && !isDashboardPath(u.pathname)) {
      win.loadURL(`${APP_ORIGIN}${HOME_PATH}`);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Standard macOS menu — copy/paste/zoom shortcuts work out of the box.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
