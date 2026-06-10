# Build a store-ready zip into dist/ (local equivalent of the CI package step).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

node scripts/check.mjs
if ($LASTEXITCODE -ne 0) { exit 1 }

$manifest = Get-Content extension/manifest.json -Raw | ConvertFrom-Json
$out = "dist/whatsit-v$($manifest.version).zip"
New-Item -ItemType Directory -Force dist | Out-Null
if (Test-Path $out) { Remove-Item $out }
Compress-Archive -Path extension\* -DestinationPath $out
Write-Output "Packed $out"
