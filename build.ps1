$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$packageDirectory = Join-Path $PSScriptRoot 'packages'
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
$files = @('manifest.json', 'content.js', 'model.js', 'progenv.js', 'progenv-model.js', 'output-diff.js', 'progenv-output-hints.js', 'spec-resize.js', 'TELEPITES.md') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$destination = Join-Path $packageDirectory ('stuki-history-' + $manifest.version + '.zip')
Compress-Archive -LiteralPath $files -DestinationPath $destination -Force
Write-Output $destination
