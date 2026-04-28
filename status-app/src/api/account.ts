import { createContext, useContext } from "react";

export interface Account {
  id: number;
  email: string;
  email_verified: boolean;
  pseudo: string;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar: string | null;
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
