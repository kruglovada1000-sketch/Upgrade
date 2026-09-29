$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$engine = Join-Path $PSScriptRoot 'engine'
$repo = 'https://github.com/freqtrade/freqtrade.git'

Write-Host '[JARVIS] Native Windows Freqtrade installer' -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git not found. Install Git for Windows first.'
}

if (-not (Test-Path (Join-Path $engine '.git'))) {
  Write-Host '[JARVIS] Cloning official Freqtrade stable branch...'
  git clone --branch stable --depth 1 $repo $engine
}
else {
  Write-Host '[JARVIS] Freqtrade engine already exists. Updating stable branch...'
  git -C $engine fetch origin stable --depth 1
  git -C $engine checkout stable
  git -C $engine pull --ff-only origin stable
}

Write-Host '[JARVIS] Starting official Freqtrade Windows setup.' -ForegroundColor Yellow
Write-Host '[JARVIS] When asked which requirements to install, press ENTER for the default A (requirements.txt only).' -ForegroundColor Yellow
Write-Host '[JARVIS] This may take several minutes.' -ForegroundColor Yellow

Push-Location $engine
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
  if ($LASTEXITCODE -ne 0) { throw "Freqtrade setup failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

$ft = Join-Path $engine '.venv\Scripts\freqtrade.exe'
if (-not (Test-Path $ft)) {
  throw "Freqtrade executable was not created: $ft"
}

Write-Host '[JARVIS] Native Freqtrade installation complete.' -ForegroundColor Green
& $ft --version
