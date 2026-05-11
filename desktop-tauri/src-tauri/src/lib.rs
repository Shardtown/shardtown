use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use keyring::Entry;
use serde::Deserialize;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

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

/// ─── Touch ID / biometric confirmation ───────────────────────────────────
/// Wraps macOS LocalAuthentication so the JS side can prompt for Touch ID
/// before destructive actions. Returns Ok(true) if the user authenticated,
/// Ok(false) if they cancelled, Err otherwise (no biometrics available,
/// Touch ID disabled, etc.).
#[cfg(target_os = "macos")]
#[tauri::command]
async fn biometric_confirm(reason: String) -> Result<bool, String> {
    use localauthentication_rs::{LAPolicy, LocalAuthentication};
    // Off the main thread so the UI stays responsive while the system
    // dialog is up.
    tauri::async_runtime::spawn_blocking(move || {
        let auth = LocalAuthentication::new();
        let label = if reason.trim().is_empty() {
            "Confirmer cette action".to_string()
        } else {
            reason
        };
        Ok(auth.evaluate_policy(
            LAPolicy::DeviceOwnerAuthenticationWithBiometrics,
            &label,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn biometric_confirm(_reason: String) -> Result<bool, String> {
    // No biometrics on non-mac targets — fall through.
    Ok(true)
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

const TRAY_PANEL_LABEL: &str = "tray-panel";
const TRAY_PANEL_WIDTH: f64 = 360.0;
const TRAY_PANEL_HEIGHT: f64 = 520.0;

/// Show / toggle the small popover that sits just under the menu-bar tray
/// icon — NordVPN / Claude style. Created lazily on first click; subsequent
/// clicks toggle visibility. Hides on blur so it disappears when the user
/// clicks elsewhere.
#[cfg(target_os = "macos")]
fn toggle_tray_panel(app: &tauri::AppHandle, click_x: f64, monitor_scale: f64) -> tauri::Result<()> {
    // Bring the whole app to the foreground first. Without this, clicking
    // the tray icon while another app (Safari, Discord…) has focus would
    // create the window but it'd immediately lose focus to the foreground
    // app — triggering our hide-on-blur listener before the user can even
    // interact with it.
    let _ = app.show();

    if let Some(existing) = app.get_webview_window(TRAY_PANEL_LABEL) {
        let visible = existing.is_visible().unwrap_or(false);
        if visible {
            let _ = existing.hide();
        } else {
            // Re-position before showing in case the user moved displays
            if let Ok(()) = position_tray_panel(&existing, click_x, monitor_scale) {
                let _ = existing.show();
                let _ = existing.set_focus();
            }
        }
        return Ok(());
    }

    // Same SPA, but a ?panel=tray query so App.tsx renders the compact view.
    // Transparent window enables the rounded corners + soft shadow drawn
    // by the CSS in the panel. Requires macos-private-api feature.
    let window = WebviewWindowBuilder::new(
        app,
        TRAY_PANEL_LABEL,
        WebviewUrl::App("index.html?panel=tray".into()),
    )
    .title("Shardtown")
    .inner_size(TRAY_PANEL_WIDTH, TRAY_PANEL_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(true)
    .build()?;

    position_tray_panel(&window, click_x, monitor_scale)?;
    let _ = window.show();
    let _ = window.set_focus();

    // Hide-on-blur: when the user clicks anywhere outside the popover the
    // window loses focus → we tuck it away. Tracked via a 200ms grace
    // window after each show() to absorb the focus race that happens when
    // the user invokes us from another app (Safari etc.) — without it,
    // the panel would show + immediately blur + hide before they could
    // interact.
    let panel_handle = window.clone();
    window.on_window_event(move |event| {
        match event {
            WindowEvent::Focused(false) => {
                // Schedule the hide; if the window was just shown,
                // is_visible may still be true and the user's intent
                // wasn't actually to dismiss.
                let win = panel_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    if !win.is_focused().unwrap_or(true) {
                        let _ = win.hide();
                    }
                });
            }
            _ => {}
        }
    });

    Ok(())
}

#[cfg(target_os = "macos")]
fn position_tray_panel(window: &tauri::WebviewWindow, click_x: f64, scale: f64) -> tauri::Result<()> {
    // click_x is a physical pixel value from the tray event; convert to
    // logical points so the position aligns regardless of retina vs
    // non-retina screens.
    let logical_x = click_x / scale;
    // Center the popover under the click point, clamp so it doesn't run
    // off the right edge of the screen.
    let monitor = window.current_monitor()?.unwrap_or_else(|| {
        // Fallback: try primary monitor; if even that fails we just bail.
        window
            .primary_monitor()
            .ok()
            .flatten()
            .expect("at least one monitor")
    });
    let monitor_size = monitor.size();
    let monitor_logical_w = monitor_size.width as f64 / scale;
    let mut x = logical_x - TRAY_PANEL_WIDTH / 2.0;
    if x + TRAY_PANEL_WIDTH > monitor_logical_w - 8.0 {
        x = monitor_logical_w - TRAY_PANEL_WIDTH - 8.0;
    }
    if x < 8.0 { x = 8.0; }
    // y = just below the menu bar (~22pt on macOS) + small gap.
    let y = 28.0;
    window.set_size(LogicalSize::new(TRAY_PANEL_WIDTH, TRAY_PANEL_HEIGHT))?;
    window.set_position(LogicalPosition::new(x, y))?;
    Ok(())
}

/// macOS-style status-bar tray icon: click opens a small popover panel
/// with bot status + quick actions (NordVPN / Claude style). Right-click
/// keeps the predefined menu (about / quit). Reuses the bundle's default
/// window icon for the tray.
#[cfg(target_os = "macos")]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Shardtown"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some("© Shardtown"))
        .website(Some("https://shardtwn.fr"))
        .website_label(Some("shardtwn.fr"))
        .build();

    let show = MenuItemBuilder::with_id("show-main", "Ouvrir Shardtown").build(app)?;
    let about = PredefinedMenuItem::about(app, Some("À propos"), Some(about_metadata))?;
    let quit = PredefinedMenuItem::quit(app, Some("Quitter Shardtown"))?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&about)
        .separator()
        .item(&quit)
        .build()?;

    // Dedicated tray icon (NOT the app's window icon) so the menu-bar
    // logo can be distinct from the dock icon. Embedded at compile time
    // from src-tauri/icons/tray.png.
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
        .expect("tray.png is a valid PNG bundled at compile time");

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(false)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "show-main" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.unminimize();
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left click on the icon → open the popover panel just below
            // the menu bar, NordVPN / Claude style. The popover hides on
            // blur so a click anywhere else tucks it away.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                // Tauri 2.x wraps rect.position / size in enums (Physical
                // vs Logical) — unwrap to a physical f64 here, falling back
                // to the cursor x if the rect isn't usable.
                let icon_x_opt: Option<f64> = match rect.position {
                    tauri::Position::Physical(p) => Some(p.x as f64),
                    tauri::Position::Logical(p) => Some(p.x),
                };
                let icon_w: f64 = match rect.size {
                    tauri::Size::Physical(s) => s.width as f64,
                    tauri::Size::Logical(s) => s.width,
                };
                let cursor_x = position.x;
                let click_x = icon_x_opt
                    .map(|x| x + icon_w / 2.0)
                    .filter(|&x| x > 0.0)
                    .unwrap_or(cursor_x);
                // Best-effort monitor scale; default to 2.0 on retina if
                // we can't query it (macOS).
                let scale = app
                    .get_webview_window("main")
                    .and_then(|w| w.scale_factor().ok())
                    .unwrap_or(2.0);
                let _ = toggle_tray_panel(app, click_x, scale);
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
            biometric_confirm,
        ])
        // Hide-instead-of-quit on the main window: the user can close the
        // main window with ⌘W but the app keeps running with just the
        // menu-bar tray icon visible. ⌘Q quits properly.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
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
