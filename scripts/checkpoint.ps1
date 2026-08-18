# ============================================================
# Checkpoint System 鈥?缂栬緫鍓嶈嚜鍔ㄤ繚瀛橈紝澶辫触鍙洖婊?# 浼氳瘽缁撴潫鏃惰嚜鍔ㄦ竻鐞嗘墍鏈?checkpoint
# ============================================================

$script:CheckpointDir = Join-Path $env:TEMP "evox-checkpoints\$PID"
$script:CheckpointIndex = @{}  # checkpoint_id -> { path, backup, timestamp }
$script:MaxCheckpoints = 50

function Initialize-Checkpoints {
    if (-not (Test-Path $script:CheckpointDir)) {
        New-Item -ItemType Directory -Path $script:CheckpointDir -Force | Out-Null
    }
    # 鎭㈠绱㈠紩
    $idxFile = Join-Path $script:CheckpointDir "index.json"
    if (Test-Path $idxFile) {
        try {
            $script:CheckpointIndex = Get-Content $idxFile -Raw | ConvertFrom-Json -AsHashtable
        } catch { $script:CheckpointIndex = @{} }
    }
}

function Save-CheckpointIndex {
    $idxFile = Join-Path $script:CheckpointDir "index.json"
    $script:CheckpointIndex | ConvertTo-Json -Depth 2 | Set-Content $idxFile -Encoding UTF8
}

# --- 鍒涘缓 checkpoint ---
function New-Checkpoint {
    param([string]$FilePath)
    $resolved = (Resolve-Path $FilePath -ErrorAction SilentlyContinue).Path
    if (-not $resolved -or -not (Test-Path $resolved)) {
        return @{ ok = $false; error = "File not found: $FilePath" }
    }
    $id = "ck_$([DateTime]::Now.ToString('yyyyMMddHHmmss'))_$([guid]::NewGuid().ToString().Substring(0,6))"
    $backupPath = Join-Path $script:CheckpointDir "$id.bak"
    Copy-Item $resolved $backupPath -Force
    $script:CheckpointIndex[$id] = @{
        path = $resolved
        backup = $backupPath
        timestamp = [DateTime]::Now.ToString('o')
        size = (Get-Item $resolved).Length
    }
    # 娣樻卑鏈€鏃х殑
    if ($script:CheckpointIndex.Count -gt $script:MaxCheckpoints) {
        $oldest = ($script:CheckpointIndex.GetEnumerator() | Sort-Object { $_.Value.timestamp } | Select-Object -First 1).Key
        Remove-CheckpointInternal $oldest
    }
    Save-CheckpointIndex
    return @{ ok = $true; checkpoint_id = $id; path = $resolved }
}

# --- 鎭㈠ checkpoint ---
function Restore-Checkpoint {
    param([string]$CheckpointId)
    $entry = $script:CheckpointIndex[$CheckpointId]
    if (-not $entry) { return @{ ok = $false; error = "Checkpoint not found: $CheckpointId" } }
    if (-not (Test-Path $entry.backup)) { return @{ ok = $false; error = "Backup file missing: $($entry.backup)" } }
    Copy-Item $entry.backup $entry.path -Force
    Remove-CheckpointInternal $CheckpointId
    Save-CheckpointIndex
    return @{ ok = $true; restored = $entry.path }
}

# --- 娓呯悊鍗曚釜 checkpoint ---
function Remove-Checkpoint {
    param([string]$CheckpointId)
    $entry = $script:CheckpointIndex[$CheckpointId]
    if (-not $entry) { return @{ ok = $false; error = "Checkpoint not found: $CheckpointId" } }
    Remove-CheckpointInternal $CheckpointId
    Save-CheckpointIndex
    return @{ ok = $true; removed = $CheckpointId }
}

function Remove-CheckpointInternal {
    param([string]$Id)
    $entry = $script:CheckpointIndex[$Id]
    if ($entry -and (Test-Path $entry.backup)) {
        Remove-Item $entry.backup -Force -ErrorAction SilentlyContinue
    }
    $script:CheckpointIndex.Remove($Id)
}

# --- 鍒楀嚭鎵€鏈?checkpoint ---
function Get-Checkpoints {
    return $script:CheckpointIndex.GetEnumerator() | ForEach-Object {
        @{ id = $_.Key; path = $_.Value.path; time = $_.Value.timestamp; size = $_.Value.size }
    }
}

# --- 娓呯悊鎵€鏈夛紙浼氳瘽缁撴潫璋冪敤锛?---
function Clear-AllCheckpoints {
    foreach ($key in $script:CheckpointIndex.Keys) {
        Remove-CheckpointInternal $key
    }
    if (Test-Path $script:CheckpointDir) {
        Remove-Item $script:CheckpointDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[checkpoint] all cleared"
}

# --- 鍒濆鍖?---
Initialize-Checkpoints
