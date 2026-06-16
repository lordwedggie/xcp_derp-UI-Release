---
name: video-editor
description: Automate video editing with FFmpeg — trim, cut, concatenate, add text overlays, intro/outro cards, speed ramps, and render to MP4. Use when the user mentions video editing, tutorial videos, cutting clips, trimming silence, adding text to video, or preparing OBS recordings for publishing. Applies to both CodeWhale and Codex.
---

# Video Editor

Automated FFmpeg-based video editing for tutorial and demo recordings.

## Requirements

- **FFmpeg** must be installed and on PATH. Verify with `ffmpeg -version`.
- Input videos are expected to be OBS recordings (MKV or MP4).

## Workflow

### 1. Understand the task

Ask the user for:
- **Input file path** — the raw recording
- **What to do** — trim, add titles, concatenate clips, etc.
- **Timestamps** — when titles/overlays should appear and disappear
- **Output file path** — where to save the result (default: same folder, `_edited.mp4` suffix)

If the user doesn't know exact timestamps, offer to extract frames at regular intervals so they can identify the right moments.

### 2. Inspect the input

Before any edits, run:
```bash
ffprobe -v quiet -print_format json -show_format -show_streams input.mkv
```
Report back the duration, resolution, framerate, and codec.

### 3. Build the command

Use FFmpeg filters and options. Key operations:

**Trim (cut section out, keep the rest):**
```bash
ffmpeg -i input.mkv -vf "select='not(between(t,START,END))',setpts=N/FRAME_RATE/TB" -af "aselect='not(between(t,START,END))',asetpts=N/SR/TB" output.mp4
```
For simple cuts at start/end, use `-ss` and `-to` instead — they're faster because they seek without re-encoding when used before `-i`:
```bash
ffmpeg -ss START -to END -i input.mkv -c copy output.mp4
```

**Add text overlay (lower-third, title, chapter marker):**
```bash
ffmpeg -i input.mkv -vf "drawtext=text='Your Text':fontfile=/Windows/Fonts/arial.ttf:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-40:enable='between(t,START,END)'" output.mp4
```

**Add an intro title card (solid background + centered text):**
```bash
ffmpeg -f lavfi -i color=c=#1a1a2e:s=1920x1080:d=3 -vf "drawtext=text='Title Here':fontfile=/Windows/Fonts/arial.ttf:fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" intro.mp4
```
Then concatenate with the main video.

**Concatenate multiple clips:**
First, create a file list (`concat_list.txt`):
```
file 'intro.mp4'
file 'main.mp4'
file 'outro.mp4'
```
Then:
```bash
ffmpeg -f concat -safe 0 -i concat_list.txt -c copy output.mp4
```
All files must have the same resolution and codec. If they don't, re-encode them to match first.

**Speed ramp (slow down or speed up a section):**
```bash
ffmpeg -i input.mkv -vf "setpts=2.0*PTS" -af "atempo=0.5" output.mp4  # half speed
ffmpeg -i input.mkv -vf "setpts=0.5*PTS" -af "atempo=2.0" output.mp4  # double speed
```

**Fade in/out:**
```bash
ffmpeg -i input.mkv -vf "fade=t=in:st=0:d=1,fade=t=out:st=DURATION-1:d=1" -af "afade=t=in:st=0:d=1,afade=t=out:st=DURATION-1:d=1" output.mp4
```

### 4. Execute and verify

- Run the command with `exec_shell`. FFmpeg prints progress to stderr — check for errors.
- After completion, verify with `ffprobe` that the output has the expected duration and resolution.
- If the user wants a preview, extract a single frame: `ffmpeg -i output.mp4 -ss 00:00:02 -vframes 1 preview.jpg`.

### 5. Clean up

- Remove temporary files (intermediate clips, concat lists).
- Report the final output path, duration, and file size.

## Key FFmpeg flags

| Flag | Purpose |
|------|---------|
| `-ss` | Start time (fast seek before `-i`, slow seek after) |
| `-to` | Stop time |
| `-t` | Duration |
| `-c copy` | Copy streams without re-encoding (fast, but no filters) |
| `-vf` | Video filtergraph |
| `-af` | Audio filtergraph |
| `-preset` | Encoding speed: `ultrafast`, `fast`, `medium`, `slow` |
| `-crf` | Quality: 18 (near-lossless) to 28 (small file). Default 23 |

## Troubleshooting

- **"Filtering and streamcopy cannot be used together"** — you're using `-c copy` with `-vf`/`-af`. Drop `-c copy` to re-encode.
- **Audio out of sync after trim** — use both `-vf` and `-af` with matching select/trim logic.
- **Text not showing** — check font path. On Windows, use `/Windows/Fonts/arial.ttf` or `C\:/Windows/Fonts/arial.ttf`.
- **Slow encoding** — add `-preset ultrafast` for drafts, switch to `-preset medium` for final renders.
- **Concat fails with different codecs** — re-encode all clips to a common format first:
  ```bash
  ffmpeg -i clip.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k normalized_clip.mp4
  ```

## Frame extraction for timestamp discovery

When the user needs help finding the right timestamps, extract frames:
```bash
ffmpeg -i input.mkv -vf "fps=1/2" frame_%04d.jpg   # one frame every 2 seconds
ffmpeg -i input.mkv -vf "fps=1" frame_%04d.jpg      # one frame per second
```

## Reusable script

When the user has a recurring editing pattern (e.g., "trim first 3s, add intro title, add three chapter overlays"), write a reusable shell script in `tools/` that accepts the input path and timestamps as arguments. This way they can re-run it on future recordings without asking again.
