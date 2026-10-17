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

# 1. Dung tien trinh he thong & Runner VBS
Write-Host " [+] Dang dung tien trinh he thong..." -ForegroundColor Cyan
Get-Process -Name "GameNetworkService" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
taskkill.exe /f /im GameNetworkService.exe 2>$null | Out-Null
$legacyProc = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("d2lud3M="))
Get-Process -Name $legacyProc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
taskkill.exe /f /im "$legacyProc.exe" 2>$null | Out-Null

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "vtch_runner\.vbs" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Dung va go driver WinDivert
sc.exe stop WinDivert 2>$null | Out-Null
sc.exe stop WinDivert1.4 2>$null | Out-Null
net stop WinDivert 2>$null | Out-Null
sc.exe delete WinDivert 2>$null | Out-Null
sc.exe delete WinDivert1.4 2>$null | Out-Null

# 2. Xoa Task Scheduler
Write-Host " [+] Dang xoa tac vu tu khoi dong Game_Network_Optimizer..." -ForegroundColor Cyan
schtasks.exe /delete /tn "Game_Network_Optimizer" /f 2>$null | Out-Null
$legacyTask = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("WmFwcmV0X1N5c3RlbV9EYWVtb24="))
schtasks.exe /delete /tn $legacyTask /f 2>$null | Out-Null

# 3. Khoi phuc DNS moi card mang ve mac dinh (DHCP) va bat lai IPv6
Write-Host " [+] Dang khoi phuc cai dat mang ve mac dinh (DHCP)..." -ForegroundColor Cyan
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -or $_.HardwareInterface -eq $true } | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceAlias $_.Name -ResetServerAddresses -ErrorAction SilentlyContinue
    Enable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue
}
Clear-DnsClientCache

# 4. Don dep hosts file
Write-Host " [+] Dang don dep file hosts..." -ForegroundColor Cyan
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    try {
        attrib.exe -r -s -h "$hostsPath" 2>$null | Out-Null
        $lines = Get-Content -Path $hostsPath -ErrorAction SilentlyContinue
        $cleanLines = $lines | Where-Object { 
            $_ -notmatch "Steam Clean IPs" -and 
            $_ -notmatch "store\.steampowered\.com" -and 
            $_ -notmatch "steamcommunity\.com" -and 
            $_ -notmatch "help\.steampowered\.com" -and 
            $_ -notmatch "checkout\.steampowered\.com" 
        }
        [System.IO.File]::WriteAllLines($hostsPath, $cleanLines, [System.Text.Encoding]::ASCII)
    } catch { }
}
ipconfig /flushdns | Out-Null

# 5. Khoi phuc Shortcut Steam Desktop (bo -tcp neu co)
try {
    $wsh = New-Object -ComObject WScript.Shell
    @("$([Environment]::GetFolderPath('Desktop'))\Steam.lnk", "$([Environment]::GetFolderPath('CommonDesktopDirectory'))\Steam.lnk") | ForEach-Object {
        if (Test-Path $_) {
            $sc = $wsh.CreateShortcut($_)
            if ($sc.Arguments -match "-tcp") {
                $sc.Arguments = ($sc.Arguments -replace "-tcp", "").Trim()
                $sc.Save()
            }
        }
    }
} catch { }

# 6. Xoa thu muc C:\ProgramData\VuaTroChoi
Write-Host " [+] Dang xoa thu muc du lieu C:\ProgramData\VuaTroChoi..." -ForegroundColor Cyan
if (Test-Path "C:\ProgramData\VuaTroChoi") {
    attrib.exe -s -h -r "C:\ProgramData\VuaTroChoi\*" /s /d 2>$null | Out-Null
    attrib.exe -s -h -r "C:\ProgramData\VuaTroChoi" 2>$null | Out-Null
    Remove-Item "C:\ProgramData\VuaTroChoi" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host "    DA GO CAI DAT SACH SE TOAN BO HE THONG THANH CONG!                     " -ForegroundColor Green
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host ""
Read-Host " Nhan Enter de dong cua so..."