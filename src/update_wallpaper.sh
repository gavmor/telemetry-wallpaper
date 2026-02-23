#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_DIR="$( dirname "$SCRIPT_DIR" )"
OPENCLAW_DIR="$HOME/.openclaw"

# Use uv to run the main.py script
cd "$PLUGIN_DIR"
uv run main.py

# Path to the generated SVG
SVG_PATH="$OPENCLAW_DIR/hourly_model_usage.svg"

# Check if file exists
if [ -f "$SVG_PATH" ]; then
    # Set the wallpaper for Cinnamon
    # Note: Cinnamon uses picture-uri for the background
    /usr/bin/gsettings set org.cinnamon.desktop.background picture-uri "file://$SVG_PATH"
    # Force a refresh if needed (sometimes setting the same path doesn't trigger a redraw if the file changed)
    /usr/bin/gsettings set org.cinnamon.desktop.background picture-options "scaled"
    echo "Wallpaper updated: $(date)"
else
    echo "Error: SVG not found at $SVG_PATH"
fi
