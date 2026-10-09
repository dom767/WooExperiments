<#
Exports the current baffledcat.com site files into a new numbered folder under Export\.
Every image referenced by an HTML file is copied alongside the HTML (flattened out of
its source subfolder), and the HTML's src/href attributes are rewritten to match, so the
exported folder has no image references into subfolders.

JPEGs are re-encoded at quality 70 (~7/10) during copy to keep the published site smaller.

Once the export folder is built, its contents are uploaded to the root of the
baffledcat.com S3 bucket. If no working AWS credentials are present, 'aws login' is run
first. Pass -SkipUpload to export locally without publishing.
#>

param(
    [switch] $SkipUpload
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$jpegQuality = 70L
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }

function Copy-ExportedImage {
    param(
        [Parameter(Mandatory)] [string] $SourcePath,
        [Parameter(Mandatory)] [string] $DestPath
    )

    $ext = [System.IO.Path]::GetExtension($SourcePath).ToLowerInvariant()
    if ($ext -notin @('.jpg', '.jpeg') -or -not $jpegCodec) {
        Copy-Item -Path $SourcePath -Destination $DestPath -Force
        return
    }

    $image = $null
    $encoderParams = $null
    try {
        $image = [System.Drawing.Image]::FromFile($SourcePath)
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
            [System.Drawing.Imaging.Encoder]::Quality,
            $jpegQuality
        )
        $image.Save($DestPath, $jpegCodec, $encoderParams)
    }
    catch {
        Write-Warning "JPEG recompress failed for $SourcePath, copied original: $($_.Exception.Message)"
        Copy-Item -Path $SourcePath -Destination $DestPath -Force
    }
    finally {
        if ($image) { $image.Dispose() }
        if ($encoderParams) { $encoderParams.Dispose() }
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exportRoot = Join-Path $root 'Export'

if (-not (Test-Path $exportRoot)) {
    New-Item -ItemType Directory -Path $exportRoot | Out-Null
}

$existing = Get-ChildItem -Path $exportRoot -Directory |
    Where-Object { $_.Name -match '^\d+$' } |
    ForEach-Object { [int]$_.Name }

$nextVersion = if ($existing) { ($existing | Measure-Object -Maximum).Maximum + 1 } else { 1 }

# Site version (VERSION file). Every local script reference in the HTML carries ?v=__VERSION__, which is
# stamped with this number so a new version forces browsers/CDN to fetch fresh JavaScript.
# A real upload bumps it; -SkipUpload reuses the current number. Commit VERSION after an upload.
$versionFile = Join-Path $root 'VERSION'
$siteVersion = 0
if (Test-Path $versionFile) { [void][int]::TryParse((Get-Content $versionFile -Raw).Trim(), [ref]$siteVersion) }
if (-not $SkipUpload) {
    $siteVersion++
    Set-Content -Path $versionFile -Value $siteVersion
}
Write-Host "Site version: $siteVersion"

$versionDir = Join-Path $exportRoot $nextVersion
New-Item -ItemType Directory -Path $versionDir | Out-Null

Write-Host "Exporting site to Export\$nextVersion ..."

# Core site files: every root-level HTML file, plus styles.css, favicon.ico, and the shared background script
$coreFiles = @('styles.css', 'favicon.ico', 'bg-lattice.js', 'robots.txt', 'sitemap.xml', 'consent.js',
    'site.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png')
$coreFiles += Get-ChildItem -Path $root -Filter '*.html' -File | Select-Object -ExpandProperty Name

foreach ($name in $coreFiles) {
    $src = Join-Path $root $name
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $versionDir $name) -Force
    } else {
        Write-Warning "Core file not found, skipped: $name"
    }
}

# Share images referenced only from <meta content=...> tags (og/), copied as-is into og/.
# Optimised site images (img/) are copied as-is; HTML references them as img/<name> (including srcset).
foreach ($dir in @('og', 'img')) {
    $dirSource = Join-Path $root $dir
    if (Test-Path $dirSource) {
        Copy-Item -Path $dirSource -Destination (Join-Path $versionDir $dir) -Recurse -Force
    }
}

# Walk every exported HTML file, find image references (src="..." or href="...")
# and flatten any that point into a subfolder so the image sits next to the HTML.
$imageExtPattern = '\.(?:jpg|jpeg|png|gif|webp|svg|ico)$'
$htmlExports = Get-ChildItem -Path $versionDir -Filter '*.html' -File

foreach ($file in $htmlExports) {
    $content = Get-Content -Path $file.FullName -Raw

    $refs = [regex]::Matches($content, '(?:src|href)="([^"]+)"') |
        ForEach-Object { $_.Groups[1].Value } |
        Where-Object { $_ -match $imageExtPattern -and $_ -notmatch '^(?:https?:)?//' -and $_ -notmatch '^/?img/' } |
        Select-Object -Unique

    foreach ($ref in $refs) {
        $flatName = Split-Path $ref -Leaf
        $sourcePath = Join-Path $root ($ref -replace '/', '\')

        if (Test-Path $sourcePath) {
            Copy-ExportedImage -SourcePath $sourcePath -DestPath (Join-Path $versionDir $flatName)
        } else {
            Write-Warning "Referenced image not found: $ref (in $($file.Name))"
        }

        if ($ref -ne $flatName) {
            $content = $content.Replace($ref, $flatName)
        }
    }

    # Policy: every local <script src> must be versioned (see README.md, Cache busting).
    $unversioned = [regex]::Matches($content, '<script[^>]*\ssrc="([^"]+)"') |
        ForEach-Object { $_.Groups[1].Value } |
        Where-Object { $_ -notmatch '^(?:https?:)?//' -and $_ -notmatch '\?v=__VERSION__$' }
    if ($unversioned) {
        throw "$($file.Name): script(s) missing '?v=__VERSION__': $($unversioned -join ', ')"
    }
    $content = $content.Replace('__VERSION__', "$siteVersion")

    Set-Content -Path $file.FullName -Value $content -NoNewline
}

$assetCount = (Get-ChildItem -Path $versionDir -File | Where-Object { $_.Extension -ne '.html' }).Count
Write-Host "Done. Exported $($htmlExports.Count) HTML file(s) and $assetCount asset(s) to:"
Write-Host "  $versionDir"

if ($SkipUpload) {
    Write-Host ''
    Write-Host 'Skipping upload (-SkipUpload).'
    return
}

$bucket = 'baffledcat.com'
$region = 'eu-west-2'

function Invoke-Aws {
    param(
        [Parameter(Mandatory)] [string[]] $Arguments,
        [switch] $Interactive
    )

    # Native tools write progress/warnings to stderr, which would otherwise trip
    # $ErrorActionPreference = 'Stop'. Exit codes are checked by the caller instead.
    $ErrorActionPreference = 'Continue'

    if ($Interactive) {
        & aws @Arguments
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = '' }
    }

    $output = & aws @Arguments 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output | Out-String).Trim() }
}

function Test-AwsCredential {
    (Invoke-Aws -Arguments @('sts', 'get-caller-identity', '--output', 'json')).ExitCode -eq 0
}

Write-Host ''

if (-not (Get-Command 'aws' -ErrorAction SilentlyContinue)) {
    Write-Warning 'AWS CLI not found on PATH. Export completed, but nothing was uploaded.'
    Write-Host 'Install it from https://aws.amazon.com/cli/ and re-run to publish.'
    return
}

if (-not (Test-AwsCredential)) {
    Write-Host 'No usable AWS credentials found. Starting sign-in ...'
    Invoke-Aws -Arguments @('login') -Interactive | Out-Null

    if (-not (Test-AwsCredential)) {
        Write-Warning 'AWS sign-in did not complete. Export completed, but nothing was uploaded.'
        Write-Host "Sign in with 'aws login', then re-run this script to publish."
        return
    }
}

$identity = (Invoke-Aws -Arguments @('sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text')).Output
Write-Host "Uploading to s3://$bucket/ as $identity ..."

# --delete is deliberately omitted: the app builds (bifurcation/, vulcan/, highpersonic3/,
# exoplanetviewer/, portfolio/) live under the same bucket root and are deployed separately.
$syncBase = @('s3', 'sync', $versionDir, "s3://$bucket/", '--region', $region, '--no-progress')

# Images/fonts long-lived; CSS/JS 7 days (file names are not versioned yet, so no immutable);
# HTML, robots.txt and sitemap.xml short so edits show up quickly.
$assetSync = $syncBase + @(
    '--cache-control', 'public, max-age=31536000, immutable',
    '--exclude', '*.html', '--exclude', '*.css', '--exclude', '*.js',
    '--exclude', 'robots.txt', '--exclude', 'sitemap.xml', '--exclude', 'site.webmanifest'
)
$codeSync = $syncBase + @(
    '--cache-control', 'public, max-age=604800',
    '--exclude', '*', '--include', '*.css', '--include', '*.js'
)
$markupSync = $syncBase + @(
    '--cache-control', 'public, max-age=300, must-revalidate',
    '--exclude', '*', '--include', '*.html', '--include', 'robots.txt', '--include', 'sitemap.xml'
)

foreach ($syncArgs in @($assetSync, $codeSync, $markupSync)) {
    $result = Invoke-Aws -Arguments $syncArgs
    if ($result.Output) { Write-Host $result.Output }
    if ($result.ExitCode -ne 0) {
        throw "Upload failed (aws exited with code $($result.ExitCode))."
    }
}

# Web manifest: set the content type explicitly (sync may not guess it) and keep the cache short.
$manifestResult = Invoke-Aws -Arguments @('s3', 'cp', (Join-Path $versionDir 'site.webmanifest'), "s3://$bucket/site.webmanifest", '--region', $region, '--no-progress',
    '--content-type', 'application/manifest+json', '--cache-control', 'public, max-age=300, must-revalidate')
if ($manifestResult.ExitCode -ne 0) { throw "Manifest upload failed: $($manifestResult.Output)" }

Write-Host ''
Write-Host "Published Export\$nextVersion to https://baffledcat.com/"
Write-Host 'HTML cached 5 min, CSS/JS 7 days, images 1 year. Purge Cloudflare if you need it live immediately.'
