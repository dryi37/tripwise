$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BackendDir = Join-Path $RootDir 'backend'
$ComposeFile = Join-Path $BackendDir 'docker-compose.yml'

function Stop-WithMessage([string]$Message) {
    Write-Error $Message
    exit 1
}

foreach ($Command in @('docker', 'node', 'npm')) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Stop-WithMessage "Không tìm thấy $Command. Hãy cài Docker Desktop và Node.js 24 trở lên."
    }
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Không chạy được Docker Compose. Hãy mở Docker Desktop.' }

$EnvFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $BackendDir '.env.example') $EnvFile
    Write-Host 'Đã tạo backend\.env từ file mẫu. Thêm API key vào file này nếu muốn dùng agent hoặc tìm kiếm web.'
}

Write-Host 'Đang khởi động PostgreSQL và Qdrant...'
docker compose -f $ComposeFile up -d
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Không khởi động được PostgreSQL/Qdrant.' }

function Test-Healthy([string]$Service) {
    $Container = docker compose -f $ComposeFile ps -q $Service
    if ($LASTEXITCODE -ne 0 -or -not $Container) { return $false }
    $Inspection = docker inspect $Container 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $ContainerState = $Inspection | ConvertFrom-Json
    return $ContainerState[0].State.Health.Status -eq 'healthy'
}

$Ready = $false
for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    if ((Test-Healthy 'postgres') -and (Test-Healthy 'qdrant')) { $Ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $Ready) { Stop-WithMessage 'PostgreSQL hoặc Qdrant chưa sẵn sàng. Xem log bằng docker compose -f backend/docker-compose.yml logs.' }

if (-not (Test-Path (Join-Path $BackendDir 'node_modules/.bin/tsx'))) {
    Write-Host 'Đang cài dependencies backend lần đầu...'
    Push-Location $BackendDir
    try { npm ci; if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Cài dependencies backend thất bại.' } }
    finally { Pop-Location }
}

Write-Host 'Đang tạo Prisma client...'
Push-Location $BackendDir
try {
    npm run prisma:generate
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Tạo Prisma client thất bại.' }
    if ($args -contains '-SkipMigrations') {
        Write-Host 'Bỏ qua migration theo yêu cầu (-SkipMigrations).'
    }
    else {
        $MissingMigrations = @(Get-ChildItem (Join-Path $BackendDir 'prisma/migrations') -Directory | Where-Object { -not (Test-Path (Join-Path $_.FullName 'migration.sql')) })
        if ($MissingMigrations.Count -gt 0) {
            $Names = ($MissingMigrations.Name -join ', ')
            Stop-WithMessage "Migration thiếu migration.sql: $Names. Bổ sung file trước khi khởi động để tránh schema lệch."
        }
        Write-Host 'Đang kiểm tra schema và áp dụng migration cho môi trường dev...'
        npx prisma migrate dev
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Kiểm tra schema hoặc migration thất bại.' }
    }
}
finally { Pop-Location }

$EscapedRoot = $RootDir.Replace("'", "''")
$BackendCommand = "Set-Location -LiteralPath '$EscapedRoot'; npm --prefix backend run dev"
$FrontendCommand = "Set-Location -LiteralPath '$EscapedRoot'; node scripts/serve-static.cjs frontend 8080 127.0.0.1"
$BackendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($BackendCommand))
$FrontendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($FrontendCommand))
$PowerShellExe = (Get-Process -Id $PID).Path

function Test-Endpoint([string]$Url) {
    try {
        $Response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing
        return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
    }
    catch { return $false }
}

if (-not (Test-Endpoint 'http://127.0.0.1:3101/api/v1/health')) {
    Start-Process -FilePath $PowerShellExe -WorkingDirectory $RootDir -ArgumentList @('-NoExit', '-EncodedCommand', $BackendEncoded)
}
if (-not (Test-Endpoint 'http://127.0.0.1:8080/')) {
    Start-Process -FilePath $PowerShellExe -WorkingDirectory $RootDir -ArgumentList @('-NoExit', '-EncodedCommand', $FrontendEncoded)
}

function Wait-Endpoint([string]$Url, [string]$Name) {
    for ($Attempt = 0; $Attempt -lt 45; $Attempt++) {
        if (Test-Endpoint $Url) { return }
        Start-Sleep -Seconds 1
    }
    Stop-WithMessage "$Name chưa phản hồi. Kiểm tra cửa sổ PowerShell của dịch vụ để xem lỗi khởi động."
}

Wait-Endpoint 'http://127.0.0.1:3101/api/v1/health' 'Backend'
Wait-Endpoint 'http://127.0.0.1:8080/' 'Frontend'

Write-Host ''
Write-Host 'Backend và frontend đã phản hồi.'
Write-Host 'Frontend: http://127.0.0.1:8080'
Write-Host 'Backend:  http://127.0.0.1:3101/api/v1/health'
Write-Host 'Đóng từng cửa sổ terminal để dừng dịch vụ tương ứng.'
