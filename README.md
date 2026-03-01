# @gavmor/telemetry-collector

A real-time token usage telemetry collector and SVG renderer for **OpenClaw**.

## 🚀 Features

- **Real-time Tracking:** Collects token usage metrics (Active vs Cache) across all model providers.
- **Granular Data:** Processes session logs with 15-minute interval precision.
- **Radical Differentiation:** Uses provider-specific HSL color regions (e.g., Anthropic=Blue, Google=Gold, OpenAI=Green) to make different providers instantly recognizable.
- **Daily Stats:** Displays real-time totals for **Total**, **Active**, and **Cached** tokens directly in the chart title.
- **Semantic Spikes:** Automatically identifies usage spikes and attributes them to the specific channel/user.
- **Beautiful Visualization:** Generates a 1080p chart with a **Gruvbox Dark** theme.
- **Remote Delivery:** Exposes an HTTP endpoint and a streamlined **RSS Feed** optimized for cross-device wallpaper syncing.

## 🛠 Installation

```bash
openclaw plugins install https://github.com/gavmor/telemetry-wallpaper
```

### Enable the Plugin

Ensure the plugin is enabled in your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["telemetry-collector"],
    "entries": {
      "telemetry-collector": { "enabled": true }
    }
  }
}
```

## 📊 Endpoints

The extension exposes the following endpoints via the OpenClaw Gateway (default port `18789`).

### Authentication

If your gateway is in `token` mode (default), you **must** append your gateway token to all requests:

- **SVG Chart:** `GET /api/telemetry/chart.svg?token=YOUR_TOKEN`
- **RSS Feed:** `GET /api/telemetry/feed.xml?token=YOUR_TOKEN`
- **PNG Chart:** `GET /api/telemetry/chart.png?token=YOUR_TOKEN`

To find your token, run:
```bash
openclaw config get gateway.auth.token
```

### Forcing Updates (Debug Mode)

To bypass the cache and force a fresh telemetry run (ideal for verifying style or layout changes), append `&debug=true` to any URL:
`http://127.0.0.1:18789/api/telemetry/feed.xml?token=YOUR_TOKEN&debug=true`

## 🖥 Desktop Integration

### Local Linux (Cinnamon)

```bash
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.openclaw/usage_telemetry.svg"
```

### Remote MacBook (via launchd)

1. Create a bridge script `~/bin/sync-telemetry.sh`:
```bash
#!/bin/bash
TOKEN=$(openclaw config get gateway.auth.token)
REMOTE_URL="http://macmini.local:18789/api/telemetry/chart.svg?token=$TOKEN"
LOCAL_PATH="$HOME/Pictures/openclaw_telemetry.svg"
curl -s -o "$LOCAL_PATH" "$REMOTE_URL"
osascript -e "tell application \"System Events\" to set picture of every desktop to \"$LOCAL_PATH\""
```

2. Create a LaunchAgent at `~/Library/LaunchAgents/com.openclaw.telemetry.plist`:
```xml
<!-- Run every 15 minutes -->
<dict>
    <key>Label</key><string>com.openclaw.telemetry</string>
    <key>ProgramArguments</key><array><string>/Users/youruser/bin/sync-telemetry.sh</string></array>
    <key>StartInterval</key><integer>900</integer>
</dict>
```

3. Load it: `launchctl load ~/Library/LaunchAgents/com.openclaw.telemetry.plist`

### No-Code (Standard RSS Tools)

Point any generic RSS-to-Wallpaper app to the `/api/telemetry/feed.xml?token=YOUR_TOKEN` endpoint. The feed automatically includes the token in all internal media links so images will load correctly and bypasses stale caches when testing.

## 📜 License

MIT
