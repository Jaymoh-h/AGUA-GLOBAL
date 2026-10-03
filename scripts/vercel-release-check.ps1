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
    try {
      $payload = $response.Content | ConvertFrom-Json
    } catch {
      throw "$Url did not return valid JSON."
    }

    if ($Name -eq "API health" -and ($payload.status -ne "ok" -or $payload.service -ne "agua-global-api")) {
      throw "$Url returned an unexpected health payload."
    }

    if ($Name -eq "API status") {
      if ($payload.status -ne "ok" -or $payload.api -ne "ok" -or $payload.database -ne "ok") {
        throw "$Url reported an unhealthy API or database state."
      }
      if ($null -eq $payload.response_ms -or [int]$payload.response_ms -lt 0) {
        throw "$Url did not return a valid response time."
      }
    }

    Write-Host ($payload | ConvertTo-Json -Compress)
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
  $serverEnvPath = Join-Path $ServerDir ".env"
  $hasTestDatabaseUrl = [bool]$env:TEST_DATABASE_URL
  if (-not $hasTestDatabaseUrl -and (Test-Path $serverEnvPath)) {
    $hasTestDatabaseUrl = Select-String -Path $serverEnvPath -Pattern '^\s*TEST_DATABASE_URL\s*=\s*\S+' -Quiet
  }

  if ($hasTestDatabaseUrl) {
    Invoke-Step "Smoke tests" {
      npm.cmd run test:smoke
    } $ServerDir
  } else {
    Write-Host ""
    Write-Host "Skipping smoke tests: TEST_DATABASE_URL is not set in the environment or server/.env." -ForegroundColor Yellow
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
    if ($response.Content -notmatch '<div id="root"></div>') {
      throw "$ClientUrl did not return the expected application shell."
    }
    Write-Host "Client returned HTTP $($response.StatusCode)."
  }
} else {
  Write-Host ""
  Write-Host "Skipping client availability check. Set AGUA_CLIENT_URL to verify it." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Release check completed." -ForegroundColor Green
