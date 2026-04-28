import { createContext, useContext } from "react";

export interface Account {
  id: number;
  email: string;
  email_verified: boolean;
  pseudo: string;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar: string | null;
  oauth_google_id: string | null;
  oauth_google_email: string | null;
  oauth_github_id: string | null;
  oauth_github_username: string | null;
  shard_id: string | null;
  shard_username: string | null;
  shard_avatar: string | null;
  shard_linked_at: string | null;
  created_at: string;
}

interface AccountState {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const AccountContext = createContext<AccountState>({
  account: null,
  loading: true,
  refresh: async () => {},
});

export function useAccount() {
  return useContext(AccountContext);
}
