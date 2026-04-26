export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
  global_name?: string | null;
}

export interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  hasBot?: { Shard?: boolean; ShardGuard?: boolean };
}

export interface MeResponse {
  user: DiscordUser | null;
}
