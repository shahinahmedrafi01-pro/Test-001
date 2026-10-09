# Minecraft Bot (GitHub Actions)

Runs the `Madara_1ea` Mineflayer bot on `mc.havencraft.pro:2566` 24/7 using
GitHub Actions runners.

## Setup (one-time)

1. Go to this repo on GitHub → **Settings → Secrets and variables → Actions**
2. **New repository secret**
   - Name: `MC_LOGIN_CMD`
   - Value: the server login command, e.g. `/login 261200`
3. Go to the **Actions** tab → **Minecraft Bot 24/7** → **Run workflow** to start it now.
   (It also auto-starts every 5 hours via schedule.)

## How it works

- The workflow runs the bot for ~5h50m, then the next scheduled run replaces it
  (`concurrency.cancel-in-progress`), so there is never more than one bot online.
- Inside the run, the bot auto-reconnects: 15s after a normal kick,
  every 2 minutes while the server is down/restarting.
- Anti-AFK: the bot gently looks around every 30 seconds, double-crouches every
  2 minutes, and greets nearby players (look + double-crouch).
- Chat command: anyone can type `!hii` in game chat and the bot replies `hii`
  (15s cooldown per player).

## Discord bridge (remote control)

Control the bot from Discord, and see game chat in Discord.

**Discord app setup (one-time):**

1. Create a **second** Discord application at
   https://discord.com/developers/applications
   (do NOT reuse the music bot's token — one token can only stay connected
   in one place at a time).
2. **Bot → Reset Token** → copy it (never share it in chat).
3. **Bot → Privileged Gateway Intents → Message Content Intent → enable** → Save.
4. **OAuth2 → URL Generator → scopes: `bot`** → permissions: Send Messages,
   Read Message History → open the generated URL and add the bot to your server.
5. In Discord: **Settings → Advanced → Developer Mode ON**, then right-click
   your channel → **Copy Channel ID**, and right-click your own name →
   **Copy User ID**.

**Repo secrets** (Settings → Secrets and variables → Actions → New repository secret):

- `DISCORD_MC_TOKEN` = the new bot token
- `DISCORD_CHANNEL_ID` = the channel ID
- `DISCORD_OWNER_ID` = your Discord user ID (only you can send commands)

**Workflow env** — in `.github/workflows/mc-bot.yml`, add these 3 lines to the
`env:` block of the `Run bot` step:

```yaml
          DISCORD_MC_TOKEN: ${{ secrets.DISCORD_MC_TOKEN }}
          DISCORD_CHANNEL_ID: ${{ secrets.DISCORD_CHANNEL_ID }}
          DISCORD_OWNER_ID: ${{ secrets.DISCORD_OWNER_ID }}
```

Then **Run workflow** once to start with the bridge enabled.

**Use (in the Discord channel):**

- `!say <message>` → the MC bot says it in game chat
  (`!say /spawn` runs `/spawn` as a command)
- `!cmd <command>` → the MC bot runs `/<command>` (e.g. `!cmd spawn`)
- Game chat is relayed back into the Discord channel automatically.

Without the Discord secrets set, the bot simply runs as before (bridge disabled).
