use keyring::Entry;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![token_get, token_set, token_clear])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
