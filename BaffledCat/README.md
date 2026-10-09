# Baffled Cat website (baffledcat.com)

Static HTML site hosted on S3 behind Cloudflare. See `INFRASTRUCTURE.md` for hosting/DNS, `STYLE_GUIDE.md` for design.

## Layout
- Root `*.html`: home, about, privacy and the five project pages.
- `styles.css`, `bg-lattice.js`, `consent.js`: shared CSS/JS.
- `img/`: optimised, responsive image variants (generated; referenced from the HTML). `og/`: 1200×630 share images.
- Source images (`BifurcationDiagrams/`, `Vulcan images/`, ...) are originals and are not deployed directly.
- `robots.txt`, `sitemap.xml`, `site.webmanifest`, icons.
- The web apps (`/highpersonic3/`, `/vulcan/`, `/exoplanetviewer/`, `/bifurcation/`) and `/portfolio/` live in the same bucket but are deployed separately. `/portfolio/` is private: never link to, reference or tag it.

## Deploying
Double-click `ExportWebsite.cmd` (or run `Export-Website.ps1`; add `-SkipUpload` for a local-only export into `Export\<n>`). It builds the site, stamps the site version, and syncs to `s3://baffledcat.com`. Afterwards:
1. Commit the bumped `VERSION` file.
2. Purge the Cloudflare cache if the change must be live immediately.

## Policy: cache busting for JavaScript and CSS
**Every JavaScript and CSS file referenced from an HTML file must carry a query string containing the site version number.** When the version increases, every `.js` and `.css` URL changes, which forces browsers and Cloudflare to fetch fresh copies and avoids stale JavaScript or CSS being served.

- The site version is the integer in the `VERSION` file.
- In source HTML, write the placeholder, e.g. `<script src="/consent.js?v=__VERSION__"></script>` or `<script src="bg-lattice.js?v=__VERSION__"></script>`, `<link rel="stylesheet" href="styles.css?v=__VERSION__">`. (It is a harmless query string when viewing the source locally.)
- `Export-Website.ps1` bumps `VERSION` on every real upload (not with `-SkipUpload`) and replaces `__VERSION__` in the exported HTML with the number.
- The export **fails** if any local `<script src>` or stylesheet `<link href>` lacks `?v=__VERSION__`, so a new script or stylesheet can't be added without it.
- Third-party scripts and stylesheets (e.g. Google Tag Manager, Google Fonts) are exempt.
- JS/CSS loaded some other way (dynamic `import()`, `fetch`, workers, CSS `@import`) must also be versioned; pass the version in explicitly.
- The web apps (`highpersonic3`, `vulcan`, `exoplanetviewer`, `bifurcation`) are in other repos and should follow the same policy for the JS and CSS their HTML references when they are next changed.

## Other conventions
- Cache headers are set by the export script: HTML 5 min, CSS/JS 7 days, images 1 year (`immutable`).
- New pages need: canonical URL, Open Graph/Twitter tags, `/consent.js?v=__VERSION__` first in `<head>`, a `sitemap.xml` entry, and the footer "Cookie settings" link.
- Images: add `width`/`height`, use `<picture>` with the variants in `img/`, `loading="lazy"` except the hero/LCP image.
