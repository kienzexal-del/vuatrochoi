Clear-Host
Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host "    [VUA TRO CHOI] - CONG CU KIEM TRA KET NOI STEAM & HE THONG              " -ForegroundColor Yellow
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Kiem tra tien trinh
Write-Host " [*] 1. Kiem tra tien trinh toi uu mang ngam..." -ForegroundColor Cyan
$p = Get-Process GameNetworkService -ErrorAction SilentlyContinue
if ($p) { 
    Write-Host "  [OK] GameNetworkService: DANG CHAY ON DINH (PID: $($p.Id))" -ForegroundColor Green 
} else { 
    Write-Host "  [!] GameNetworkService: CHUA CHAY! (Dich vu chua duoc bat hoac bi tat)" -ForegroundColor Red 
}

# 2. Kiem tra DNS
Write-Host "`n [*] 2. Kiem tra DNS Card mang..." -ForegroundColor Cyan
$dnsAdapters = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 }
foreach ($adapter in $dnsAdapters) {
    $dnsList = $adapter.ServerAddresses -join ', '
    if ($dnsList -match "8.8.8.8|1.1.1.1") {
        Write-Host "  [OK] $($adapter.InterfaceAlias) -> $dnsList (Tot)" -ForegroundColor Green
    } else {
        Write-Host "  [!] $($adapter.InterfaceAlias) -> $dnsList (Can doi sang 8.8.8.8)" -ForegroundColor Yellow
    }
}

# 3. Kiem tra phan giai DNS Steam
Write-Host "`n [*] 3. Kiem tra phan giai ten mien Steam..." -ForegroundColor Cyan
$res = Resolve-DnsName store.steampowered.com -ErrorAction SilentlyContinue | Select-Object -First 1
if ($res -and $res.IPAddress -notmatch "127\.0\.0\.1|::1") { 
    Write-Host "  [OK] Phan giai DNS: TOT (Tro den $($res.IPAddress) - CDN Noi Dia)" -ForegroundColor Green 
} else { 
    Write-Host "  [!] Phan giai DNS: NHA MANG DANG CHAN (Can doi DNS sang 8.8.8.8)" -ForegroundColor Yellow 
}

# 4. Kiem tra ket noi truc tiep cac may chu Steam
Write-Host "`n [*] 4. Kiem tra ket noi truc tiep den may chu Steam..." -ForegroundColor Cyan
$tests = @(
    @{ Name = "Steam Store (Cua hang)"; Url = "https://store.steampowered.com/" },
    @{ Name = "Steam Login (Dang nhap)"; Url = "https://login.steampowered.com/" },
    @{ Name = "Steam Community (Cong dong)"; Url = "https://steamcommunity.com/" },
    @{ Name = "Steam Web API (Xac thuc)"; Url = "https://api.steampowered.com/" }
)

$hasError = $false
foreach ($t in $tests) {
    try {
        $code = ""
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            $code = curl.exe -s -o NUL -w "%{http_code}" $t.Url --max-time 4
        } else {
            $req = [System.Net.HttpWebRequest]::Create($t.Url)
            $req.Timeout = 4000
            $req.UserAgent = "Mozilla/5.0"
            $resp = $req.GetResponse()
            $code = [string][int]$resp.StatusCode
            $resp.Close()
        }
        if ($code -match "200|302|404") {
            Write-Host "  [OK] $($t.Name): KET NOI TOT (HTTP $code)" -ForegroundColor Green
        } else {
            Write-Host "  [!] $($t.Name): BI CHAN HOAC TREO (HTTP $code)" -ForegroundColor Red
            $hasError = $true
        }
    } catch {
        Write-Host "  [!] $($t.Name): KHONG THE KET NOI" -ForegroundColor Red
        $hasError = $true
    }
}

Write-Host ""
Write-Host " ===========================================================================" -ForegroundColor Yellow
if (-not $p) {
    Write-Host "  KET LUAN: May khach CHUA BAT dich vu GameNetworkService!" -ForegroundColor Red
    Write-Host "  -> HUONG XU LY: Cho khach chay lai lenh cai: irm tinyurl.com/vtch-win | iex" -ForegroundColor Yellow
} elseif ($hasError) {
    Write-Host "  KET LUAN: May chu Steam bi nha mang chan mot phan!" -ForegroundColor Red
    Write-Host "  -> HUONG XU LY: Thoat han Steam, chay lai lenh cai dat ban moi nhat." -ForegroundColor Yellow
} else {
    Write-Host "  KET LUAN: He thong mang & dich vu VUA TRO CHOI hoan toan binh thuong!" -ForegroundColor Green
    Write-Host "  -> Neu Steam van bi xoay o man hinh dang nhap, day la do KET CACHE STEAM." -ForegroundColor Cyan
    Write-Host "  -> XU LY: Thoat Steam -> Xoa cache Steam (htmlcache) -> Dang nhap lai." -ForegroundColor White
}
Write-Host " ===========================================================================" -ForegroundColor Yellow
Write-Host ""
