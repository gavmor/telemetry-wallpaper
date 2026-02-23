# @gavmor/telemetry-collector

A real-time token usage telemetry collector and SVG renderer for **OpenClaw**.

## 🚀 Features

- **Real-time Tracking:** Collects token usage metrics (Active vs Cache) across all model providers.
- **Granular Data:** Processes session logs with 15-minute interval precision.
- **Semantic Spikes:** Automatically identifies usage spikes (>50k tokens) and attributes them to the specific channel/user.
- **Beautiful Visualization:** Generates a 1080p SVG chart with a **Gruvbox Dark** theme.
- **Privacy First:** Stores historical data in a secure, isolated directory (`~/.openclaw/storage/plugins/telemetry-collector/`).
- **Unixy Architecture:** A pure data generator that emits events and lets the user handle the integration.

## 🛠 Installation

```bash
openclaw plugins install https://github.com/gavmor/telemetry-wallpaper
```

## 📊 Usage

The extension automatically updates a telemetry chart at `~/.openclaw/usage_telemetry.svg` after every agent turn and upon gateway startup.

### Setting as Desktop Background (Cinnamon/Linux)

Since this extension follows the Unix philosophy, it does not manage your desktop for you. To use the generated SVG as your wallpaper, run:

```bash
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.openclaw/usage_telemetry.svg"
gsettings set org.cinnamon.desktop.background picture-options "scaled"
```

Cinnamon will automatically refresh the background whenever the SVG file is updated by the extension.

## 🔌 Integration API

Other extensions or hooks can listen for the update event to trigger custom actions:

```javascript
api.on('telemetry:updated', ({ path }) => {
  console.log(`New telemetry chart available at: ${path}`);
});
```

## ⚙️ Configuration

You can tune the behavior in your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "telemetry-collector": {
        "spikeThreshold": 50000,
        "resolution": "1920x1080",
        "theme": "gruvbox-dark"
      }
    }
  }
}
```

## 📜 License

MIT
