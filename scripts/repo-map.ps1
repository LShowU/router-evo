# ============================================================
# Repo Map Generator 鈥?娴撶缉浠撳簱鍦板浘
# 涓€娆¤皟鐢ㄤ唬鏇?glob+grep 鎺㈢储闃舵锛岃妭鐪?70% 鎺㈢储 token
# ============================================================

param(
    [string]$Path = ".",
    [int]$MaxDepth = 4,
    [int]$MaxFilesPerDir = 50,
    [int]$MaxSymbolsPerFile = 30,
    [string[]]$ExcludePatterns = @('node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', 'vendor', 'coverage', '.cache', '*.min.js', '*.map', '*.lock'),
    [switch]$IncludeSymbols,
    [switch]$IncludeGitStatus,
    [switch]$IncludeConfig,
    [switch]$Json
)

$script:TokenStatsModule = Join-Path (Split-Path $PSScriptRoot -Parent) 'token-stats\token-stats.ps1'
if (Test-Path $script:TokenStatsModule) { . $script:TokenStatsModule }
function Add-TokenStatEvent {
    param($Event)
    if (Get-Command Add-TokenEvent -ErrorAction SilentlyContinue) {
        try { Add-TokenEvent -Event $Event | Out-Null } catch {}
    }
}

$resolved = Resolve-Path $Path -ErrorAction SilentlyContinue
if (-not $resolved) { Write-Error "Path not found: $Path"; exit 1 }
$root = $resolved.Path
Set-Location $root

# --- 杈呭姪鍑芥暟 ---
function Test-Excluded {
    param([string]$Name)
    foreach ($pat in $ExcludePatterns) {
        if ($Name -like $pat) { return $true }
    }
    return $false
}

function Get-FileSymbols {
    param([string]$FilePath)
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    $symbols = @()
    try {
        switch ($ext) {
            '.ts' { 
                $matches = Select-String -Path $FilePath -Pattern '^\s*(export\s+)?(async\s+)?(function|class|interface|type|enum|const)\s+(\w+)' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += $m.Groups[4].Value }
            }
            '.js' {
                $matches = Select-String -Path $FilePath -Pattern '^\s*(module\.exports|exports\.|export\s+(default\s+)?(function|class|const|let|var)\s+(\w+))' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += ($m.Groups[5].Value -or $m.Groups[0].Value.Split(' ')[-1]) }
            }
            '.py' {
                $matches = Select-String -Path $FilePath -Pattern '^\s*(def|class|async def)\s+(\w+)' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += $m.Groups[2].Value }
            }
            '.go' {
                $matches = Select-String -Path $FilePath -Pattern '^\s*(func|type|var|const)\s+(\w+)' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += $m.Groups[2].Value }
            }
            '.rs' {
                $matches = Select-String -Path $FilePath -Pattern '^\s*(pub\s+)?(fn|struct|enum|trait|impl|mod|type|const|static)\s+(\w+)' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += $m.Groups[3].Value }
            }
            '.java' {
                $matches = Select-String -Path $FilePath -Pattern '^\s*(public|private|protected)?\s*(class|interface|enum)\s+(\w+)' -AllMatches
                foreach ($m in $matches.Matches) { $symbols += $m.Groups[3].Value }
            }
        }
    } catch {}
    return ($symbols | Select-Object -First $MaxSymbolsPerFile)
}

function Get-ConfigSummary {
    $configs = @{}
    # package.json
    if (Test-Path "package.json") {
        try {
            $pkg = Get-Content package.json -Raw | ConvertFrom-Json
            $configs.node = @{
                name = $pkg.name
                type = if ($pkg.type) { $pkg.type } else { "commonjs" }
                deps = ($pkg.dependencies.PSObject.Properties.Name | Measure-Object).Count
                devDeps = ($pkg.devDependencies.PSObject.Properties.Name | Measure-Object).Count
                scripts = $pkg.scripts.PSObject.Properties.Name
            }
        } catch {}
    }
    # go.mod
    if (Test-Path "go.mod") {
        try {
            $mod = Get-Content go.mod -Raw
            $configs.go = @{ module = ($mod -split "`n" | Select-Object -First 1) -replace 'module ', '' }
        } catch {}
    }
    # Cargo.toml
    if (Test-Path "Cargo.toml") {
        try {
            $cargo = Get-Content Cargo.toml -Raw
            $configs.rust = @{ present = $true }
        } catch {}
    }
    # requirements.txt / pyproject.toml
    if (Test-Path "requirements.txt") { $configs.python = @{ hasRequirements = $true } }
    if (Test-Path "pyproject.toml") { $configs.python = @{ hasPyproject = $true } }
    return $configs
}

function Get-GitSummary {
    if (-not (Test-Path ".git")) { return $null }
    try {
        $branch = git rev-parse --abbrev-ref HEAD 2>$null
        $status = git status --porcelain 2>$null
        $changed = @($status | Where-Object { $_ -match '^\s*[MADRCU]' }).Count
        $untracked = @($status | Where-Object { $_ -match '^\?\?' }).Count
        $recentCommits = git log --oneline -5 2>$null
        return @{
            branch = $branch
            changed = $changed
            untracked = $untracked
            recentCommits = @($recentCommits)
        }
    } catch { return $null }
}

function Get-DirectoryTree {
    param([string]$Dir, [int]$Depth, [string]$Prefix = "")
    if ($Depth -le 0) { return @() }
    $result = @()
    try {
        $items = Get-ChildItem $Dir -ErrorAction SilentlyContinue | 
                 Where-Object { -not (Test-Excluded $_.Name) } |
                 Sort-Object { $_.PSIsContainer }, Name
        $count = 0
        foreach ($item in $items) {
            if ($count -ge $MaxFilesPerDir) { 
                $result += "$Prefix  ... ($($items.Count - $count) more)"
                break 
            }
            $relativePath = if ($item.PSIsContainer) { "$($item.Name)/" } else { $item.Name }
            $size = if (-not $item.PSIsContainer) { 
                $sz = $item.Length
                if ($sz -gt 1MB) { "$([math]::Round($sz/1MB, 1))MB" }
                elseif ($sz -gt 1KB) { "$([math]::Round($sz/1KB, 1))KB" }
                else { "$sz" }
            } else { "" }
            $symbols = if ($IncludeSymbols -and -not $item.PSIsContainer) { 
                $syms = Get-FileSymbols $item.FullName
                if ($syms.Count -gt 0) { "  [$($syms -join ', ')]" } else { "" }
            } else { "" }
            $entry = "$Prefix$relativePath$size$symbols"
            $result += $entry
            if ($item.PSIsContainer) {
                $result += Get-DirectoryTree $item.FullName ($Depth - 1) "$Prefix  "
            }
            $count++
        }
    } catch {}
    return $result
}

# --- 涓婚€昏緫 ---
$tree = Get-DirectoryTree $root $MaxDepth ""
$config = if ($IncludeConfig) { Get-ConfigSummary } else { $null }
$git = if ($IncludeGitStatus) { Get-GitSummary } else { $null }

if ($Json) {
    $mapJson = @{
        root = $root
        tree = $tree
        config = $config
        git = $git
        fileCount = ($tree | Where-Object { $_ -notmatch '/$' -and $_ -notmatch '\.\.\.' }).Count
        dirCount = ($tree | Where-Object { $_ -match '/$' }).Count
    } | ConvertTo-Json -Depth 4
    Add-TokenStatEvent @{
        tool = 'repo-map'; operation = 'map-json'; file = $root
        cacheHit = $false
        actualTokens = [int][math]::Ceiling($mapJson.Length / 3.5)
        baselineTokens = [int][math]::Ceiling(($mapJson.Length * 3) / 3.5)
        savingType = 'estimated'; reason = 'repo-map-vs-exploration'
    }
    $mapJson
} else {
    Add-TokenStatEvent @{
        tool = 'repo-map'; operation = 'map-text'; file = $root
        cacheHit = $false
        actualTokens = 600
        baselineTokens = 1800
        savingType = 'estimated'; reason = 'repo-map-vs-exploration'
    }
    Write-Host "# Repo Map: $root`n"
    if ($config) {
        Write-Host "## Config"
        $config.PSObject.Properties | ForEach-Object { Write-Host "  $($_.Name): $($_.Value)" }
        Write-Host ""
    }
    if ($git) {
        Write-Host "## Git"
        Write-Host "  branch: $($git.branch) | changed: $($git.changed) | untracked: $($git.untracked)"
        Write-Host "  recent:"
        foreach ($c in $git.recentCommits) { Write-Host "    $c" }
        Write-Host ""
    }
    Write-Host "## Tree"
    $tree | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    Write-Host "## Stats"
    Write-Host "  files: $(($tree | Where-Object { $_ -notmatch '/$' -and $_ -notmatch '\.\.\.' }).Count)"
    Write-Host "  dirs: $(($tree | Where-Object { $_ -match '/$' }).Count)"
}
