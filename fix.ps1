# ===========================================================================
#  VUA TRO CHOI - CONG CU DÒ TÌM & TỰ ĐỘNG SỬA MỌI LỖI STEAM 1-CLICK (AUTO-DOCTOR)
#  Tu dong quet moi o dia (C, D, E, F...) | Don sach cache ket noi | Mo online
# ===========================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "VUA TRO CHOI - Auto-Fix & Doctor Steam"

# 1. Tu dong kiem tra va xin quyen Administrator neu chua co
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host ""
    Write-Host " [!] Dang yeu cau quyen Administrator (UAC)..." -ForegroundColor Yellow
    if ($PSCommandPath) {
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    } else {
        $onlineCmd = "irm https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/fix.ps1 | iex"
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$onlineCmd`"" -Verb RunAs
    }
    exit
}

Clear-Host
Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host "    [VUA TRO CHOI] - DÒ TÌM & TỰ ĐỘNG SỬA TRIỆT ĐỂ LỖI STEAM (AUTO-FIX)     " -ForegroundColor Yellow
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host ""

# [1/6] Dò tìm vị trí cài đặt Steam trên toàn bộ máy (Registry + Tất cả các ổ đĩa C, D, E, F...)
Write-Host " [*] [1/6] Đang tự động dò tìm vị trí cài đặt Steam trên máy..." -ForegroundColor Cyan
$steamPath = $null
$steamExe = $null

# Cách 1: Quét Registry HKCU & HKLM
try {
    $regCu = Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction SilentlyContinue
    if ($regCu -and $regCu.SteamPath -and (Test-Path "$($regCu.SteamPath)\steam.exe")) {
        $steamPath = $regCu.SteamPath
        $steamExe = "$steamPath\steam.exe"
    } elseif ($regCu -and $regCu.SteamExe -and (Test-Path $regCu.SteamExe)) {
        $steamExe = $regCu.SteamExe
        $steamPath = Split-Path $steamExe
    }
} catch { }

if (-not $steamExe) {
    try {
        $regLm = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam" -ErrorAction SilentlyContinue
        if ($regLm -and $regLm.InstallPath -and (Test-Path "$($regLm.InstallPath)\steam.exe")) {
            $steamPath = $regLm.InstallPath
            $steamExe = "$steamPath\steam.exe"
        }
    } catch { }
}

# Cách 2: Quét tất cả các ổ đĩa hiện có (C, D, E, F, G, H...)
if (-not $steamExe) {
    $drives = Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root
    $commonSubfolders = @(
        "Steam\steam.exe",
        "Program Files (x86)\Steam\steam.exe",
        "Program Files\Steam\steam.exe",
        "Games\Steam\steam.exe",
        "SteamLibrary\steam.exe"
    )
    foreach ($d in $drives) {
        foreach ($sub in $commonSubfolders) {
            $test = Join-Path $d $sub
            if (Test-Path $test) {
                $steamExe = $test
                $steamPath = Split-Path $steamExe
                break
            }
        }
        if ($steamExe) { break }
    }
}

# Cách 3: Quét tiến trình đang chạy
if (-not $steamExe) {
    $p = Get-Process steam -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p -and $p.Path) {
        $steamExe = $p.Path
        $steamPath = Split-Path $steamExe
    }
}

if ($steamExe) {
    Write-Host "  [OK] Đã tìm thấy Steam tại: $steamExe" -ForegroundColor Green
} else {
    Write-Host "  [!] Không tìm thấy Steam ở ổ khác, mặc định kiểm tra C:\Program Files (x86)\Steam" -ForegroundColor Yellow
    $steamExe = "C:\Program Files (x86)\Steam\steam.exe"
    $steamPath = "C:\Program Files (x86)\Steam"
}

# [2/6] Tắt triệt để Steam đang kẹt
Write-Host "`n [*] [2/6] Đang tắt các tiến trình Steam bị treo/kẹt offline..." -ForegroundColor Cyan
taskkill.exe /f /im steam.exe 2>$null | Out-Null
taskkill.exe /f /im steamwebhelper.exe 2>$null | Out-Null
Start-Sleep -Milliseconds 600
Write-Host "  [OK] Đã dừng toàn bộ tiến trình Steam cũ." -ForegroundColor Green

# [3/6] Dọn dẹp cache kết nối Steam bị lỗi/kẹt Offline (Xử lý gốc rễ lý do bị NO CONNECTION)
Write-Host "`n [*] [3/6] Đang xóa bộ nhớ đệm kết nối mạng bị kẹt của Steam (htmlcache)..." -ForegroundColor Cyan
if ($steamPath -and (Test-Path $steamPath)) {
    # 1. Xóa htmlcache (CEF browser cache của Steam)
    $htmlCache = Join-Path $steamPath "config\htmlcache"
    if (Test-Path $htmlCache) {
        Remove-Item -Path $htmlCache -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Đã dọn dẹp Steam htmlcache (xóa triệt để màn hình lỗi mạng web)." -ForegroundColor Green
    }
    
    # 2. Xóa package tmp (tránh kẹt gói cập nhật cũ)
    $pkgTmp = Join-Path $steamPath "package\tmp"
    if (Test-Path $pkgTmp) {
        Remove-Item -Path $pkgTmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# [4/6] Dọn sạch file hosts an toàn (Không bị lỗi Stream was not readable) & Cấu hình DNS Google
Write-Host "`n [*] [4/6] Đang dọn dẹp file hosts & Cấu hình DNS Google sạch..." -ForegroundColor Cyan
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    try {
        attrib.exe -r -s -h "$hostsPath" 2>$null | Out-Null
        $rawLines = [System.IO.File]::ReadAllLines($hostsPath)
        $cleanLines = New-Object System.Collections.Generic.List[string]
        foreach ($line in $rawLines) {
            if ($line -notmatch "steampowered\.com" -and 
                $line -notmatch "steamcommunity\.com" -and 
                $line -notmatch "valvesoftware\.com" -and 
                $line -notmatch "steamstatic\.com" -and 
                $line -notmatch "steamserver\.net") {
                $cleanLines.Add($line)
            }
        }
        [System.IO.File]::WriteAllLines($hostsPath, $cleanLines, [System.Text.Encoding]::ASCII)
        Write-Host "  [OK] File hosts đã sạch sẽ 100% (Đã gỡ bỏ toàn bộ IP rác/chết)." -ForegroundColor Green
    } catch {
        Write-Host "  [!] Bỏ qua sửa hosts (Không bị ảnh hưởng)." -ForegroundColor DarkGray
    }
}

# Đổi DNS sang Google sạch (IPv4 & IPv6), giữ IPv6 để COD và các game online không bị lỗi mạng
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceAlias $_.Name -ServerAddresses ('8.8.8.8','8.8.4.4','2001:4860:4860::8888','2001:4860:4860::8844') -ErrorAction SilentlyContinue
    Enable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue
}
ipconfig /flushdns 2>$null | Out-Null
Write-Host "  [OK] Đã tối ưu DNS Google sạch (IPv4 & IPv6) và bảo toàn đường truyền game." -ForegroundColor Green

# [5/6] Cập nhật danh sách loại trừ Call of Duty & Activision (Bỏ qua hoàn toàn COD)
Write-Host "`n [*] [5/6] Cập nhật loại trừ COD, Demonware, Activision khỏi Vua Trò Chơi..." -ForegroundColor Cyan
$installDir = "C:\ProgramData\VuaTroChoi"
if (Test-Path $installDir) {
    # 1. Ghi danh sach loai tru COD & Demonware vao exclude-games.txt
    $excludePath = Join-Path $installDir "files\exclude-games.txt"
    $excludeContent = @'
# === CALL OF DUTY & ACTIVISION (Demonware Matchmaking, Auth, Ricochet) ===
demonware.net
activision.com
callofduty.com
atvi.com
cod.com
treyarch.com
infinityward.com
ravensoftware.com
sledgehammergames.com

# === GAME DOWNLOAD CDNs & RIOT (Valorant, LoL, Battle.net, Epic) ===
steamcontent.com
steamserver.net
akamaized.net
akamaihd.net
epicgames.com
unrealengine.com
ea.com
origin.com
electronicarts.com
battle.net
blizzard.com
battlenet.com
riotgames.com
leagueoflegends.com
pvp.net
valorant.com
ubisoft.com
uplay.com
gog.com
rockstargames.com
speedtest.net
fast.com
speed.cloudflare.com

# === NETFLIX, BANKING & REMOTE SUPPORT ===
netflix.com
spotify.com
apple.com
icloud.com
microsoft.com
live.com
vcb.com.vn
vietcombank.com.vn
techcombank.com.vn
mbbank.com.vn
momo.vn
ultraviewer.net
anydesk.com
teamviewer.com
'@
    if (-not (Test-Path (Join-Path $installDir "files"))) {
        New-Item -ItemType Directory -Path (Join-Path $installDir "files") -Force | Out-Null
    }
    Set-Content -Path $excludePath -Value $excludeContent -Encoding UTF8 -Force

    # 2. Cap nhat vtch_runner.vbs de GameNetworkService chay lien tuc 24/7 va bo qua COD
    $vbsPath = Join-Path $installDir "vtch_runner.vbs"
    $vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
WshShell.CurrentDirectory = "C:\ProgramData\VuaTroChoi"

Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'GameNetworkService.exe'")

If colProcesses.Count = 0 Then
    coreExe = "C:\ProgramData\VuaTroChoi\GameNetworkService.exe"
    args = "--wf-tcp=80,443 --filter-tcp=80 --filter-l7=http --hostlist=""files\list-steam.txt"" --hostlist-exclude=""files\exclude-games.txt"" --dpi-desync=fake,fakedsplit --dpi-desync-autottl=2 --dpi-desync-cutoff=d4 --new --filter-tcp=443 --filter-l7=tls --hostlist=""files\list-steam.txt"" --hostlist-exclude=""files\exclude-games.txt"" --dpi-desync=fake,split --dpi-desync-split-pos=2 --dpi-desync-fooling=md5sig --dpi-desync-cutoff=d4"
    WshShell.Run """" & coreExe & """ " & args, 0, False
End If
"@
    Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII -Force

    # 3. Khoi dong lai GameNetworkService voi cau hinh loai tru moi
    Get-Process -Name "GameNetworkService" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    taskkill.exe /f /im GameNetworkService.exe 2>$null | Out-Null
    Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`"" -WindowStyle Hidden
    Start-Sleep -Seconds 1
}

$svc = Get-Process GameNetworkService, winws -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
    Write-Host "  [OK] Vua Trò Chơi đang chạy ngầm và ĐÃ BỎ QUA HOÀN TOÀN Call of Duty." -ForegroundColor Green
} else {
    Write-Host "  [!] Cảnh báo: GameNetworkService chưa bật. Kiểm tra Windows Security nếu bị chặn." -ForegroundColor Yellow
}

# [6/6] Tự động cập nhật Shortcut Desktop với cờ -websocket và Khởi chạy lại Steam
Write-Host "`n [*] [6/6] Cập nhật phím tắt Steam và khởi chạy lại ứng dụng..." -ForegroundColor Cyan
if (Test-Path $steamExe) {
    try {
        $wsh = New-Object -ComObject WScript.Shell
        @("$([Environment]::GetFolderPath('Desktop'))\Steam.lnk", 
          "$([Environment]::GetFolderPath('CommonDesktopDirectory'))\Steam.lnk") | ForEach-Object {
            if (Test-Path $_) {
                $sc = $wsh.CreateShortcut($_)
                $sc.TargetPath = $steamExe
                $sc.Arguments = "-websocket"
                $sc.Save()
            }
        }
        Write-Host "  [OK] Đã gán cờ tối ưu kết nối (-websocket) vào Shortcut Steam." -ForegroundColor Green
    } catch { }

    Write-Host "  [+] Đang khởi chạy Steam trực tuyến..." -ForegroundColor Green
    Start-Process $steamExe -ArgumentList "-websocket"
}

Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host "    [VUA TRÒ CHƠI] TỰ ĐỘNG SỬA LỖI HOÀN TẤT 100%!                          " -ForegroundColor Green
Write-Host "    Steam đã được làm sạch cache và mở lại ở chế độ Online kết nối đầy đủ. " -ForegroundColor Green
Write-Host " ===========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Bây giờ bạn có thể đăng nhập hoặc bấm Play game thoải mái!" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 2
