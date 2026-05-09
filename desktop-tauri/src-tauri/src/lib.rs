use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use keyring::Entry;
use serde::Deserialize;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// Service identifier appears in Keychain Access as the "Where" column.
// Account is constant — there's exactly one logged-in user per app instance.
const KEYCHAIN_SERVICE: &str = "fr.shardtwn.dashboard";
const KEYCHAIN_ACCOUNT: &str = "default";

fn entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_get() -> Result<Option<String>, String> {
    let entry = entry()?;
    match entry.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn token_set(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_clear() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// ─── Discord Rich Presence ───────────────────────────────────────────────
/// Opens an IPC connection to the local Discord client (Unix socket on
/// macOS) and pushes activity payloads. Discord must be running; if not,
/// `connect()` errors out and we surface the message back to the UI.

struct RpcState(Mutex<RpcInner>);
struct RpcInner {
    client: Option<DiscordIpcClient>,
    /// Application ID currently connected with — if it changes we reconnect.
    app_id: Option<String>,
}

#[derive(Deserialize)]
struct RpcActivityPayload {
    details: Option<String>,
    state: Option<String>,
    large_image: Option<String>,
    large_text: Option<String>,
    small_image: Option<String>,
    small_text: Option<String>,
    button_label: Option<String>,
    button_url: Option<String>,
    show_elapsed: Option<bool>,
}

fn empty_to_none(s: Option<&str>) -> Option<&str> {
    s.filter(|v| !v.trim().is_empty())
}

#[tauri::command]
fn rpc_set(state: tauri::State<'_, RpcState>, app_id: String, activity: RpcActivityPayload) -> Result<(), String> {
    if app_id.trim().is_empty() {
        return Err("Application ID Discord requis".into());
    }
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    // Reconnect if the app ID changed (or we never connected).
    let needs_connect = inner.client.is_none() || inner.app_id.as_deref() != Some(&app_id);
    if needs_connect {
        if let Some(mut prev) = inner.client.take() {
            let _ = prev.close();
        }
        let mut client = DiscordIpcClient::new(&app_id).map_err(|e| format!("Init RPC: {e}"))?;
        client.connect().map_err(|e| format!("Connexion à Discord impossible (Discord doit être ouvert) : {e}"))?;
        inner.client = Some(client);
        inner.app_id = Some(app_id);
    }

    let client = inner.client.as_mut().expect("connected above");
    let mut payload = activity::Activity::new();

    if let Some(s) = empty_to_none(activity.details.as_deref()) {
        payload = payload.details(s);
    }
    if let Some(s) = empty_to_none(activity.state.as_deref()) {
        payload = payload.state(s);
    }

    let mut assets = activity::Assets::new();
    let mut has_assets = false;
    if let Some(s) = empty_to_none(activity.large_image.as_deref()) {
        assets = assets.large_image(s); has_assets = true;
    }
    if let Some(s) = empty_to_none(activity.large_text.as_deref()) {
        assets = assets.large_text(s); has_assets = true;
    }
    if let Some(s) = empty_to_none(activity.small_image.as_deref()) {
        assets = assets.small_image(s); has_assets = true;
    }
    if let Some(s) = empty_to_none(activity.small_text.as_deref()) {
        assets = assets.small_text(s); has_assets = true;
    }
    if has_assets {
        payload = payload.assets(assets);
    }

    if activity.show_elapsed.unwrap_or(false) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
        payload = payload.timestamps(activity::Timestamps::new().start(now));
    }

    if let (Some(label), Some(url)) = (
        empty_to_none(activity.button_label.as_deref()),
        empty_to_none(activity.button_url.as_deref()),
    ) {
        payload = payload.buttons(vec![activity::Button::new(label, url)]);
    }

    client.set_activity(payload).map_err(|e| format!("Envoi RPC: {e}"))?;
    Ok(())
}

#[tauri::command]
fn rpc_clear(state: tauri::State<'_, RpcState>) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(client) = inner.client.as_mut() {
        client.clear_activity().map_err(|e| format!("Clear RPC: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn rpc_disconnect(state: tauri::State<'_, RpcState>) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut client) = inner.client.take() {
        let _ = client.close();
    }
    inner.app_id = None;
    Ok(())
}

#[tauri::command]
fn rpc_status(state: tauri::State<'_, RpcState>) -> Result<bool, String> {
    let inner = state.0.lock().map_err(|e| e.to_string())?;
    Ok(inner.client.is_some())
}

/// Build the standard macOS menu bar: app submenu (Shardtown) → Edition →
/// Window → Help. Without this, Cmd+Q, Cmd+W, Cmd+C/V/X don't fire and the
/// app doesn't feel native.
#[cfg(target_os = "macos")]
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Shardtown"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some("© Shardtown"))
        .website(Some("https://shardtwn.fr"))
        .website_label(Some("shardtwn.fr"))
        .build();

    let app_submenu = SubmenuBuilder::new(app, "Shardtown")
        .item(&PredefinedMenuItem::about(app, Some("À propos de Shardtown"), Some(about_metadata))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Services"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Masquer Shardtown"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Masquer les autres"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Tout afficher"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quitter Shardtown"))?)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Édition")
        .item(&PredefinedMenuItem::undo(app, Some("Annuler"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Rétablir"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Couper"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copier"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Coller"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Tout sélectionner"))?)
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, "Présentation")
        .item(&PredefinedMenuItem::fullscreen(app, Some("Plein écran"))?)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Fenêtre")
        .item(&PredefinedMenuItem::minimize(app, Some("Réduire"))?)
        .item(&PredefinedMenuItem::close_window(app, Some("Fermer la fenêtre"))?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_submenu, &edit_submenu, &view_submenu, &window_submenu])
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

/// macOS-style status-bar tray icon: click reveals/focuses the main window,
/// right-click opens a small menu with quick actions. Mirrors NordVPN /
/// Slack behavior. Reuses the bundle's default window icon so we don't have
/// to decode PNG bytes ourselves at runtime.
#[cfg(target_os = "macos")]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Shardtown"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some("© Shardtown"))
        .website(Some("https://shardtwn.fr"))
        .website_label(Some("shardtwn.fr"))
        .build();

    let show = MenuItemBuilder::with_id("show", "Ouvrir Shardtown").build(app)?;
    let about = PredefinedMenuItem::about(app, Some("À propos"), Some(about_metadata))?;
    let quit = PredefinedMenuItem::quit(app, Some("Quitter Shardtown"))?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&about)
        .separator()
        .item(&quit)
        .build()?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("bundle ships a default window icon");

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(false)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "show" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.unminimize();
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left click on the icon → reveal window (NordVPN-style).
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(win) = tray.app_handle().get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.unminimize();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(RpcState(Mutex::new(RpcInner { client: None, app_id: None })))
        .invoke_handler(tauri::generate_handler![
            token_get, token_set, token_clear,
            rpc_set, rpc_clear, rpc_disconnect, rpc_status,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                build_menu(app.handle())?;
                build_tray(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
