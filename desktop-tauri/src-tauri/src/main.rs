// Avoids spawning a console window on Windows in release builds; macOS-only
// project for now but the attribute is harmless elsewhere.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shardtown_desktop_lib::run()
}
