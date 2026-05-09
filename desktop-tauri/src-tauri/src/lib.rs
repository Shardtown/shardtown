use keyring::Entry;
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
        .invoke_handler(tauri::generate_handler![token_get, token_set, token_clear])
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
