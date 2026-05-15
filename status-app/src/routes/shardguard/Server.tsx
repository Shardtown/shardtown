import { BotServerPage } from "@/components/BotServerPage";

export function ShardGuardServer() {
  return (
    <BotServerPage
      botKey="shardguard"
      botLabel="Shard · Sécurité"
      botImage="/image/shard.png"
      configRoutePrefix="/shardguard/guild"
      loginPath="/login"
      inviteScopes="bot applications.commands"
      showBotPicker
    />
  );
}
