# Trendarr - Movie & Series Discord Bot (Radarr & Sonarr)

**Trendarr** is an automated Discord bot that discovers trending movies and TV series weekly via The Movie Database (TMDB), enriches them with IMDb ratings, and posts rich interactive embeds to your Discord server. Users can click a single button underneath any recommendation to immediately add it to **Radarr** or **Sonarr** and begin downloading.

---

## Features

- 🎬 **Weekly Trending Movies**:
  - Automatically fetches the top trending movies of the week.
  - Enriched with synopsis, release year, poster, and live ⭐ IMDb ratings.
  - **"Add to Radarr"** button triggers an immediate search and download via your Radarr instance.
- 📺 **Weekly Trending TV Series**:
  - Automatically fetches the top trending scripted series of the week.
  - Filters out unscripted noise (Reality TV, News, and Talk Shows).
  - Enriched with total season count, series status, overview, poster, and live ⭐ IMDb ratings.
  - **"Add to Sonarr"** button maps the show via TheTVDB (TVDB ID) or title, monitors all seasons and episodes, and triggers an immediate download search via your Sonarr instance.
- 📬 **Dual-Channel Support**:
  - Send movies to your movie channel and TV series to your dedicated series channel.
- 🛡️ **Deduplication & State Persistence**:
  - Prevents posting the same title twice.
  - Tracks sent IDs in `data/sent_movies.json` and `data/sent_series.json`.
  - Disables Discord buttons once clicked to prevent duplicate add requests.
- 🐳 **Docker & NAS Ready**:
  - Lightweight container with Docker Compose configuration and persistent data volume.

---

## Architecture Overview

```
                 ┌────────────────────────────────────────────────────────┐
                 │                       TMDB API                         │
                 └──────────────┬─────────────────────────┬───────────────┘
                                │                         │
                        Trending Movies            Trending Series
                                │                  (Filtered: No Reality/Talk)
                                ▼                         ▼
                   ┌────────────────────────┐┌────────────────────────┐
                   │    Radarr Dispatch     ││    Sonarr Dispatch     │
                   └───────────┬────────────┘└────────────┬───────────┘
                               │                          │
                               ▼                          ▼
                   #movies Discord Channel    #series Discord Channel
                   [📥 Add to Radarr]         [📺 Add to Sonarr]
                               │                          │
                               ▼                          ▼
                           Radarr API                 Sonarr API
                        (Port 7878)                (Port 8989)
```

---

## Prerequisites

1. **Discord Bot Token**:
   - Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
   - Go to the **Bot** tab, create a bot, and copy the **Bot Token**.
   - Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content Intent**.
   - Under **OAuth2 -> URL Generator**, select scopes `bot` and permissions:
     - `Send Messages`
     - `Embed Links`
     - `Read Messages/View Channels`
     - `Read Message History`
   - Invite the bot to your Discord server.
2. **TMDB API Key**:
   - Free account at [themoviedb.org](https://www.themoviedb.org/).
   - Generate an API key under Account Settings -> API.
3. **OMDB API Key** (Optional):
   - Free key at [omdbapi.com](https://www.omdbapi.com/) to fetch live ⭐ IMDb ratings on embeds.
   - Add `OMDB_API_KEY=your_key` in `.env`. If omitted, recommendations are sent without IMDb ratings.
4. **Radarr & Sonarr**:
   - Running on your NAS or local network.

---

## Configuration (`.env`)

Create a `.env` file in the root directory (you can copy `.env.example`):

```bash
cp .env.example .env
```

Fill in the required configuration values:

```env
# ==============================================================================
# Discord Configuration
# ==============================================================================
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_movies_channel_id_here        # Channel ID for Movies
DISCORD_SERIES_CHANNEL_ID=your_series_channel_id_here # Channel ID for Series

# ==============================================================================
# Radarr & Sonarr (Quality Profiles and Root Folders are configured
# automatically in Discord on first startup or via !setup)
# ==============================================================================
RADARR_URL=http://192.168.1.10:7878
RADARR_API_KEY=your_radarr_api_key_here

SONARR_URL=http://192.168.1.10:8989
SONARR_API_KEY=your_sonarr_api_key_here

# ==============================================================================
# TMDB & Schedule
# ==============================================================================
TMDB_API_KEY=your_tmdb_api_key_here
CRON_SCHEDULE=0 17 * * 5         # Movies: Every Friday at 17:00
CRON_SCHEDULE_SERIES=0 17 * * 5  # Series: Every Friday at 17:00
```

> [!TIP]
> **Zero Manual Profile or Path Setup Required**:
> Quality profiles and storage root folders are now managed automatically. On first startup, MovieBot automatically queries your Radarr & Sonarr instances, lets you select or create profiles and choose storage drives right inside Discord, and saves your preferences to `data/config.json`.

### How to Find Your Settings

| Setting | Where to find it |
| :--- | :--- |
| **Discord Channel ID** | In Discord: User Settings -> Advanced -> Enable **Developer Mode**. Then right-click the desired text channel and click **Copy Channel ID**. |
| **Radarr / Sonarr API Key** | In Radarr/Sonarr: **Settings** -> **General** -> **Security** -> **API Key**. |
| **Cron Schedule** | Standard 5-field cron syntax: `minute hour day-of-month month day-of-week` (e.g. `0 17 * * 5` is Fridays at 5:00 PM). |
| **Quality Profiles & Folders** | Configured automatically via Discord on startup or on demand via `!setup`. |

#### Automated Discord Setup Wizard (Zero-Config)
MovieBot includes a built-in interactive setup wizard in Discord:
* **First Startup**: If quality profiles are not yet set in `.env` or `data/config.json`, the bot automatically posts a Setup Card in Discord.
* **On-Demand**: You can re-trigger this wizard at any time in Discord by typing:
  ```text
  !setup
  ```
  *(or `!profiles`)*
* **How It Works**:
  1. Click **Create 1080p Profile**, **Create 4K Profile**, or **Choose Existing Profile**.
  2. A Discord Modal opens to confirm the name (e.g. `MovieBot-1080p`).
  3. The bot automatically creates the profile in both Radarr and Sonarr via their APIs.
  4. Saves the generated IDs to `data/config.json` (persisting across Docker restarts).
  5. Immediately triggers the weekly discovery dispatch!

#### Inspecting Quality Profiles via CLI
You can also inspect all available Quality Profiles on your live instances at any time by running:
```bash
npm run profiles
```
This queries the Radarr and Sonarr APIs and prints:
```text
🎬 Radarr Profiles (http://192.168.1.10:7878):
   - ID: 1  -> "Any"
   - ID: 4  -> "HD-1080p" (ACTIVE)
   - ID: 7  -> "UltraHD"

📺 Sonarr Profiles (http://192.168.1.10:8989):
   - ID: 1  -> "Any"
   - ID: 4  -> "HD-1080p" (ACTIVE)
   - ID: 7  -> "UltraHD"
```

#### Manual Quality Profile Creation in Web UI (Optional)
If you prefer creating profiles in the Web UI:
1. Open Sonarr (e.g. `http://192.168.1.10:8989`) or Radarr.
2. Go to **Settings** -> **Profiles**.
3. Under **Quality Profiles**, click the **`+`** button.
4. Choose a Name (e.g., `MovieBot-1080p`).
5. Check/uncheck and rank the qualities you want Sonarr to download (e.g., `WEBDL-1080p`, `Bluray-1080p`).
6. Click **Save**.
7. Run `!setup` in Discord to select your new profile from the menu, or inspect its ID with `npm run profiles`.

---

## Installation & Running

### Option 1: Running with Docker Compose (Recommended for NAS)

1. Build and start the container in the background:
   ```bash
   docker-compose up -d --build
   ```
2. View real-time logs:
   ```bash
   docker-compose logs -f
   ```
3. Stop the container:
   ```bash
   docker-compose down
   ```

> [!NOTE]
> The `./data` directory is mounted into the container as a persistent volume. This guarantees your `sent_movies.json` and `sent_series.json` history persists across container restarts and updates.

### Option 2: Running Locally with Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the bot:
   ```bash
   node src/index.js
   ```

Upon startup, the bot will:
1. Log in to Discord.
2. Initialize cron jobs for weekly dispatch.
3. Perform an immediate check on startup and send any new trending movies to `#movies` and series to `#series`.

---

## Project Structure

```
MovieBot/
├── .env                  # Private configuration & secrets (gitignored)
├── .env.example          # Sample configuration template
├── .gitignore            # Git ignore rules protecting credentials
├── Dockerfile            # Container definition
├── docker-compose.yml    # Docker Compose orchestration
├── package.json          # Node dependencies and scripts
├── README.md             # Documentation
├── scripts/
│   └── check-profiles.js # CLI tool to list available Radarr/Sonarr profiles
├── data/                 # Persistent storage (gitignored)
│   ├── config.json       # Active quality profiles & storage root folders
│   ├── sent_movies.json  # History of sent movie IDs
│   └── sent_series.json  # History of sent TV series IDs
└── src/
    ├── index.js          # Bot entrypoint & interaction routers
    ├── config.js         # Runtime profile & root folder config manager
    ├── profiles.js       # Profile querying, creation & drive pairing logic
    ├── setupWizard.js    # Interactive Discord setup flow (buttons & modals)
    ├── cron.js           # Scheduler & Discord message/embed dispatchers
    ├── radarr.js         # Radarr API integration (lookup & add movie)
    ├── sonarr.js         # Sonarr API integration (lookup & add series)
    └── tmdb.js           # TMDB API client (trending & details fetcher)
```

---

## Troubleshooting

- **401 Unauthorized when adding to Sonarr/Radarr**:
  Verify the `SONARR_API_KEY` or `RADARR_API_KEY` in `.env` matches what is displayed in **Settings -> General -> Security**.
- **Bot doesn't respond to button clicks**:
  Ensure the bot process is actively running (`docker-compose ps` or check terminal). Webhooks cannot process button interactions; only an active Discord bot client can receive the `interactionCreate` event.
- **Series is already in Sonarr**:
  The bot detects duplicates automatically. If a series already exists in Sonarr, the bot replies with an ephemeral message: *"⚠️ This series is already in your Sonarr library!"*
- **Docker Network Connectivity**:
  If your Radarr/Sonarr instances are running in Docker on the same NAS, you can either use your NAS local IP (e.g. `http://192.168.1.10:8989`) or connect `movie-series-bot` to the same Docker bridge network (see commented section in `docker-compose.yml`).
