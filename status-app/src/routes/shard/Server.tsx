import { BotServerPage } from "@/components/BotServerPage";

export function ShardServer() {
  return (
    <BotServerPage
      botKey="shard"
      botLabel="Shard"
      botImage="/image/shard.png"
      configRoutePrefix="/shard/guild"
      loginPath="/shard/login"
      inviteScopes="bot applications.commands"
    />
  );
}
