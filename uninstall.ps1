# ===========================================================================
#  VUA TRO CHOI - LENH GO CAI DAT SACH SE (UNINSTALL SCRIPT)
#  Go bo toan bo dich vu ngam
# ===========================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "VUA TRO CHOI - Go Cai Dat He Thong"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Vui long chay script nay voi quyen Administrator!" -ForegroundColor Red
    pause
    exit
}

Clear-Host
Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host "    [VUA TRO CHOI] - GO CAI DAT HE THONG                                  " -ForegroundColor Yellow
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Dung tien trinh winws
Write-Host " [+] Dang dung tien trinh he thong..." -ForegroundColor Cyan
Get-Process -Name "winws" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Xoa Task Scheduler
Write-Host " [+] Dang xoa tac vu tu khoi dong Zapret_System_Daemon..." -ForegroundColor Cyan
schtasks.exe /delete /tn "Zapret_System_Daemon" /f 2>$null

# 3. Khoi phuc DNS moi card mang ve mac dinh (DHCP)
Write-Host " [+] Dang khoi phuc cai dat mang ve mac dinh (DHCP)..." -ForegroundColor Cyan
Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceAlias $_.Name -ResetServerAddresses -ErrorAction SilentlyContinue
}
Clear-DnsClientCache

# 4. Don dep hosts file
Write-Host " [+] Dang don dep file hosts..." -ForegroundColor Cyan
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    $lines = Get-Content -Path $hostsPath
    $cleanLines = $lines | Where-Object { 
        $_ -notmatch "Steam Clean IPs" -and 
        $_ -notmatch "store\.steampowered\.com" -and 
        $_ -notmatch "steamcommunity\.com" -and 
        $_ -notmatch "help\.steampowered\.com" -and 
        $_ -notmatch "checkout\.steampowered\.com" 
    }
    Set-Content -Path $hostsPath -Value $cleanLines -Encoding UTF8 -Force
}
ipconfig /flushdns | Out-Null

# 5. Xoa thu muc C:\ProgramData\VuaTroChoi
Write-Host " [+] Dang xoa thu muc du lieu C:\ProgramData\VuaTroChoi..." -ForegroundColor Cyan
if (Test-Path "C:\ProgramData\VuaTroChoi") {
    Remove-Item "C:\ProgramData\VuaTroChoi" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host "    DA GO CAI DAT SACH SE TOAN BO HE THONG THANH CONG!                     " -ForegroundColor Green
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host ""
Read-Host " Nhan Enter de dong cua so..."