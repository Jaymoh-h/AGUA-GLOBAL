param(
  [switch]$Production,
  [switch]$Deploy,
  [switch]$SkipSmoke,
  [switch]$SkipAudit,
  [switch]$SkipBuild,
  [string]$ApiUrl = $env:AGUA_API_URL,
  [string]$ClientUrl = $env:AGUA_CLIENT_URL
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $Root "server"
$ClientDir = Join-Path $Root "client"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command,
    [string]$WorkingDirectory = $Root
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  Push-Location $WorkingDirectory
  try {
    & $Command
  } finally {
    Pop-Location
  }
}

function Invoke-JsonEndpoint {
  param(
    [string]$Name,
    [string]$Url
  )

  if (-not $Url) {
    Write-Host "Skipping $Name check: URL not provided." -ForegroundColor Yellow
    return
  }

  Invoke-Step $Name {
    $response = Invoke-WebRequest -UseBasicParsing $Url
    if ($response.StatusCode -lt 200 -or $response.StatusCode -gt 299) {
      throw "$Url returned HTTP $($response.StatusCode)"
    }
    Write-Host $response.Content
  }
}

Invoke-Step "Git status" {
  git status --short
}

if (-not $SkipAudit) {
  Invoke-Step "Server dependency audit" {
    npm.cmd audit --omit=dev
  } $ServerDir

  Invoke-Step "Client dependency audit" {
    npm.cmd audit --omit=dev
  } $ClientDir
}

Invoke-Step "Server syntax checks" {
  node --check src/server.js
  node --check src/app.js
  node --check src/middleware/auth.js
  node --check src/middleware/rateLimit.js
  node --check src/controllers/auth.controller.js
} $ServerDir

if (-not $SkipBuild) {
  Invoke-Step "Client production build" {
    npm.cmd run build
  } $ClientDir
}

if ($Production) {
  Invoke-Step "Production migration status" {
    npm.cmd run db:migrate:status
  } $ServerDir
} else {
  Write-Host ""
  Write-Host "Skipping production migration status. Pass -Production after loading production DATABASE_URL." -ForegroundColor Yellow
}

if (-not $SkipSmoke) {
  if ($env:TEST_DATABASE_URL) {
    Invoke-Step "Smoke tests" {
      npm.cmd run test:smoke
    } $ServerDir
  } else {
    Write-Host ""
    Write-Host "Skipping smoke tests: TEST_DATABASE_URL is not set." -ForegroundColor Yellow
  }
}

if ($Deploy) {
  Invoke-Step "Vercel deploy" {
    vercel --prod
  } $Root
} else {
  Write-Host ""
  Write-Host "Dry run only. Pass -Deploy to run vercel --prod after checks pass." -ForegroundColor Yellow
}

if ($ApiUrl) {
  $baseApiUrl = $ApiUrl.TrimEnd("/")
  Invoke-JsonEndpoint "API health" "$baseApiUrl/health"
  Invoke-JsonEndpoint "API status" "$baseApiUrl/status"
} else {
  Write-Host ""
  Write-Host "Skipping API health/status checks. Set AGUA_API_URL, for example https://api.example.com/api." -ForegroundColor Yellow
}

if ($ClientUrl) {
  Invoke-Step "Client availability" {
    $response = Invoke-WebRequest -UseBasicParsing $ClientUrl
    if ($response.StatusCode -lt 200 -or $response.StatusCode -gt 299) {
      throw "$ClientUrl returned HTTP $($response.StatusCode)"
    }
    Write-Host "Client returned HTTP $($response.StatusCode)."
  }
} else {
  Write-Host ""
  Write-Host "Skipping client availability check. Set AGUA_CLIENT_URL to verify it." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Release check completed." -ForegroundColor Green

