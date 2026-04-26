import { BotServerPage } from "@/components/BotServerPage";

export function ShardGuardServer() {
  return (
    <BotServerPage
      botKey="shardguard"
      botLabel="ShardGuard"
      botImage="/image/shardguard.png"
      configRoutePrefix="/shardguard/guild"
      loginPath="/login"
      inviteScopes="bot applications.commands"
      showBotPicker
    />
  );
}
