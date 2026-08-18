# ============================================================
# Output Compressor 鈥?grep/pwsh/read 杈撳嚭鍘嬬缉
# 鐢ㄦ硶:
#   .\output-compressor.ps1 -Mode grep -Pattern "xxx" -GrepOutput files
#   .\output-compressor.ps1 -Mode run -Command "npm test" -RunOutput summary
#   .\output-compressor.ps1 -Mode read -FilePath "a.ts" -ReadMode head -Lines 100
# ============================================================

param(
    [ValidateSet("grep", "run", "read")]
    [string]$Mode = "grep",

    [string]$Pattern,
    [string]$Path = ".",
    [string]$Include = "*",
    [ValidateSet("full", "files", "count", "summary")]
    [string]$GrepOutput = "files",
    [int]$MaxResults = 30,
    [int]$MaxLineLength = 120,

    [string]$Command,
    [ValidateSet("full", "tail", "summary", "status")]
    [string]$RunOutput = "summary",
    [int]$TailLines = 40,
    [int]$HeadLines = 10,

    [string]$FilePath,
    [ValidateSet("head", "tail", "full")]
    [string]$ReadMode = "head",
    [int]$Lines = 200
)

$script:TokenStatsModule = Join-Path (Split-Path $PSScriptRoot -Parent) 'token-stats\token-stats.ps1'
if (Test-Path $script:TokenStatsModule) { . $script:TokenStatsModule }
function Add-TokenStatEvent {
    param($Event)
    if (Get-Command Add-TokenEvent -ErrorAction SilentlyContinue) {
        try { Add-TokenEvent -Event $Event | Out-Null } catch {}
    }
}

function Invoke-SmartGrep {
    $results = Get-ChildItem -Path $Path -Filter $Include -Recurse -File -ErrorAction SilentlyContinue |
               Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build|\.next' } |
               Select-String -Pattern $Pattern -ErrorAction SilentlyContinue

    switch ($GrepOutput) {
        "files" {
            $files = $results | Select-Object -ExpandProperty Path -Unique | Sort-Object -Unique
            $fileList = @($files | Select-Object -First $MaxResults)
            $data = @{
                mode = "files"
                pattern = $Pattern
                matchCount = @($files).Count
                files = $fileList
                truncated = (@($files).Count -gt $MaxResults)
            }
            return ($data | ConvertTo-Json -Depth 2)
        }
        "count" {
            $grouped = $results | Group-Object Path | ForEach-Object {
                @{ file = $_.Name; matches = $_.Count }
            } | Sort-Object { -$_.matches } | Select-Object -First $MaxResults
            $data = @{
                mode = "count"
                pattern = $Pattern
                totalMatches = @($results).Count
                totalFiles = @($grouped).Count
                files = @($grouped)
            }
            return ($data | ConvertTo-Json -Depth 2)
        }
        "summary" {
            $lines = $results | Select-Object -First $MaxResults | ForEach-Object {
                $line = $_.Line
                if ($line.Length -gt $MaxLineLength) { $line = $line.Substring(0, $MaxLineLength) + "..." }
                "$($_.Filename):$($_.LineNumber): $line"
            }
            $data = @{
                mode = "summary"
                pattern = $Pattern
                totalMatches = @($results).Count
                matches = @($lines)
                truncated = (@($results).Count -gt $MaxResults)
            }
            return ($data | ConvertTo-Json -Depth 2)
        }
        "full" {
            return ($results | Select-Object -First $MaxResults | ForEach-Object {
                "$($_.Filename):$($_.LineNumber): $($_.Line)"
            } | Out-String)
        }
    }
}

function Invoke-SmartRun {
    if (-not $Command) { return '{"error":"-Command required"}' }
    try {
        $output = Invoke-Expression $Command 2>&1
        $allLines = @($output)
        $exitCode = $LASTEXITCODE
        $totalLines = $allLines.Count

        switch ($RunOutput) {
            "status" {
                $data = @{ exit = $exitCode; totalLines = $totalLines; ok = ($exitCode -eq 0) }
                return ($data | ConvertTo-Json)
            }
            "tail" {
                $tail = $allLines | Select-Object -Last $TailLines
                $data = @{
                    exit = $exitCode; totalLines = $totalLines
                    tail = @($tail); omitted = [Math]::Max(0, $totalLines - $TailLines)
                }
                return ($data | ConvertTo-Json -Depth 3)
            }
            "summary" {
                $head = $allLines | Select-Object -First $HeadLines
                $tail = $allLines | Select-Object -Last $TailLines
                $middle = [Math]::Max(0, $totalLines - $HeadLines - $TailLines)
                $data = @{
                    exit = $exitCode; totalLines = $totalLines
                    head = @($head); omitted = $middle; tail = @($tail)
                }
                return ($data | ConvertTo-Json -Depth 3)
            }
            "full" {
                return ($allLines -join "`n")
            }
        }
    } catch {
        return (@{ exit = -1; error = $_.Exception.Message } | ConvertTo-Json)
    }
}

function Invoke-SmartRead {
    if (-not $FilePath) { return '{"error":"-FilePath required"}' }
    if (-not (Test-Path $FilePath)) { return '{"error":"File not found"}' }

    $allLines = @(Get-Content $FilePath)
    $totalLines = $allLines.Count

    switch ($ReadMode) {
        "head" {
            $data = @{
                mode = "head"; totalLines = $totalLines; path = $FilePath
                lines = @($allLines | Select-Object -First $Lines)
            }
            return ($data | ConvertTo-Json -Depth 3)
        }
        "tail" {
            $data = @{
                mode = "tail"; totalLines = $totalLines; path = $FilePath
                lines = @($allLines | Select-Object -Last $Lines)
            }
            return ($data | ConvertTo-Json -Depth 3)
        }
        "full" {
            return ($allLines -join "`n")
        }
    }
}

switch ($Mode) {
    "grep" {
        $out = Invoke-SmartGrep
        $fullBaseline = [int][math]::Ceiling((($out | Out-String).Length * 4) / 3.5)
        Add-TokenStatEvent @{
            tool = 'output-compressor'; operation = "grep-$GrepOutput"; file = $Path
            cacheHit = $false
            actualTokens = [int][math]::Ceiling((($out | Out-String).Length) / 3.5)
            baselineTokens = $fullBaseline
            savingType = 'estimated'; reason = "grep-compress-$GrepOutput"
        }
        $out
    }
    "run"  {
        $out = Invoke-SmartRun
        $fullBaseline = if ($RunOutput -eq 'full') { [int][math]::Ceiling((($out | Out-String).Length) / 3.5) } else { [int][math]::Ceiling((($out | Out-String).Length * 4) / 3.5) }
        Add-TokenStatEvent @{
            tool = 'output-compressor'; operation = "run-$RunOutput"; file = $Path
            cacheHit = $false
            actualTokens = [int][math]::Ceiling((($out | Out-String).Length) / 3.5)
            baselineTokens = $fullBaseline
            savingType = 'estimated'; reason = "run-compress-$RunOutput"
        }
        $out
    }
    "read" {
        $out = Invoke-SmartRead
        $fullBaseline = if ($ReadMode -eq 'full') { [int][math]::Ceiling((($out | Out-String).Length) / 3.5) } else { [int][math]::Ceiling((($out | Out-String).Length * 4) / 3.5) }
        Add-TokenStatEvent @{
            tool = 'output-compressor'; operation = "read-$ReadMode"; file = $FilePath
            cacheHit = $false
            actualTokens = [int][math]::Ceiling((($out | Out-String).Length) / 3.5)
            baselineTokens = $fullBaseline
            savingType = 'estimated'; reason = "read-compress-$ReadMode"
        }
        $out
    }
}
