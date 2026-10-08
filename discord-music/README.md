# Discord Music Bot — 24/7 Nonstop Loop

Plays YouTube audio in a voice channel, nonstop. When a track ends it loops
the same track again. Stays in the voice channel even when nobody is there.

Commands (in any text channel the bot can read):

- `!play <YouTube link>` — start looping a track (replaces the current loop)
- `!stop` — stop playback
- `!now` — show what's looping

## One-time setup

### 1. Create the bot app

1. Go to https://discord.com/developers/applications → **New Application** → name it → Create.
2. Left menu → **Bot** → **Reset Token** → copy the token (you'll need it in step 4).
3. Same page → **Privileged Gateway Intents** → turn ON **Message Content Intent** → Save Changes.

### 2. Invite the bot to your server

1. Left menu → **OAuth2** → **URL Generator**.
2. Scopes: check **bot**.
3. Bot Permissions: check **Connect**, **Speak**, **Send Messages**, **Read Message History**.
4. Open the generated URL → pick your server → Authorize.

### 3. Get the voice channel ID

1. In Discord: Settings → Advanced → turn ON **Developer Mode**.
2. Right-click the voice channel the bot should sit in → **Copy Channel ID**.

### 4. Add secrets to GitHub

Repo → **Settings → Secrets and variables → Actions**:

- **Secrets** tab → New repository secret → Name: `DISCORD_TOKEN`, Value: the bot token.
- **Variables** tab → New repository variable → Name: `VOICE_CHANNEL_ID`, Value: the channel ID.
- *(Optional, only if YouTube blocks audio extraction with "Sign in to confirm you're not a bot"):
  export your YouTube cookies to a `cookies.txt` file (e.g. with the "Get cookies.txt LOCALLY"
  browser extension while logged into YouTube), then add it as a secret named `YT_COOKIES`
  (paste the whole file content as the value). The bot will use it to authenticate yt-dlp.*

### 5. Add the workflow file

Create `.github/workflows/discord-music.yml` in the repo (Add file → Create new file)
and paste the YAML from the chat message / below, then Commit.

### 6. Start it

Repo → **Actions** → **Discord Music 24/7** → **Run workflow**.
It also auto-restarts every 6 hours via schedule. The current track is saved and
resumes after each restart.

## Workflow file (.github/workflows/discord-music.yml)

```yaml
name: Discord Music 24/7

on:
  schedule:
    - cron: "15 */6 * * *" # every 6 hours (UTC), offset from the MC bot
  workflow_dispatch: {}

concurrency:
  group: discord-music
  cancel-in-progress: true # new run replaces the old one

jobs:
  music:
    runs-on: ubuntu-latest
    timeout-minutes: 350
    defaults:
      run:
        working-directory: discord-music
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm install --no-audit --no-fund

      - name: Install ffmpeg and yt-dlp
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq ffmpeg
          pip install -q yt-dlp

      - name: Restore loop state
        uses: actions/cache/restore@v4
        with:
          path: discord-music/now-playing.txt
          key: music-loop-restore
          restore-keys: |
            music-loop-

      - name: Run bot
        run: node bot.js
        env:
          DISCORD_TOKEN: ${{ secrets.DISCORD_TOKEN }}
          VOICE_CHANNEL_ID: ${{ vars.VOICE_CHANNEL_ID }}
          YT_COOKIES: ${{ secrets.YT_COOKIES }} # optional; only needed if YouTube blocks extraction (see section 4)

      - name: Save loop state
        if: always()
        uses: actions/cache/save@v4
        with:
          path: discord-music/now-playing.txt
          key: music-loop-${{ github.run_id }}-${{ github.run_attempt }}
```

## How it works

- `!play` saves the URL to `now-playing.txt`; the 6-hour restarts restore it from
  cache, so the loop resumes automatically.
- Audio path: `yt-dlp` extracts YouTube audio → `ffmpeg` encodes to Opus →
  Discord voice. No native Node modules needed.
- If YouTube blocks the runner's IP, the bot retries with backoff and logs the
  error — check the Actions run logs if music won't start.
