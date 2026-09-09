# Compile the supplied vector artwork without redrawing or merging any paths.
# Windows-only authoring helper (WPF supplies exact SVG path bounds).
# Run from the repository root: powershell -File scripts/prepare-skyline.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore
$repository = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repository 'design-reference/skyline-full.svg'
$outputPath = Join-Path $repository 'features/welcome/skyline/skyline-paths.json'
[xml]$source = Get-Content -LiteralPath $sourcePath -Raw
$elements = @($source.DocumentElement.ChildNodes | Where-Object { $_.NodeType -eq 'Element' })
if ($source.DocumentElement.GetAttribute('viewBox') -ne '0 0 2965 2221' -or $elements.Count -ne 197) {
    throw 'Source structure changed. Audit building/reflection mappings before regenerating.'
}
$parts = for ($index = 0; $index -lt $elements.Count; $index++) {
    $element = $elements[$index]
    $grouped = $element.LocalName -eq 'g'
    $shape = if ($grouped) { $element.FirstChild } else { $element }
    if ($shape.LocalName -ne 'path' -or ($grouped -and $element.ChildNodes.Count -ne 1)) {
        throw "Unexpected structure at source element $index"
    }
    $bounds = [System.Windows.Media.Geometry]::Parse($shape.GetAttribute('d')).Bounds
    [ordered]@{
        sourceIndex = $index
        d = $shape.GetAttribute('d')
        fill = $shape.GetAttribute('fill')
        grouped = $grouped
        opacity = if ($grouped) { [double]::Parse($element.GetAttribute('opacity'), [cultureinfo]::InvariantCulture) } else { 1 }
        hardLight = $element.GetAttribute('style') -eq 'mix-blend-mode:hard-light'
        bounds = @($bounds.X, $bounds.Y, $bounds.Width, $bounds.Height)
    }
}
$json = ConvertTo-Json -InputObject @($parts) -Depth 5
[System.IO.File]::WriteAllText($outputPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $($parts.Count) individually preserved vector parts."
