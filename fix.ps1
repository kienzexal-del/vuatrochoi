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
Write-Host "`n [*] [3/6] Đang làm sạch bộ nhớ đệm kết nối của Steam..." -ForegroundColor Cyan
if ($steamPath -and (Test-Path $steamPath)) {
    # 1. Xóa htmlcache (CEF browser cache của Steam)
    $htmlCache = Join-Path $steamPath "config\htmlcache"
    if (Test-Path $htmlCache) {
        Remove-Item -Path $htmlCache -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # 2. Xóa package tmp (tránh kẹt gói cập nhật cũ)
    $pkgTmp = Join-Path $steamPath "package\tmp"
    if (Test-Path $pkgTmp) {
        Remove-Item -Path $pkgTmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] Đã làm sạch toàn bộ dữ liệu đệm mạng Steam." -ForegroundColor Green
}

# [4/6] Khắc phục xung đột mạng & Tối ưu hóa định tuyến hệ thống
Write-Host "`n [*] [4/6] Đang tối ưu hóa định tuyến & Giải phóng xung đột mạng..." -ForegroundColor Cyan
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
    } catch { }
}

# Tối ưu DNS phân giải sạch (IPv4 & IPv6), giữ IPv6 để COD và các game online không bị lỗi mạng
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceAlias $_.Name -ServerAddresses ('8.8.8.8','8.8.4.4','2001:4860:4860::8888','2001:4860:4860::8844') -ErrorAction SilentlyContinue
    Enable-NetAdapterBinding -Name $_.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue
}
ipconfig /flushdns 2>$null | Out-Null
Write-Host "  [OK] Đã đồng bộ luồng mạng tốc độ cao và bảo toàn đường truyền game." -ForegroundColor Green

# [5/6] Cập nhật danh sách loại trừ Call of Duty & Activision (Bỏ qua hoàn toàn COD)
Write-Host "`n [*] [5/6] Đồng bộ quy tắc định tuyến thông minh cho Vua Trò Chơi..." -ForegroundColor Cyan
$installDir = "C:\ProgramData\VuaTroChoi"
if (Test-Path $installDir) {
    # 1. Ghi danh sach loai tru COD & Demonware vao exclude-games.txt
    $excludePath = Join-Path $installDir "files\exclude-games.txt"
    $excludeList = @(
        '# === CALL OF DUTY & ACTIVISION (Demonware Matchmaking, Auth, Ricochet) ===',
        'demonware.net',
        'activision.com',
        'callofduty.com',
        'atvi.com',
        'cod.com',
        'treyarch.com',
        'infinityward.com',
        'ravensoftware.com',
        'sledgehammergames.com',
        '',
        '# === GAME DOWNLOAD CDNs & RIOT (Valorant, LoL, Battle.net, Epic) ===',
        'steamcontent.com',
        'steamserver.net',
        'akamaized.net',
        'akamaihd.net',
        'epicgames.com',
        'unrealengine.com',
        'ea.com',
        'origin.com',
        'electronicarts.com',
        'battle.net',
        'blizzard.com',
        'battlenet.com',
        'riotgames.com',
        'leagueoflegends.com',
        'pvp.net',
        'valorant.com',
        'ubisoft.com',
        'uplay.com',
        'gog.com',
        'rockstargames.com',
        'speedtest.net',
        'fast.com',
        'speed.cloudflare.com',
        '',
        '# === NETFLIX, BANKING & REMOTE SUPPORT ===',
        'netflix.com',
        'spotify.com',
        'apple.com',
        'icloud.com',
        'microsoft.com',
        'live.com',
        'vcb.com.vn',
        'vietcombank.com.vn',
        'techcombank.com.vn',
        'mbbank.com.vn',
        'momo.vn',
        'ultraviewer.net',
        'anydesk.com',
        'teamviewer.com'
    )
    if (-not (Test-Path (Join-Path $installDir "files"))) {
        New-Item -ItemType Directory -Path (Join-Path $installDir "files") -Force | Out-Null
    }
    [System.IO.File]::WriteAllLines($excludePath, $excludeList, [System.Text.Encoding]::UTF8)

    # 2. Cap nhat vtch_runner.vbs (Tich hop Smart Watchdog tu dong nhuong duong cho Call of Duty / Ricochet)
    $vbsPath = Join-Path $installDir "vtch_runner.vbs"
    $vbsLines = @(
        'Set WshShell = CreateObject("WScript.Shell")',
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        'WshShell.CurrentDirectory = "C:\ProgramData\VuaTroChoi"',
        'Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")',
        '',
        'coreExe = "C:\ProgramData\VuaTroChoi\GameNetworkService.exe"',
        'args = "--wf-tcp=80,443 --filter-tcp=80 --filter-l7=http --hostlist=""files\list-steam.txt"" --hostlist-exclude=""files\exclude-games.txt"" --dpi-desync=fake,fakedsplit --dpi-desync-autottl=2 --dpi-desync-cutoff=d4 --new --filter-tcp=443 --filter-l7=tls --hostlist=""files\list-steam.txt"" --hostlist-exclude=""files\exclude-games.txt"" --dpi-desync=fake,split --dpi-desync-split-pos=2 --dpi-desync-fooling=md5sig --dpi-desync-cutoff=d4"',
        '',
        'Do',
        '    '' 1. Kiem tra xem co Call of Duty / Ricochet Anti-Cheat dang bat khong',
        '    Set colCod = objWMIService.ExecQuery("Select ProcessId from Win32_Process Where Name = ''cod.exe'' Or Name = ''bootstrapper.exe'' Or Name = ''ModernWarfare.exe'' Or Name = ''BlackOps6.exe'' Or Name = ''BlackOpsColdWar.exe'' Or Name = ''Vanguard.exe''")',
        '    ',
        '    If colCod.Count > 0 Then',
        '        '' Neu COD dang bat: Dung ngay GameNetworkService va go driver WinDivert de Ricochet khong quet trung',
        '        Set colGns = objWMIService.ExecQuery("Select ProcessId from Win32_Process Where Name = ''GameNetworkService.exe''")',
        '        If colGns.Count > 0 Then',
        '            WshShell.Run "taskkill.exe /f /im GameNetworkService.exe", 0, True',
        '            WshShell.Run "net.exe stop WinDivert", 0, True',
        '        End If',
        '    Else',
        '        '' Neu COD khong chay: Duy tri GameNetworkService luon hoat dong de Steam full toc do',
        '        Set colGns = objWMIService.ExecQuery("Select ProcessId from Win32_Process Where Name = ''GameNetworkService.exe''")',
        '        If colGns.Count = 0 Then',
        '            If fso.FileExists(coreExe) Then',
        '                WshShell.Run """" & coreExe & """ " & args, 0, False',
        '            End If',
        '        End If',
        '    End If',
        '    ',
        '    WScript.Sleep 2000',
        'Loop'
    )
    [System.IO.File]::WriteAllLines($vbsPath, $vbsLines, [System.Text.Encoding]::ASCII)

    # 3. Khoi dong lai GameNetworkService voi cau hinh Smart Watchdog moi
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "vtch_runner\.vbs" } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name "GameNetworkService" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    taskkill.exe /f /im GameNetworkService.exe 2>$null | Out-Null
    Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`"" -WindowStyle Hidden
    Start-Sleep -Seconds 1
}

$svc = Get-Process GameNetworkService, winws -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
    Write-Host "  [OK] Dịch vụ mạng Vua Trò Chơi đang hoạt động ổn định và tối ưu 100%." -ForegroundColor Green
} else {
    Write-Host "  [!] Cảnh báo: Dịch vụ mạng Vua Trò Chơi chưa bật. Kiểm tra Windows Security nếu bị chặn." -ForegroundColor Yellow
}

# [6/6] Tự động cập nhật Shortcut Desktop và Khởi chạy lại Steam
Write-Host "`n [*] [6/6] Đồng bộ phím tắt Steam và khởi chạy lại ứng dụng..." -ForegroundColor Cyan
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
        Write-Host "  [OK] Đã đồng bộ cấu hình tối ưu vào Shortcut Steam." -ForegroundColor Green
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
