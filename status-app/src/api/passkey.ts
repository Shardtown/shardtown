import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { apiPost, apiGet, apiDelete } from "@/api/client";

export interface PasskeyRow {
  id: number;
  name: string;
  transports: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function listPasskeys(): Promise<PasskeyRow[]> {
  const r = await apiGet<{ passkeys: PasskeyRow[] }>("/api/account/passkeys");
  return r.passkeys;
}

export async function deletePasskey(id: number): Promise<void> {
  await apiDelete(`/api/account/passkeys/${id}`);
}

// @simplewebauthn/browser v11 accepts either { optionsJSON } OR the raw
// PublicKeyCredentialRequestOptionsJSON directly. We pass it directly to
// dodge the TypeScript wrapper type drift.
//
// Note: the cast to a structural shape that startRegistration / startAuthentication
// accept (`as Parameters<typeof X>[0]`) tells TS not to complain about the
// indirection, while keeping runtime data identical to what the server sent.

export async function registerPasskey(name: string): Promise<void> {
  let options: unknown;
  try {
    options = await apiPost<unknown>("/api/account/passkey/register-begin");
  } catch (e) {
    console.error("[passkey] register-begin failed", e);
    throw e;
  }
  let attResp;
  try {
    attResp = await startRegistration(options as Parameters<typeof startRegistration>[0]);
  } catch (e) {
    console.error("[passkey] startRegistration failed", e);
    throw e;
  }
  try {
    await apiPost("/api/account/passkey/register-complete", { name, response: attResp });
  } catch (e) {
    console.error("[passkey] register-complete failed", e);
    throw e;
  }
}

export async function authenticateWithPasskey(identifier: string): Promise<void> {
  let options: unknown;
  try {
    options = await apiPost<unknown>("/api/account/passkey/auth-begin", { identifier });
  } catch (e) {
    console.error("[passkey] auth-begin failed", e);
    throw e;
  }
  let authResp;
  try {
    authResp = await startAuthentication(options as Parameters<typeof startAuthentication>[0]);
  } catch (e) {
    console.error("[passkey] startAuthentication failed", e);
    throw e;
  }
  try {
    await apiPost("/api/account/passkey/auth-complete", { response: authResp });
  } catch (e) {
    console.error("[passkey] auth-complete failed", e);
    throw e;
  }
}
