#!/bin/bash

# Inherit paths from OpenClaw environment variables
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_DIR="$( dirname "$SCRIPT_DIR" )"

# FALLBACKS if run manually
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

# Use uv to run the main.py script
cd "$PLUGIN_DIR"
uv run main.py

# Path to the generated SVG (now using the official state directory)
SVG_PATH="$OPENCLAW_STATE_DIR/hourly_model_usage.svg"

if [ -f "$SVG_PATH" ]; then
    /usr/bin/gsettings set org.cinnamon.desktop.background picture-uri "file://$SVG_PATH"
    /usr/bin/gsettings set org.cinnamon.desktop.background picture-options "scaled"
    echo "Wallpaper updated: $(date)"
else
    echo "Error: SVG not found at $SVG_PATH"
fi
