#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OPENCLAW_DIR="/home/user/.openclaw"

# Run the plot script to generate/update the SVG
/usr/bin/python3 "$SCRIPT_DIR/plot_hourly_usage.py"

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
