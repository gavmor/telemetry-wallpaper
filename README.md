# @gavmor/telemetry-collector

A real-time token usage telemetry collector and SVG renderer for **OpenClaw**.

## 🚀 Features

- **Real-time Tracking:** Collects token usage metrics (Active vs Cache) across all model providers.
- **Granular Data:** Processes session logs with 15-minute interval precision.
- **Semantic Spikes:** Automatically identifies usage spikes (>50k tokens) and attributes them to the specific channel/user.
- **Beautiful Visualization:** Generates a 1080p SVG chart with a **Gruvbox Dark** theme.
- **Remote Delivery:** Exposes an HTTP endpoint and an **RSS Feed** for cross-device wallpaper syncing.
- **Unixy Architecture:** A pure data generator that emits events and lets you pipe the output anywhere.

## 🛠 Installation

```bash
openclaw plugins install https://github.com/gavmor/telemetry-wallpaper
```

## 📊 Endpoints

The extension exposes the following endpoints via the OpenClaw Gateway (default port `18789`):

- **SVG Chart:** `GET /api/telemetry/chart.svg` (The latest 1080p chart)
- **RSS Feed:** `GET /api/telemetry/feed.xml` (Updates on new charts and usage spikes)

## 🖥 Desktop Integration

### Local Linux (Cinnamon)

```bash
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.openclaw/usage_telemetry.svg"
```

### Remote MacBook (via launchd)

1. Create a bridge script `~/bin/sync-telemetry.sh`:
```bash
#!/bin/bash
REMOTE_URL="http://macmini.local:18789/api/telemetry/chart.svg"
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

You can point any generic RSS-to-Wallpaper app (like `DailyWallpaper` on macOS) to the `/api/telemetry/feed.xml` endpoint. This will automatically sync the chart and can even notify you of usage spikes.

## 📜 License

MIT
