# ============================================================
# Session Cache System 鈥?浼氳瘽绾ф枃浠剁紦瀛?# 鏍稿績鐪?token 鍩虹璁炬柦锛歳ead 杩囩殑鏂囦欢绗簩娆′笉鍐嶈繑鍥炲畬鏁村唴瀹?# 鐢ㄦ硶: . .evox-agent/session-cache.ps1
# ============================================================

$script:TokenStatsModule = Join-Path (Split-Path $PSScriptRoot -Parent) 'token-stats\token-stats.ps1'
if (Test-Path $script:TokenStatsModule) { . $script:TokenStatsModule }
function Add-TokenStatEvent {
    param($Event)
    if (Get-Command Add-TokenEvent -ErrorAction SilentlyContinue) {
        try { Add-TokenEvent -Event $Event | Out-Null } catch {}
    }
}

$script:CacheDir = Join-Path $env:TEMP "evox-session-cache\$PID"
$script:CacheStore = @{}
$script:CacheEnabled = $true
$script:CacheMaxEntries = 200
$script:CacheMaxFileSize = 500KB

# --- 鍒濆鍖?---
function Initialize-SessionCache {
    if (-not (Test-Path $script:CacheDir)) {
        New-Item -ItemType Directory -Path $script:CacheDir -Force | Out-Null
    }
    $cacheFile = Join-Path $script:CacheDir "cache.json"
    if (Test-Path $cacheFile) {
        try {
            $script:CacheStore = Get-Content $cacheFile -Raw | ConvertFrom-Json -AsHashtable
        } catch { $script:CacheStore = @{} }
    }
    Write-Host "[cache] initialized ($($script:CacheStore.Count) entries)"
}

# --- 璁＄畻鏂囦欢鍝堝笇 ---
function Get-FileHashFast {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
    } finally { $stream.Dispose() }
}

# --- 缂撳瓨璇诲彇 ---
function Read-FileCached {
    param(
        [string]$Path,
        [switch]$SkipCache,
        [int]$MaxLines = 5000
    )
    $resolved = (Resolve-Path $Path -ErrorAction SilentlyContinue).Path
    if (-not $resolved -or -not (Test-Path $resolved)) {
        return @{ cached = $false; error = "Not found: $Path" }
    }
    $info = Get-Item $resolved
    if ($info.Length -gt $script:CacheMaxFileSize) {
        return @{
            cached = $false; oversized = $true; size = $info.Length
            hint = "Too large for cache. Use -SkipCache."
            head = (Get-Content $resolved -TotalCount 50) -join "`n"
            tail = (Get-Content $resolved -Tail 30) -join "`n"
            totalLines = (Get-Content $resolved | Measure-Object -Line).Lines
        }
    }

    $hash = Get-FileHashFast $resolved
    $existing = $script:CacheStore[$resolved]

    if (-not $SkipCache -and $existing -and $existing.hash -eq $hash) {
        Add-TokenStatEvent @{
            tool = 'session-cache'; operation = 'read-cache-hit'; file = $resolved
            cacheHit = $true; actualTokens = 8
            baselineTokens = [int][math]::Ceiling($info.Length / 3.5)
            savingType = 'exact'; reason = 'unchanged-file-cache'
        }
        return @{
            cached = $true; hash = $hash; path = $resolved
            size = $existing.size; lines = $existing.lines
            hint = "[CACHED] File unchanged. Use -SkipCache to force re-read."
        }
    }

    $content = Get-Content $resolved -TotalCount $MaxLines
    $totalLines = (Get-Content $resolved | Measure-Object -Line).Lines
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $script:CacheStore[$resolved] = @{
        hash = $hash; lines = $totalLines; size = $info.Length; timestamp = $timestamp
    }

    if ($script:CacheStore.Count -gt $script:CacheMaxEntries) {
        $oldest = ($script:CacheStore.GetEnumerator() | Sort-Object { $_.Value.timestamp } | Select-Object -First 1).Key
        $script:CacheStore.Remove($oldest)
    }
    Save-CacheToDisk

    $actualText = ($content -join "`n")
    Add-TokenStatEvent @{
        tool = 'session-cache'; operation = 'read'; file = $resolved
        cacheHit = $false
        actualTokens = [int][math]::Ceiling($actualText.Length / 3.5)
        baselineTokens = [int][math]::Ceiling($info.Length / 3.5)
        savingType = 'estimated'; reason = 'session-cache-read'
    }
    return @{
        cached = $false; hash = $hash; path = $resolved
        size = $info.Length; lines = $totalLines; truncated = ($totalLines -gt $MaxLines)
        content = $actualText
        tail = if ($totalLines -gt $MaxLines) { (Get-Content $resolved -Tail 30) -join "`n" } else { $null }
    }
}

# --- 缂撳瓨澶辨晥 ---
function Invalidate-CacheEntry {
    param([string]$Path)
    $resolved = (Resolve-Path $Path -ErrorAction SilentlyContinue).Path
    if ($resolved -and $script:CacheStore.ContainsKey($resolved)) {
        $script:CacheStore.Remove($resolved)
        Save-CacheToDisk
    }
}

function Invalidate-CacheAfterEdit {
    param([string]$FilePath)
    Invalidate-CacheEntry $FilePath
    Write-Host "[cache] invalidated: $FilePath"
}

# --- 鎸佷箙鍖?---
function Save-CacheToDisk {
    if (-not (Test-Path $script:CacheDir)) {
        New-Item -ItemType Directory -Path $script:CacheDir -Force | Out-Null
    }
    $script:CacheStore | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $script:CacheDir "cache.json") -Encoding UTF8
}

# --- 娓呯悊 ---
function Clear-SessionCache {
    $script:CacheStore = @{}
    if (Test-Path $script:CacheDir) {
        Remove-Item $script:CacheDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[cache] cleared"
}

# --- 缁熻 ---
function Get-CacheStats {
    return @{
        entries = $script:CacheStore.Count
        totalSize = ($script:CacheStore.Values | ForEach-Object { [long]$_.size } | Measure-Object -Sum).Sum
        dir = $script:CacheDir
    }
}

# --- 鍚姩 ---
Initialize-SessionCache
