param(
    [switch]$CleanAll,
    [switch]$Status,
    [switch]$InstallAutoClean
)

$cacheDir = Join-Path $env:TEMP "evox-session-cache"
$checkpointDir = Join-Path $env:TEMP "evox-checkpoints"
$tokenStatsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'token-stats'
$tokenStatsFile = Join-Path $tokenStatsDir 'token-stats.jsonl'

function Get-MemoryStatus {
    $cacheSize = 0
    $cacheCount = 0
    if (Test-Path $cacheDir) {
        $cacheCount = (Get-ChildItem $cacheDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
        $cacheSize = (Get-ChildItem $cacheDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    }
    $checkpointSize = 0
    $checkpointCount = 0
    if (Test-Path $checkpointDir) {
        $checkpointCount = (Get-ChildItem $checkpointDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
        $checkpointSize = (Get-ChildItem $checkpointDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    }
    $tokenStatsSize = 0
    $tokenStatsCount = 0
    if (Test-Path $tokenStatsFile) {
        $tokenStatsSize = (Get-Item $tokenStatsFile -ErrorAction SilentlyContinue).Length
        $tokenStatsCount = @(Get-Content $tokenStatsFile -ErrorAction SilentlyContinue | Where-Object { $_.Trim() }).Count
    }
    [PSCustomObject]@{
        CacheFiles = $cacheCount
        CacheSizeMB = [math]::Round($cacheSize / 1MB, 2)
        CacheDir = $cacheDir
        CheckpointFiles = $checkpointCount
        CheckpointSizeMB = [math]::Round($checkpointSize / 1MB, 2)
        CheckpointDir = $checkpointDir
        TokenStatsFiles = $tokenStatsCount
        TokenStatsSizeKB = [math]::Round($tokenStatsSize / 1KB, 2)
        TokenStatsFile = $tokenStatsFile
        TotalMB = [math]::Round(($cacheSize + $checkpointSize) / 1MB, 2)
    }
}

function Invoke-CleanAll {
    $before = Get-MemoryStatus
    if (Test-Path $cacheDir) {
        Remove-Item $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $checkpointDir) {
        Remove-Item $checkpointDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    $tokenStatsScript = Join-Path $tokenStatsDir 'token-stats.ps1'
    if (Test-Path $tokenStatsScript) {
        . $tokenStatsScript
        Prune-TokenStats -MaxEvents 5000
        Rotate-TokenStats -MaxSizeKB 1024
    }
    $after = Get-MemoryStatus
    Write-Host "[cleanup] Freed $($before.TotalMB) MB"
    Write-Host "[cleanup] Removed $($before.CacheFiles + $before.CheckpointFiles) files"
}

function Install-AutoClean {
    $profilePath = $PROFILE.CurrentUserAllHosts
    if (-not $profilePath) { $profilePath = "$env:USERPROFILE\Documents\PowerShell\Profile.ps1" }
    $profileDir = Split-Path $profilePath -Parent
    if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }

    $cleanupScript = @"

# === EvoX Agent auto-cleanup ===
# Cleans cache, checkpoints, and token-stats backups older than 24 hours on shell startup
`$agentCleanupDir = Join-Path `$env:TEMP "evox-session-cache"
`$agentCheckpointDir = Join-Path `$env:TEMP "evox-checkpoints"
`$tokenStatsDir = 'E:\鏂板缓鏂囦欢澶筡token-stats'
`$tokenStatsFile = Join-Path `$tokenStatsDir 'token-stats.jsonl'
`$cutoff = (Get-Date).AddHours(-24)
foreach (`$dir in @(`$agentCleanupDir, `$agentCheckpointDir)) {
    if (Test-Path `$dir) {
        Get-ChildItem `$dir -Directory -ErrorAction SilentlyContinue | Where-Object { `$_.LastWriteTime -lt `$cutoff } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}
# Clean orphaned PID directories (PID no longer running)
if (Test-Path `$agentCleanupDir) {
    Get-ChildItem `$agentCleanupDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        `$pidNum = [int]`$_.Name
        if (`$pidNum -gt 0) {
            `$proc = Get-Process -Id `$pidNum -ErrorAction SilentlyContinue
            if (-not `$proc) { Remove-Item `$_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}
if (Test-Path `$agentCheckpointDir) {
    Get-ChildItem `$agentCheckpointDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        `$pidNum = [int]`$_.Name
        if (`$pidNum -gt 0) {
            `$proc = Get-Process -Id `$pidNum -ErrorAction SilentlyContinue
            if (-not `$proc) { Remove-Item `$_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}
# Clean token-stats backup files older than 24 hours, then enforce size/line caps
if (Test-Path `$tokenStatsDir) {
    Get-ChildItem `$tokenStatsDir -File -Filter 'token-stats.jsonl.*.bak' -ErrorAction SilentlyContinue |
        Where-Object { `$_.LastWriteTime -lt `$cutoff } |
        Remove-Item -Force -ErrorAction SilentlyContinue
    if (Test-Path `$tokenStatsFile) {
        `$statsItem = Get-Item `$tokenStatsFile -ErrorAction SilentlyContinue
        if (`$statsItem.Length -gt 1MB) {
            `$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            Move-Item -LiteralPath `$tokenStatsFile -Destination "`$tokenStatsFile.`$stamp.bak" -Force
            Set-Content -LiteralPath `$tokenStatsFile -Value '' -Encoding UTF8 -NoNewline
        } else {
            `$statsLines = @(Get-Content `$tokenStatsFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { `$_.Trim() })
            if (`$statsLines.Count -gt 5000) {
                Set-Content -LiteralPath `$tokenStatsFile -Value @(`$statsLines | Select-Object -Last 5000) -Encoding UTF8
            }
        }
    }
}
"@

    if (Test-Path $profilePath) {
        $existing = Get-Content $profilePath -Raw
        if ($existing -match "EvoX Agent auto-cleanup") {
            Write-Host "[cleanup] Already installed in profile"
            return
        }
    }
    Add-Content $profilePath "`n$cleanupScript"
    Write-Host "[cleanup] Installed auto-cleanup in $profilePath"
    Write-Host "[cleanup] Will run on every PowerShell start: remove caches older than 24h + orphaned PID dirs"
}

if ($CleanAll) {
    Invoke-CleanAll
} elseif ($InstallAutoClean) {
    Install-AutoClean
} elseif ($Status) {
    Get-MemoryStatus | Format-List
} else {
    Write-Host "Usage:"
    Write-Host "  .\memory-cleanup.ps1 -Status           Show current usage"
    Write-Host "  .\memory-cleanup.ps1 -CleanAll         Clean everything now"
    Write-Host "  .\memory-cleanup.ps1 -InstallAutoClean Install auto-clean on shell startup"
    Write-Host ""
    Get-MemoryStatus | Format-List
}
