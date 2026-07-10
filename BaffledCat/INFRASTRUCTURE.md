# Baffled Cat Website Infrastructure

This document describes the current hosting and DNS/email infrastructure for `baffledcat.com`.

## Overview

- Static website content is hosted on an AWS S3 website endpoint in `eu-west-2`.
- API traffic is routed to AWS API Gateway custom domains (`api` and `dev` subdomains).
- DNS is managed in Cloudflare.
- Email routing for the domain is handled by Cloudflare Email Routing (MX + SPF + DKIM records).

## Hosting and Application Endpoints

- `baffledcat.com` -> CNAME -> `s3-website.eu-west-2.amazonaws.com` (proxied in Cloudflare)
- `www.baffledcat.com` -> CNAME -> `baffledcat.com` (proxied in Cloudflare)
- `api.baffledcat.com` -> CNAME -> `d-xw3943fx0e.execute-api.eu-west-2.amazonaws.com` (DNS only)
- `dev.baffledcat.com` -> CNAME -> `d-m0b6gf7qr0.execute-api.eu-west-2.amazonaws.com` (DNS only)

## TLS / ACM Validation Records

- `_b41d6e65beb32490cafd5ea0a5bda122.api.baffledcat.com` -> CNAME -> `_cbf8dd94947ae1d052711d245a57a6bc.jkddzztszm.acm-validations.aws`
- `_e1e5f8ec8a1f429e89b9383b67444042.dev.baffledcat.com` -> CNAME -> `_234af34c701e56d37a17c53785bd30a0.jkddzztszm.acm-validations.aws`

These are ACM DNS validation records used for certificates on the API custom domains.

## Email Routing Records

### MX

- `baffledcat.com` -> MX `route1.mx.cloudflare.net` (priority 14)
- `baffledcat.com` -> MX `route2.mx.cloudflare.net` (priority 46)
- `baffledcat.com` -> MX `route3.mx.cloudflare.net` (priority 47)

### SPF

- `baffledcat.com` -> TXT `"v=spf1 include:_spf.mx.cloudflare.net ~all"`

### DKIM

- `cf2024-1._domainkey.baffledcat.com` -> TXT `v=DKIM1` public key (Cloudflare-managed)

## DNS Record Count

Current configured records documented here: **11**.

## Notes

- This setup uses **Cloudflare** for DNS and email routing.
- AWS provides content hosting (S3) and API execution (API Gateway/Lambda).
- **Cloudflare** (orange-cloud proxy on `baffledcat.com`) is the CDN/cache layer in front of S3. There is no CloudFront distribution on the main site.

## Caching (Highpersonic 3)

Highpersonic 3 is served from `https://baffledcat.com/highpersonic3/` (S3 prefix `highpersonic3/`). Caching is controlled at two layers:

1. **S3 object metadata** — `Cache-Control` headers set at upload time (origin).
2. **Cloudflare** — edge cache; by default respects origin `Cache-Control`, or can be overridden with Cache Rules.

### Target policy

| Files | TTL | Example |
|-------|-----|---------|
| `highpersonic3/index.html` | **60 seconds** | HTML shell that loads the bundle |
| `highpersonic3/*.js` | **60 seconds** | `app.bundle.min.js` (production export bundles all scripts into one file) |
| Everything else under `highpersonic3/` | **Long** (e.g. 1 year) | Textures, images, JSON assets |

Short TTL on HTML/JS lets you deploy updates within a minute without users hard-refreshing. Long TTL on static assets improves performance.

### 1. Set headers on deploy (S3)

Use the deploy script in the Highpersonic3 repo after exporting:

```powershell
cd Highpersonic3
.\Export-Static.ps1
$env:S3_BUCKET = "your-baffledcat-bucket-name"
.\deploy-s3.ps1 -ExportDir "Export\Version11"   # use the version you just exported
```

Or manually:

```bash
BUCKET=s3://your-bucket
PREFIX=highpersonic3
EXPORT=Export/Version11

# Long cache: assets (exclude html and js)
aws s3 sync "$EXPORT" "$BUCKET/$PREFIX/" --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" --exclude "*.js"

# Short cache: HTML and JS
aws s3 cp "$EXPORT/index.html" "$BUCKET/$PREFIX/index.html" \
  --cache-control "public, max-age=60"
aws s3 sync "$EXPORT" "$BUCKET/$PREFIX/" \
  --exclude "*" --include "*.js" \
  --cache-control "public, max-age=60"
```

### 2. Cloudflare Cache Rules (optional but recommended)

In **Cloudflare → baffledcat.com → Rules → Cache Rules**, create rules **in order** (most specific first):

**Rule A — Highpersonic HTML/JS (60s)**

- **When:** URI Path starts with `/highpersonic3/` AND (URI Path ends with `.js` OR URI Path ends with `index.html`)
- **Then:** Edge TTL = 60 seconds, Browser TTL = 60 seconds (or “Respect origin” if S3 headers are set as above)

**Rule B — Highpersonic assets (long)**

- **When:** URI Path starts with `/highpersonic3/`
- **Then:** Edge TTL = 1 month (or Respect origin for `max-age=31536000`)

**Rule C — Site default (optional)**

- Other static files on the root site can keep a longer default if desired.

After a deploy, you can **Purge Cache** in Cloudflare for `/highpersonic3/index.html` and `/highpersonic3/*.js` for immediate effect; otherwise wait up to 60 seconds.

### Cache flow

```
Browser  →  Cloudflare (edge cache)  →  S3 website endpoint  →  objects + Cache-Control
```

Both layers should agree: set `Cache-Control` on S3 at upload, then use Cloudflare rules as a safety net or override.
