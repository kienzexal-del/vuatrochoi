#!/bin/bash
if [ "$(id -u)" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

echo " [+] Dang go bo VUA TRO CHOI khoi he thong Linux..."
systemctl stop gamesvc.service 2>/dev/null || true
systemctl disable gamesvc.service 2>/dev/null || true
rm -f /etc/systemd/system/gamesvc.service
systemctl stop vuatrochoi.service 2>/dev/null || true
systemctl disable vuatrochoi.service 2>/dev/null || true
rm -f /etc/systemd/system/vuatrochoi.service
systemctl daemon-reload

pkill -f "gamesvc" 2>/dev/null || true
pkill -f "$(echo bmZxd3M= | base64 -d)" 2>/dev/null || true

iptables -t mangle -D OUTPUT -p tcp -m multiport --dports 80,443 -m mark ! --mark 0x40000000/0x40000000 -j NFQUEUE --queue-num 220 --queue-bypass 2>/dev/null || true
ip6tables -t mangle -D OUTPUT -p tcp -m multiport --dports 80,443 -m mark ! --mark 0x40000000/0x40000000 -j NFQUEUE --queue-num 220 --queue-bypass 2>/dev/null || true

rm -rf /opt/vuatrochoi
sed -i '/# Steam Clean IPs/,+5d' /etc/hosts 2>/dev/null || true

echo " [OK] Da go cai dat thanh cong!"