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

export async function registerPasskey(name: string): Promise<void> {
  const options = await apiPost<unknown>("/api/account/passkey/register-begin");
  // simplewebauthn expects { optionsJSON }
  const attResp = await startRegistration({ optionsJSON: options as object as never });
  await apiPost("/api/account/passkey/register-complete", { name, response: attResp });
}

export async function authenticateWithPasskey(identifier: string): Promise<void> {
  const options = await apiPost<unknown>("/api/account/passkey/auth-begin", { identifier });
  const authResp = await startAuthentication({ optionsJSON: options as object as never });
  await apiPost("/api/account/passkey/auth-complete", { response: authResp });
}
