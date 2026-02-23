# @gavmor/telemetry-collector

A real-time token usage telemetry collector and SVG renderer for **OpenClaw**.

## 🚀 Features

- **Real-time Tracking:** Collects token usage metrics (Active vs Cache) across all model providers.
- **Granular Data:** Processes session logs with 15-minute interval precision.
- **Semantic Spikes:** Automatically identifies usage spikes (>50k tokens) and attributes them to the specific channel/user.
- **Beautiful Visualization:** Generates a 1080p SVG chart with a **Gruvbox Dark** theme.
- **Privacy First:** Stores historical data in a secure, isolated directory (`~/.openclaw/storage/plugins/telemetry-collector/`).
- **Unixy Architecture:** A pure data generator that emits events and exposes an HTTP endpoint for remote delivery.

## 🛠 Installation

```bash
openclaw plugins install https://github.com/gavmor/telemetry-wallpaper
```

## 📊 Usage

The extension automatically updates a telemetry chart at `~/.openclaw/usage_telemetry.svg` after every agent turn.

### Local Linux Integration (Cinnamon)

```bash
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.openclaw/usage_telemetry.svg"
gsettings set org.cinnamon.desktop.background picture-options "scaled"
```

### Remote MacBook Integration

If you run OpenClaw on a remote machine (e.g., a Mac Mini) and want the wallpaper on your MacBook, use the built-in HTTP endpoint.

1. **Expose the Gateway:** Ensure your OpenClaw Gateway port (default `18789`) is accessible from your MacBook.
2. **MacBook Bridge Script:** Save this script as `update_wallpaper.sh` on your MacBook:

```bash
#!/bin/bash
# Update local wallpaper from remote OpenClaw Gateway
REMOTE_URL="http://macmini.local:18789/api/telemetry/chart.svg"
LOCAL_PATH="$HOME/Pictures/openclaw_telemetry.svg"

curl -s -o "$LOCAL_PATH" "$REMOTE_URL"
osascript -e "tell application \"Finder\" to set desktop picture to POSIX file \"$LOCAL_PATH\""
```

3. **Schedule:** Run this script via `cron` or an OpenClaw hook on your MacBook.

## 🔌 Integration API

### HTTP Endpoint
Exposes the latest SVG at: `GET /api/telemetry/chart.svg`

### Event Hook
Other extensions can listen for updates:

```javascript
api.on('telemetry:updated', ({ path }) => {
  console.log(`New telemetry chart available at: ${path}`);
});
```

## 📜 License

MIT
