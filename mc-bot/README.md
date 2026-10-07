# Minecraft Bot (GitHub Actions)

Runs the `Madara_1ea` Mineflayer bot on `mc.havencraft.pro:2566` 24/7 using
GitHub Actions runners.

## Setup (one-time)

1. Go to this repo on GitHub → **Settings → Secrets and variables → Actions**
2. **New repository secret**
   - Name: `MC_LOGIN_CMD`
   - Value: the server login command, e.g. `/login 261200`
3. Go to the **Actions** tab → **Minecraft Bot 24/7** → **Run workflow** to start it now.
   (It also auto-starts every 6 hours via schedule.)

## How it works

- The workflow runs the bot for ~5h50m, then the next scheduled run replaces it
  (`concurrency.cancel-in-progress`), so there is never more than one bot online.
- Inside the run, the bot auto-reconnects: 15s after a normal kick,
  every 2 minutes while the server is down/restarting.
- Anti-AFK: the bot gently looks around every 45 seconds.
