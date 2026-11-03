param(
    [string]$ArchivePath = (Join-Path (Split-Path -Parent $PSScriptRoot) "Bunker_Assets_180_Complete.zip")
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationRoot = Join-Path $repoRoot "public/assets/cards"
$tempRoot = Join-Path $env:TEMP ("bunker-assets-" + [guid]::NewGuid().ToString("N"))

$categories = @("roles", "skills", "baggage", "vulnerabilities", "crises", "actions")

try {
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
        throw "Archive not found: $ArchivePath. Put Bunker_Assets_180_Complete.zip in the repository root or pass -ArchivePath."
    }

    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $tempRoot -Force

    $sourceRoot = Join-Path $tempRoot "assets/cards"
    if (-not (Test-Path -LiteralPath $sourceRoot)) {
        throw "Expected folder assets/cards was not found inside the archive."
    }

    New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
    $total = 0

    foreach ($category in $categories) {
        $sourceDir = Join-Path $sourceRoot $category
        if (-not (Test-Path -LiteralPath $sourceDir)) {
            throw "Missing category folder in archive: $category"
        }

        $pngs = @(Get-ChildItem -LiteralPath $sourceDir -File -Filter "*.png")
        if ($pngs.Count -ne 30) {
            throw "Category '$category' contains $($pngs.Count) PNG files; expected exactly 30. Nothing was committed."
        }

        $destinationDir = Join-Path $destinationRoot $category
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null

        foreach ($png in $pngs) {
            Copy-Item -LiteralPath $png.FullName -Destination $destinationDir -Force
        }

        $total += $pngs.Count
        Write-Host ("OK: {0} — {1} PNG" -f $category, $pngs.Count)
    }

    if ($total -ne 180) {
        throw "Total image count is $total; expected 180."
    }

    foreach ($manifestName in @("manifest.json", "manifest.csv")) {
        $sourceManifest = Join-Path $tempRoot $manifestName
        if (-not (Test-Path -LiteralPath $sourceManifest)) {
            throw "Missing $manifestName in the archive."
        }
        Copy-Item -LiteralPath $sourceManifest -Destination $destinationRoot -Force
    }

    $metadataRoot = Join-Path $repoRoot "assets"
    New-Item -ItemType Directory -Path $metadataRoot -Force | Out-Null
    foreach ($metadataName in @("README_ASSETS.txt", "QA_REPORT.json")) {
        $sourceMetadata = Join-Path $tempRoot $metadataName
        if (Test-Path -LiteralPath $sourceMetadata) {
            Copy-Item -LiteralPath $sourceMetadata -Destination $metadataRoot -Force
        }
    }

    Write-Host ""
    Write-Host "Import complete: $total PNG files across 6 categories."
    Write-Host "Destination: $destinationRoot"
    Write-Host "Next: open GitHub Desktop, review changes, commit, and Push origin."
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
