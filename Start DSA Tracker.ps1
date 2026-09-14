# DSA Tracker -- Desktop App Launcher (PowerShell)
# Launches Express server, waits for health, opens browser in App mode

$ErrorActionPreference = "Stop"
$TrackerRoot = $PSScriptRoot
$ServerDir = Join-Path $TrackerRoot "server"
$LogDir = Join-Path $ServerDir "logs"
$Url = "http://localhost:3000"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " DSA Tracker -- Editorial Paper Pro  (56 chapters)" -ForegroundColor White
Write-Host " Starting at $Url ..." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

# Check Node
try { $nodeVer = node --version } catch { Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red; pause; exit 1 }
Write-Host " Node $nodeVer found" -ForegroundColor Green

# Install deps if missing
if (-not (Test-Path "$ServerDir\node_modules")) {
    Write-Host " Installing dependencies (first run)..." -ForegroundColor Yellow
    Push-Location $ServerDir
    npm install --silent
    Pop-Location
}
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# Start server (minimized) with logging
Push-Location $ServerDir
Write-Host " Starting Express server (server.js)..." -ForegroundColor Yellow
$serverJob = Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Minimized -RedirectStandardOutput "$LogDir\server.log" -RedirectStandardError "$LogDir\server.err.log" -PassThru
Pop-Location

# Wait for health endpoint (up to 30s) instead of a blind sleep
Write-Host " Waiting for server..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $h = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 2
        if ($h.status -eq 'ok') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) {
    Write-Host "[ERROR] Server did not respond in 30s. Logs: $LogDir" -ForegroundColor Red
    try { Stop-Process -Id $serverJob.Id -Force } catch {}
    pause; exit 1
}
Write-Host " Server is up!" -ForegroundColor Green

# Open browser - try Chrome App mode for native feel
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
    Write-Host " Opening Chrome App window..." -ForegroundColor Green
    Start-Process $chrome -ArgumentList "--app=$Url", "--window-size=1280,900"
} else {
    Write-Host " Opening default browser..." -ForegroundColor Green
    Start-Process $Url
}

Write-Host ""
Write-Host " Server running at $Url  (PID $($serverJob.Id), logs: $LogDir)" -ForegroundColor Cyan
Write-Host " Close this window or press Ctrl+C to stop server" -ForegroundColor Gray

# Keep alive until user closes; stop server on exit
try { Wait-Process -Id $serverJob.Id } finally { try { Stop-Process -Id $serverJob.Id -Force -ErrorAction SilentlyContinue } catch {} }
