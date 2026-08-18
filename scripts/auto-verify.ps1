param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string]$TestCommand,
    [string]$LintCommand,
    [int]$MaxFailures = 5,
    [switch]$Json,
    [switch]$AutoDetect
)

$script:TokenStatsModule = Join-Path (Split-Path $PSScriptRoot -Parent) 'token-stats\token-stats.ps1'
if (Test-Path $script:TokenStatsModule) { . $script:TokenStatsModule }
function Add-TokenStatEvent {
    param($Event)
    if (Get-Command Add-TokenEvent -ErrorAction SilentlyContinue) {
        try { Add-TokenEvent -Event $Event | Out-Null } catch {}
    }
}

$resolved = (Resolve-Path $FilePath -ErrorAction SilentlyContinue).Path
if (-not $resolved) { 
    if ($Json) { @{ ok = $false; error = "File not found" } | ConvertTo-Json } 
    else { Write-Host "[verify] ERROR: File not found: $FilePath" }
    exit 1 
}

$projectRoot = git rev-parse --show-toplevel 2>$null
if (-not $projectRoot) { $projectRoot = Split-Path $resolved -Parent }
Set-Location $projectRoot

$ext = [System.IO.Path]::GetExtension($resolved).ToLower()
$fileName = [System.IO.Path]::GetFileNameWithoutExtension($resolved)
$results = @{ lint = $null; test = $null; typeCheck = $null; ok = $true }

if ($AutoDetect) {
    if (Test-Path "package.json") {
        try {
            $pkg = Get-Content package.json -Raw | ConvertFrom-Json
            if ($pkg.scripts -and $pkg.scripts.test) { $TestCommand = "npm test -- --reporter=dot 2>&1" }
            if ($pkg.scripts -and $pkg.scripts.lint) { $LintCommand = "npm run lint -- --quiet 2>&1" }
            if (Test-Path "node_modules/.bin/eslint") { $LintCommand = "npx eslint $resolved --quiet 2>&1" }
            if (Test-Path "jest.config.*") { $TestCommand = "npx jest --testPathPattern='$fileName' --no-coverage --silent 2>&1" }
            if (Test-Path "vitest.config.*") { $TestCommand = "npx vitest run --reporter=dot 2>&1" }
        } catch {}
    }
    if ((Test-Path "go.mod") -and $ext -eq '.go') {
        $TestCommand = "go test ./... -count=1 -short 2>&1"
    }
    if ((Test-Path "Cargo.toml") -and $ext -eq '.rs') {
        $TestCommand = "cargo test --lib -q 2>&1"
    }
}

function Run-Verify {
    param([string]$Cmd, [string]$Label)
    if (-not $Cmd) { return $null }
    try {
        $output = Invoke-Expression $Cmd 2>&1 | Out-String
        $ec = $LASTEXITCODE
        if ($ec -eq 0) {
            return @{ passed = $true; summary = "" }
        }
        $failLines = $output -split "`n" | Where-Object { $_ -match 'error|fail|Error|FAIL|assert' } | Select-Object -First $MaxFailures
        return @{ passed = $false; exitCode = $ec; failures = @($failLines) }
    } catch {
        return @{ passed = $false; error = $_.Exception.Message }
    }
}

if ($LintCommand) {
    $results.lint = Run-Verify $LintCommand "lint"
    if (-not $results.lint.passed) { $results.ok = $false }
}
if ($TestCommand) {
    $results.test = Run-Verify $TestCommand "test"
    if (-not $results.test.passed) { $results.ok = $false }
}

$verifyActual = if ($results.ok) { 20 } else { (($results | ConvertTo-Json -Depth 3).Length / 3.5) }
Add-TokenStatEvent @{
    tool = 'auto-verify'; operation = 'verify'; file = $resolved
    cacheHit = $false
    actualTokens = [int][math]::Ceiling($verifyActual)
    baselineTokens = if ($results.ok) { 320 } else { 400 }
    savingType = 'estimated'
    reason = if ($results.ok) { 'verify-silent-pass' } else { 'verify-failure-summary' }
}

if ($Json) {
    $results | ConvertTo-Json -Depth 3
} else {
    if ($results.ok) {
        Write-Host "[verify] ALL PASSED"
    } else {
        Write-Host "[verify] FAILURES:"
        if ($results.lint -and -not $results.lint.passed) {
            Write-Host "  LINT:"
            foreach ($f in $results.lint.failures) { Write-Host "    $f" }
        }
        if ($results.test -and -not $results.test.passed) {
            Write-Host "  TEST (exit=$($results.test.exitCode)):"
            foreach ($f in $results.test.failures) { Write-Host "    $f" }
        }
    }
}
