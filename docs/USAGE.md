# Usage guide

MultiTwitchVODWatcher plays several Twitch VODs at once and keeps them in sync. This is a quick walkthrough.

## 1. What you need

- The app (from the [Releases page](https://github.com/CodeTappert/MultiTwitchVODWatcher/releases)) or `npm start` from source.
- To use **downloads**, install [yt-dlp](https://github.com/yt-dlp/yt-dlp); for high-quality streams also install [ffmpeg](https://ffmpeg.org) (yt-dlp uses it to merge video+audio). The app shows the detected yt-dlp command in the URL panel.

## 2. Getting the VODs in

You have two ways:

**a) `+ From URL` — let the app download them**
1. Click `+ From URL`.
2. Paste one or more Twitch VOD URLs (one per line — garbled/no-separator pastes are handled).
3. Pick a **Quality** and a download folder, then **Download**.
4. Each finished video is added to the player automatically. URLs you've already downloaded are **skipped**.

**b) `+ Add VODs` — use files you already have**
1. Click `+ Add VODs` and select one or more video files.

## 3. Master + alignment

- The **first** video added is the **master**. Offsets are relative to it.
- The others are **auto-aligned by their stream start time** (read from the URL's metadata), so they line up by real-world time.
- To change the master: open a tile's hover controls → **Make master**.

## 4. Playing

- **Play/Pause**: the button, or `Space`.
- **Jump ±10s**: the `⏪ 10s` / `10s ⏩` buttons, or `←` / `→`.
- **Scrub**: drag the timeline at the bottom.
- **Resync**: `⟲ Resync` re-aligns every stream to the current position.
- **Fullscreen**: the `⛶` button (just videos + play bar). `Esc` or `F` toggles it.

## 5. Per-VOD controls (hover a video)

Hover over any video to reveal:
- **Make master** / **Remove**.
- **Audio**: mute + volume slider.
- **Sync**: the offset (`-1`, `-0.1`, type a value, `+0.1`, `+1`) and **Resync** for that one stream.

If a stream sounds like an echo, mute all but one: the `🔊 All` toggle in the top bar, or per-video volume.

## 6. Timeline ruler

Click the `▾` button next to the timeline to expand a per-VOD ruler. Each bar shows a VOD's span on the shared timeline; the master is highlighted. Hover a bar for its offset, length, and real start time.

## 7. Troubleshooting

- **A tile says "File not found"**: the file was moved/renamed. Click **Locate file…** and point it at the file — the offset and position are preserved.
- **yt-dlp not found**: install it, or drop `yt-dlp.exe` into a `bin/` folder next to the app.
- **Download says it needs ffmpeg**: install ffmpeg and put it on your `PATH`, or pick a lower quality (480p/720p) that downloads as a single file.
- **Not perfectly aligned**: offsets come from stream metadata, which can differ slightly from when a streamer started their in-game timer. Open a tile's hover controls and nudge the **Sync** value.
- **Session**: everything (VODs, offsets, resume position, folder, language) is saved automatically and restored on next launch. Backups are kept in your user-data folder (`session.json.bak` and a `backups/` folder).
