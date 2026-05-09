use keyring::Entry;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![token_get, token_set, token_clear])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            build_menu(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
