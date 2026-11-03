param(
    [string]$ArchivePath = (Join-Path (Split-Path -Parent $PSScriptRoot) "Bunker_Assets_180_Complete.zip")
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationRoot = Join-Path $repoRoot "public/assets/cards"
$csvPath = Join-Path $destinationRoot "manifest.csv"
$jsonPath = Join-Path $destinationRoot "manifest.json"
$tempRoot = Join-Path $env:TEMP ("bunker-assets-" + [guid]::NewGuid().ToString("N"))

# ZIP folder names mapped to website folder names.
$folderMap = [ordered]@{
    "01_Roles" = "roles"
    "02_Skills" = "skills"
    "03_Baggage" = "baggage"
    "04_Vulnerabilities" = "vulnerabilities"
    "05_Crises" = "crises"
    "06_Actions" = "actions"
}

try {
    if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
        throw "Archive not found: $ArchivePath"
    }
    if (-not (Test-Path -LiteralPath $csvPath -PathType Leaf)) {
        throw "Repository manifest.csv not found: $csvPath"
    }

    # Read the complete CSV. The JSON manifest in the repository was truncated.
    $manifestRows = @(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
    if ($manifestRows.Count -ne 180) {
        throw "manifest.csv contains $($manifestRows.Count) data rows; expected 180."
    }

    $requiredColumns = @(
        "card_id", "category", "category_name_ru", "card_number",
        "original_title", "source_description", "source_illustration_idea",
        "exported_title", "file_name", "relative_path", "format",
        "width", "height", "sha256", "original_title_matches_exported_title", "filename_note"
    )
    $actualColumns = @($manifestRows[0].PSObject.Properties.Name)
    foreach ($column in $requiredColumns) {
        if ($actualColumns -notcontains $column) {
            throw "manifest.csv is missing required column: $column"
        }
    }

    # Confirm the CSV has exactly 30 cards for every category.
    foreach ($targetCategory in $folderMap.Values) {
        $categoryRows = @($manifestRows | Where-Object { $_.category -eq $targetCategory })
        if ($categoryRows.Count -ne 30) {
            throw "CSV category '$targetCategory' contains $($categoryRows.Count) rows; expected 30."
        }
    }

    # Build category labels from the CSV itself, avoiding non-ASCII text in this script.
    $categoryManifest = [ordered]@{}
    foreach ($targetCategory in $folderMap.Values) {
        $categoryRows = @($manifestRows | Where-Object { $_.category -eq $targetCategory })
        $categoryManifest[$targetCategory] = [PSCustomObject][ordered]@{
            name_ru = [string]$categoryRows[0].category_name_ru
            count = 30
        }
    }

    # Rebuild the complete JSON asset list from manifest.csv.
    $assets = @(
        foreach ($row in $manifestRows) {
            $matchesTitle = ([string]$row.original_title_matches_exported_title).Trim().ToLowerInvariant() -eq "true"
            $note = if ([string]::IsNullOrWhiteSpace([string]$row.filename_note)) { $null } else { [string]$row.filename_note }

            [PSCustomObject][ordered]@{
                card_id = [string]$row.card_id
                category = [string]$row.category
                category_name_ru = [string]$row.category_name_ru
                card_number = [int]$row.card_number
                original_title = [string]$row.original_title
                source_description = [string]$row.source_description
                source_illustration_idea = [string]$row.source_illustration_idea
                exported_title = [string]$row.exported_title
                file_name = [string]$row.file_name
                relative_path = [string]$row.relative_path
                format = [string]$row.format
                width = [int]$row.width
                height = [int]$row.height
                sha256 = [string]$row.sha256
                original_title_matches_exported_title = $matchesTitle
                filename_note = $note
            }
        }
    )

    # Preserve the Russian project name using Base64 so this script stays ASCII-only.
    $projectName = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String("0JHRg9C90LrQtdGAIOKAlCDQnNCU0JouMDQuMDE=")
    )

    $manifestObject = [PSCustomObject][ordered]@{
        project = $projectName
        manifest_version = "1.0"
        source = "Bunker_MDK0401_Materials.xlsx, cross-checked with Bunker_Source_Export_For_Audit.txt"
        total_assets = 180
        categories = [PSCustomObject]$categoryManifest
        assets = $assets
    }

    $manifestJson = ConvertTo-Json -InputObject $manifestObject -Depth 10
    $jsonCheck = $manifestJson | ConvertFrom-Json
    if (@($jsonCheck.assets).Count -ne 180) {
        throw "Generated JSON manifest failed its 180-card validation."
    }

    # Validate all ZIP folders and exact filenames before copying any images.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
    $zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedArchive)
    try {
        foreach ($sourceFolder in $folderMap.Keys) {
            $targetCategory = $folderMap[$sourceFolder]
            $prefix = $sourceFolder + "/"
            $entries = @(
                $zip.Entries | Where-Object {
                    $_.FullName.StartsWith($prefix, [System.StringComparison]::Ordinal) -and
                    $_.FullName.EndsWith(".png", [System.StringComparison]::OrdinalIgnoreCase) -and
                    $_.FullName.Substring($prefix.Length).IndexOf("/") -lt 0
                }
            )

            if ($entries.Count -ne 30) {
                throw "ZIP folder '$sourceFolder' contains $($entries.Count) PNG files; expected 30."
            }

            $actualNames = @($entries | ForEach-Object { $_.FullName.Substring($prefix.Length) } | Sort-Object)
            $expectedNames = @(
                $manifestRows |
                    Where-Object { $_.category -eq $targetCategory } |
                    ForEach-Object { [string]$_.file_name } |
                    Sort-Object
            )

            $differences = @(Compare-Object -ReferenceObject $expectedNames -DifferenceObject $actualNames)
            if ($differences.Count -gt 0) {
                $details = ($differences | ForEach-Object { $_.SideIndicator + " " + $_.InputObject }) -join "; "
                throw "ZIP filenames in '$sourceFolder' do not match the CSV manifest: $details"
            }

            Write-Host ("Validated {0}: {1} PNG" -f $sourceFolder, $entries.Count)
        }

        $allPngEntries = @($zip.Entries | Where-Object {
            $_.FullName.EndsWith(".png", [System.StringComparison]::OrdinalIgnoreCase)
        })
        if ($allPngEntries.Count -ne 180) {
            throw "ZIP contains $($allPngEntries.Count) PNG files in total; expected 180."
        }
    }
    finally {
        $zip.Dispose()
    }

    # All checks passed. Extract to a temporary directory and copy PNG files.
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    Expand-Archive -LiteralPath $resolvedArchive -DestinationPath $tempRoot -Force

    foreach ($sourceFolder in $folderMap.Keys) {
        $targetCategory = $folderMap[$sourceFolder]
        $sourceDir = Join-Path $tempRoot $sourceFolder
        $destinationDir = Join-Path $destinationRoot $targetCategory

        if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
            throw "Extracted ZIP folder not found: $sourceFolder"
        }

        $pngs = @(Get-ChildItem -LiteralPath $sourceDir -File -Filter "*.png")
        if ($pngs.Count -ne 30) {
            throw "Extracted folder '$sourceFolder' contains $($pngs.Count) PNG files; expected 30."
        }

        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
        foreach ($png in $pngs) {
            Copy-Item -LiteralPath $png.FullName -Destination $destinationDir -Force
        }

        Write-Host ("Imported {0}: {1} PNG" -f $targetCategory, $pngs.Count)
    }

    # Write a valid UTF-8 JSON manifest and read it back for final validation.
    [System.IO.File]::WriteAllText($jsonPath, $manifestJson, [System.Text.Encoding]::UTF8)
    $savedJson = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
    $finalManifest = $savedJson | ConvertFrom-Json
    if (@($finalManifest.assets).Count -ne 180) {
        throw "Saved manifest.json did not pass the final 180-card check."
    }

    Write-Host ""
    Write-Host "Import complete: 180 PNG files across 6 categories."
    Write-Host "manifest.json was rebuilt from the complete manifest.csv."
    Write-Host ("Destination: {0}" -f $destinationRoot)
    Write-Host "Next: review the changes in GitHub Desktop, commit, and Push origin."
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
