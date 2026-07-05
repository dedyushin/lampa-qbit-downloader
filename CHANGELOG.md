# Changelog

## v0.2.0 - 2026-07-05

TV-tested stable release for the current Lampa/qBittorrent workflow.

- Added the `Скачанное` source inside a normal Lampa card, so a downloaded file can be opened from the same movie/series card instead of going through a separate library first.
- Preserved safe Lampa card metadata when sending torrents through `lampa-qbit-download.js` and bridge `/add`.
- Stored durable downloaded-item metadata in `.lampa-metadata.json` on the bridge side.
- Updated the downloaded-content plugin to prefer saved TMDB/Lampa metadata, then fall back to filename matching.
- Improved downloaded series UI with episode rows, watched markers, season/episode labels, and `SxxEyy` badges.
- Made movie entries behave as a single playable downloaded item.
- Added a targeted runtime metadata override path for broken titles such as `Черное солнце` without changing the global matching algorithm.

Stable tags:

- `v0.2.0`
- `lampa-qbit-download-v0.2.0`
- `lampa-qbit-media-v0.2.0`

## v0.1.0 - 2026-07-04

Stable rollback baseline before the metadata and downloaded-card improvements.

- Keeps the previously working qBittorrent downloader/media setup.
- Keeps GETS TV online separate from the local qBittorrent plugin server.
- Useful recovery point if the current metadata/downloaded-card flow ever needs to be rolled back.

Stable tags:

- `v0.1.0`
- `lampa-qbit-download-v0.1.0`
- `lampa-qbit-media-v0.1.0`

## GETS TV online v0.1.0 - 2026-06-10

GETS TV online remains on its already installed pinned plugin version.

Stable tag:

- `lampa-getstv-online-v0.1.0`
