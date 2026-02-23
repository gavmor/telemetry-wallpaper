import json
import glob
import os
import math
from datetime import datetime, timedelta

# Paths
HOME_DIR = os.path.expanduser("~")
OPENCLAW_DIR = os.path.join(HOME_DIR, ".openclaw")
SESSIONS_DIR = os.path.join(OPENCLAW_DIR, "agents/main/sessions")
SESSIONS_CONFIG = os.path.join(SESSIONS_DIR, "sessions.json")
HISTORY_DIR = os.path.join(OPENCLAW_DIR, "usage_history")
STATE_PATH = os.path.join(HISTORY_DIR, "process_state.json")

os.makedirs(HISTORY_DIR, exist_ok=True)

# 1. Load Session Metadata (Channel/User lookup)
session_metadata = {}
if os.path.exists(SESSIONS_CONFIG):
    try:
        with open(SESSIONS_CONFIG, "r") as f:
            raw_sessions = json.load(f)
            for key, val in raw_sessions.items():
                sid = val.get("sessionId")
                if sid:
                    origin = val.get("origin", {})
                    label = origin.get("label", "unknown")
                    provider = origin.get("provider", "local")
                    session_metadata[sid] = f"{provider}/{label}"
    except: pass

# 2. Load State
state = {"cursors": {}, "daily_stats": {}, "spikes": {}}
if os.path.exists(STATE_PATH):
    try:
        with open(STATE_PATH, "r") as f:
            state = json.load(f)
    except: pass

# 3. Incremental Processing
session_files = glob.glob(os.path.join(SESSIONS_DIR, "*.jsonl"))
updated_days = set()
SPIKE_THRESHOLD = 50000

for file_path in session_files:
    filename = os.path.basename(file_path)
    current_size = os.path.getsize(file_path)
    last_offset = state["cursors"].get(filename, 0)
    if current_size < last_offset: last_offset = 0

    if current_size > last_offset:
        with open(file_path, "r") as f:
            f.seek(last_offset)
            # Try to get session ID from first line if we just started
            session_id = filename.replace(".jsonl", "")
            
            for line in f:
                try:
                    entry = json.loads(line)
                    if entry.get("type") == "session":
                        session_id = entry.get("id", session_id)
                    
                    if entry.get("type") == "message" and "message" in entry:
                        msg = entry["message"]
                        if "usage" in msg:
                            dt_local = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00")).astimezone()
                            day_str = dt_local.strftime("%Y-%m-%d")
                            minute = (dt_local.minute // 15) * 15
                            interval_str = dt_local.replace(minute=minute, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M")
                            
                            provider = msg.get("provider", "unknown")
                            model = msg.get("model", "unknown")
                            full_id = f"{provider}/{model}"
                            usage = msg["usage"]
                            active = usage.get("input", 0) + usage.get("output", 0)
                            cache = usage.get("cacheRead", 0) + usage.get("cacheWrite", 0)
                            total = active + cache
                            if total == 0: total = usage.get("totalTokens", 0)

                            if day_str not in state["daily_stats"]: state["daily_stats"][day_str] = {}
                            if interval_str not in state["daily_stats"][day_str]: state["daily_stats"][day_str][interval_str] = {}
                            if full_id not in state["daily_stats"][day_str][interval_str]: state["daily_stats"][day_str][interval_str][full_id] = {"active": 0, "cache": 0}
                            
                            state["daily_stats"][day_str][interval_str][full_id]["active"] += active
                            state["daily_stats"][day_str][interval_str][full_id]["cache"] += cache
                            updated_days.add(day_str)

                            if total > SPIKE_THRESHOLD:
                                if day_str not in state["spikes"]: state["spikes"][day_str] = []
                                # Lookup channel context
                                channel_ctx = session_metadata.get(session_id, "unknown/system")
                                
                                state["spikes"][day_str].append({
                                    "timestamp": entry["timestamp"],
                                    "interval": interval_str,
                                    "model": full_id,
                                    "tokens": total,
                                    "channel": channel_ctx
                                })
                except: continue
            state["cursors"][filename] = f.tell()

with open(STATE_PATH, "w") as f: json.dump(state, f)

for d_str in updated_days:
    history_path = os.path.join(HISTORY_DIR, f"usage_{d_str}.json")
    with open(history_path, 'w') as f:
        json.dump({"date": d_str, "stats": state["daily_stats"].get(d_str, {}), "spikes": state["spikes"].get(d_str, [])}, f, indent=2)

# --- SVG Rendering ---
today_dt = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
today_str = today_dt.strftime("%Y-%m-%d")
fixed_intervals = [(today_dt + timedelta(minutes=15*i)).strftime("%Y-%m-%d %H:%M") for i in range(96)]

today_data = state["daily_stats"].get(today_str, {})
today_spikes = state["spikes"].get(today_str, [])
models_today = set()
for interval in today_data:
    for m in today_data[interval]: models_today.add(m)
sorted_models = sorted(list(models_today))
if not sorted_models: sorted_models = ["no-data"]

series_labels = []; series_colors = []; series_data = []
BG = "#282828"; FG = "#ebdbb2"; GRAY = "#928374"; GRID = "#3c3836"
ACTIVE_COLORS = ["#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#fe8019"]
CACHE_COLORS  = ["#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#d65d0e"]

for i, full_id in enumerate(sorted_models):
    color_idx = i % len(ACTIVE_COLORS)
    has_cache = any(today_data.get(inv, {}).get(full_id, {}).get('cache', 0) > 0 for inv in fixed_intervals)
    if has_cache:
        series_labels.append(f"{full_id} (Cache)")
        series_colors.append(CACHE_COLORS[color_idx])
        series_data.append([today_data.get(inv, {}).get(full_id, {}).get('cache', 0) for inv in fixed_intervals])
    series_labels.append(f"{full_id} (Active)")
    series_colors.append(ACTIVE_COLORS[color_idx])
    series_data.append([today_data.get(inv, {}).get(full_id, {}).get('active', 0) for inv in fixed_intervals])

stacks = []
for s_idx in range(len(series_data)):
    row = []
    for h_idx in range(96):
        val = series_data[s_idx][h_idx]
        if s_idx > 0: val += stacks[s_idx - 1][h_idx]
        row.append(val)
    stacks.append(row)

max_val = max(stacks[-1]) if stacks and stacks[-1] else 1000
width = 1920; height = 1080
margin_left = 120; margin_right = 150; margin_top = 100; margin_bottom = 150
chart_w = width - margin_left - margin_right; chart_h = height - margin_top - margin_bottom

adj_max = (max_val // 100000 + 1) * 100000 # Simpler scaling
scale_x = lambda i: margin_left + (i / 95) * chart_w
scale_y = lambda v: height - margin_bottom - (v / adj_max) * chart_h

svg = [f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">']
svg.append(f'<rect width="100%" height="100%" fill="{BG}" />')
title = f"Token Usage: {today_dt.strftime('%A, %b %d %Y')}"
svg.append(f'<text x="{margin_left + chart_w/2}" y="60" font-family="monospace" font-size="32" font-weight="bold" text-anchor="middle" fill="{FG}">{title}</text>')

for idx in range(len(series_labels)-1, -1, -1):
    points = []
    for i in range(96): points.append(f"{scale_x(i)},{scale_y(stacks[idx][i])}")
    if idx > 0:
        for i in range(95, -1, -1): points.append(f"{scale_x(i)},{scale_y(stacks[idx-1][i])}")
    else:
        points.append(f"{scale_x(95)},{height-margin_bottom}"); points.append(f"{scale_x(0)},{height-margin_bottom}")
    op = "0.3" if "Cache" in series_labels[idx] else "0.8"
    svg.append(f'<polygon points="{" ".join(points)}" fill="{series_colors[idx]}" opacity="{op}" />')

svg.append(f'<line x1="{margin_left}" y1="{height-margin_bottom}" x2="{margin_left+chart_w}" y2="{height-margin_bottom}" stroke="{FG}" stroke-width="2"/>')
svg.append(f'<line x1="{margin_left}" y1="{margin_top}" x2="{margin_left}" y2="{height-margin_bottom}" stroke="{FG}" stroke-width="2"/>')

# Legend (Compact Top Right)
for i, (col, lab) in enumerate(zip(series_colors, series_labels)):
    y_p = margin_top + i*20; op = "0.3" if "Cache" in lab else "0.8"
    svg.append(f'<rect x="{width-300}" y="{y_p}" width="10" height="10" fill="{col}" opacity="{op}" />')
    svg.append(f'<text x="{width-285}" y="{y_p + 10}" font-family="monospace" font-size="12" fill="{FG}">{lab}</text>')

# Direct Spike Labeling on Chart
# Keep track of label positions to prevent overlap
last_label_x = -100
for spike in today_spikes:
    try:
        h_idx = fixed_intervals.index(spike["interval"])
        x = scale_x(h_idx)
        total_tokens = sum(today_data.get(spike["interval"], {}).get(m, {}).get('active', 0) + today_data.get(spike["interval"], {}).get(m, {}).get('cache', 0) for m in sorted_models)
        y = scale_y(total_tokens)
        
        svg.append(f'<circle cx="{x}" cy="{y}" r="3" fill="white" />')
        
        # Simple overlap prevention
        y_offset = -15 if (x - last_label_x) > 100 else -30
        last_label_x = x
        
        label_text = spike["channel"] # e.g. matrix/user_label
        svg.append(f'<text x="{x}" y="{y + y_offset}" font-family="monospace" font-size="10" fill="{FG}" text-anchor="middle">{label_text}</text>')
    except: continue

for i in range(0, 96, 8):
    lbl = fixed_intervals[i].split(" ")[1]; x = scale_x(i); y = height - margin_bottom + 10
    svg.append(f'<text x="{x}" y="{y+20}" font-family="monospace" font-size="12" text-anchor="middle" transform="rotate(35, {x}, {y+20})" fill="{GRAY}">{lbl}</text>')

svg.append('</svg>')
with open(os.path.join(OPENCLAW_DIR, "hourly_model_usage.svg"), 'w') as f: f.write("".join(svg))
print("On-chart semantic labels generated.")
