import { createContext, useContext } from "react";
import type { DiscordUser } from "./types";

export interface AuthState {
  user: DiscordUser | null;
  loading: boolean;
  refresh: () => void;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function avatarUrl(user: DiscordUser, size = 64) {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
  }
  const idx = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
