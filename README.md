# MultiTwitchVODWatcher

Watch **multiple Twitch VODs at once, perfectly in sync** — locally on your desktop.
Download the VODs with [yt-dlp](https://github.com/yt-dlp/yt-dlp), load them side by side, and one play/pause/seek drives them all. VODs are auto-aligned by each stream's start time, with manual nudges for per-stream delays. Handy for multi-POV events, races, and co-streams.

![Screenshot](docs/screenshot.png)

## Features

- **1–8+ videos at once**, laid out to fill the window (no scrolling).
- **Automatic alignment** from the stream start time (read from yt-dlp metadata); manual `±` offset nudges for ingest delays.
- **One transport** for everything: Play/Pause, `±10s` skip, and a shared timeline you can scrub. (`Space`, `←`, `→`.)
- **Per-VOD controls** on hover: volume, mute, sync offset, resync.
- **Timeline ruler** (`▾`) showing each VOD's span plus its real start time and offset vs. the master.
- **Built-in downloads** via yt-dlp: paste URLs and go. It fetches the streamer name, and **skips URLs you already downloaded**.
- **Remembers everything**: the VOD list, offsets, resume position, download folder, and language (stored in your user data).
- **Localizable**: add a language by dropping a JSON file into `locales/`.
- **Fullscreen "cinema" mode**: just the videos + play bar.

## Download

Get the latest installer / portable build from the **[Releases page](https://github.com/CodeTappert/MultiTwitchVODWatcher/releases)**.

- **Windows**: run `Twitch VOD Sync Setup <version>.exe` (installer) or `Twitch VOD Sync <version>.exe` (portable — no install).
- Linux/macOS: build from source (below).

## Requirements

To **run** the built app you only need **yt-dlp** (for the `+ From URL` downloads) — and **ffmpeg** if you download high-quality streams (yt-dlp uses it to merge video + audio).

To **build** from source:

- [Node.js](https://nodejs.org) 18+ (tested on 22) and npm
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — e.g. `winget install yt-dlp`, `pipx install yt-dlp`, or drop `yt-dlp.exe` into a `bin/` folder next to the app
- [ffmpeg](https://ffmpeg.org) on your `PATH`

## Build & run from source

```bash
npm install
npm start
```

Package for distribution (output in `dist/`):

```bash
npm run dist         # current OS
npm run dist:win     # Windows: NSIS installer + portable exe
npm run dist:linux   # Linux: AppImage + .deb
npm run dist:mac     # macOS: dmg + zip
```

There's also a `Makefile` (`make win` / `make linux` / `make mac` / `make start`) and, on Windows, `build.bat [win|linux|mac]`.

> **Windows build note:** if the build fails with a `winCodeSign` symlink error, set `CSC_IDENTITY_AUTO_DISCOVERY=false` before building (or enable Windows Developer Mode). Code signing is disabled by default in this project, so builds are unsigned and use the default Electron icon.

## Usage

See the **[Usage guide](docs/USAGE.md)**.

Quick start:

1. **Add videos**: `+ Add VODs` for files you already have, or `+ From URL` to download from Twitch.
2. The **first** video is the **master**; the others are **auto-aligned** using their stream start times.
3. If a stream still looks off, open a tile's **hover controls** and nudge its **Sync** offset (`±0.1` / `±1`).
4. Hit **Play** — every video plays together. Scrub the timeline or use `←`/`→` to jump.

## Localization

The UI is translated via JSON files in [`locales/`](locales). To add a language:

1. Copy `locales/en-GB.json` to `locales/<code>.json` (e.g. `fr-FR.json`).
2. Set `meta.code` and `meta.name` (the language's own name), and translate the values.
3. Reload — it appears in the language picker. PRs welcome!

## License

MIT — see [LICENSE](LICENSE).

## AI usage

This project was written with the help of AI coding assistants. All changes are reviewed and tested by the maintainer.

