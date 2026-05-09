import { invoke } from "@tauri-apps/api/core";

/**
 * Bridge to the Rust side, which stores the personal access token in the
 * macOS Keychain via the `keyring` crate. The token never lives in JS state
 * across reloads — we always re-fetch from the Keychain on app boot.
 */

export async function tokenGet(): Promise<string | null> {
  return invoke<string | null>("token_get");
}

export async function tokenSet(token: string): Promise<void> {
  await invoke<void>("token_set", { token });
}

export async function tokenClear(): Promise<void> {
  await invoke<void>("token_clear");
}
