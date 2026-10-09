# Baffled Cat site: notes for Claude

See `README.md` for layout and deployment, `INFRASTRUCTURE.md` for hosting.

- **JS/CSS cache-busting policy:** every local `<script src>` and stylesheet `<link href>` in HTML must end in `?v=__VERSION__` (e.g. `/consent.js?v=__VERSION__`, `styles.css?v=__VERSION__`). `Export-Website.ps1` stamps the number from `VERSION` and fails the export if one is missing. Apply this to any new script, stylesheet or reference.
- `/portfolio/` is private: never edit, link, tag or list it.
- Don't run `Export-Website.ps1` without `-SkipUpload` unless the user asks: it publishes to the live S3 bucket and bumps `VERSION`.
