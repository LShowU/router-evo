param(
    [string]$ProjectPath = ".",
    [switch]$Json,
    [switch]$Compact
)

$resolved = Resolve-Path $ProjectPath -ErrorAction SilentlyContinue
if (-not $resolved) { Write-Error "Path not found: $ProjectPath"; exit 1 }
$root = $resolved.Path
Set-Location $root

$projectType = "unknown"
$configFiles = @()
if (Test-Path "package.json") { $projectType = "node"; $configFiles += "package.json" }
if (Test-Path "go.mod") { $projectType = if ($projectType -eq "unknown") { "go" } else { $projectType }; $configFiles += "go.mod" }
if (Test-Path "Cargo.toml") { $projectType = if ($projectType -eq "unknown") { "rust" } else { $projectType }; $configFiles += "Cargo.toml" }
if (Test-Path "pyproject.toml") { $projectType = if ($projectType -eq "unknown") { "python" } else { $projectType }; $configFiles += "pyproject.toml" }
if (Test-Path "requirements.txt") { $projectType = if ($projectType -eq "unknown") { "python" } else { $projectType }; $configFiles += "requirements.txt" }
if (Test-Path "Makefile") { $configFiles += "Makefile" }
if (Test-Path "Dockerfile") { $configFiles += "Dockerfile" }

$gitInfo = @{}
if (Test-Path ".git") {
    try {
        $gitInfo.branch = git rev-parse --abbrev-ref HEAD 2>$null
        $statusOutput = git status --porcelain 2>$null
        $gitInfo.changed = @($statusOutput | Where-Object { $_ -match '^\s*[MADRCU]' }).Count
        $gitInfo.untracked = @($statusOutput | Where-Object { $_ -match '^\?\?' }).Count
        $gitInfo.staged = @($statusOutput | Where-Object { $_ -match '^[MADRCU]\s' }).Count
        $gitInfo.recent = @(git log --oneline -5 2>$null)
        $gitInfo.stashCount = (git stash list 2>$null | Measure-Object).Count
    } catch { $gitInfo = @{ available = $false } }
}

function Get-CompactTree {
    param([string]$Dir, [int]$Depth, [string[]]$Exclude = @('node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', 'vendor', '.cache', 'coverage'))
    if ($Depth -le 0) { return "" }
    $items = Get-ChildItem $Dir -ErrorAction SilentlyContinue | 
             Where-Object { $_.Name -notin $Exclude -and -not $_.Name.StartsWith('.') -and $_.Name -notmatch '\.min\.' }
    $dirs = @($items | Where-Object { $_.PSIsContainer })
    $files = @($items | Where-Object { -not $_.PSIsContainer })
    $result = ""
    $maxShow = 30
    $count = 0
    foreach ($d in $dirs) {
        if ($count -ge $maxShow) { $result += "  ... +$($dirs.Count - $maxShow) dirs`n"; break }
        $subtree = Get-CompactTree $d.FullName ($Depth - 1) $Exclude
        $childCount = if ($subtree) { ($subtree -split "`n" | Where-Object { $_ -match '^\s{2,}[^.]' }).Count } else { 0 }
        $result += "  $($d.Name)/"
        if ($childCount -gt 0) { $result += " ($childCount)" }
        $result += "`n"
        $count++
    }
    $fileCount = 0
    foreach ($f in $files) {
        if ($fileCount -ge 15) { $result += "  ... +$($files.Count - 15) files`n"; break }
        $sz = if ($f.Length -gt 1MB) { " $([math]::Round($f.Length/1MB,1))MB" } elseif ($f.Length -gt 1KB) { " $([math]::Round($f.Length/1KB,1))KB" } else { "" }
        $result += "  $($f.Name)$sz`n"
        $fileCount++
    }
    return $result
}

$tree = Get-CompactTree $root 2

$configSummary = @{}
if (Test-Path "package.json") {
    try {
        $pkg = Get-Content package.json -Raw | ConvertFrom-Json
        $configSummary.projectName = $pkg.name
        $configSummary.projectVersion = $pkg.version
        if ($pkg.scripts) {
            $mainScripts = @($pkg.scripts.PSObject.Properties.Name | Where-Object { $_ -match '^(dev|build|start|test|lint|check|deploy)$' })
            if ($mainScripts) { $configSummary.scripts = $mainScripts }
        }
        if ($pkg.dependencies) { $configSummary.deps = ($pkg.dependencies.PSObject.Properties | Measure-Object).Count }
        if ($pkg.devDependencies) { $configSummary.devDeps = ($pkg.devDependencies.PSObject.Properties | Measure-Object).Count }
    } catch {}
}
if (Test-Path "go.mod") {
    try { $configSummary.goModule = (Get-Content go.mod -TotalCount 1) -replace 'module ', '' } catch {}
}
if (Test-Path "tsconfig.json") { $configSummary.hasTypeScript = $true }
if (Test-Path ".github/workflows") { $configSummary.hasCI = $true }

$readmeSummary = $null
$readmeFiles = @(Get-ChildItem -Filter "README*" -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($readmeFiles) {
    $readmeLines = Get-Content $readmeFiles[0].FullName -TotalCount 30
    $readmeSummary = ($readmeLines -join "`n").Substring(0, [Math]::Min(500, ($readmeLines -join "`n").Length))
}

$recentFiles = @()
try {
    $recentFiles = @(Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
                     Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build' } |
                     Sort-Object LastWriteTime -Descending |
                     Select-Object -First 10 |
                     ForEach-Object { 
                        $rel = $_.FullName -replace [regex]::Escape($root + '\'), ''
                        "$rel ($($_.LastWriteTime.ToString('MM-dd HH:mm')))"
                     })
} catch {}

if ($Json) {
    @{
        project = $root; type = $projectType; config = $configFiles
        git = $gitInfo; tree = $tree; configSummary = $configSummary
        readme = $readmeSummary; recentEdits = $recentFiles
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host "# Project: $(Split-Path $root -Leaf)"
    Write-Host "## Type: $projectType | Config: $($configFiles -join ', ')"
    if ($gitInfo.branch) {
        Write-Host "## Git: $($gitInfo.branch) | changed=$($gitInfo.changed) staged=$($gitInfo.staged) untracked=$($gitInfo.untracked)"
        Write-Host "  recent: $($gitInfo.recent -join ' | ')"
    }
    Write-Host "## Tree"
    $tree -split "`n" | Where-Object { $_.Trim() } | ForEach-Object { Write-Host $_ }
    if ($recentFiles) {
        Write-Host "## Recent Edits"
        foreach ($f in $recentFiles) { Write-Host "  $f" }
    }
}
