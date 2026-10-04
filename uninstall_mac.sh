#!/bin/bash
if [ "$(id -u)" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

echo " [+] Dang go bo VUA TRO CHOI khoi macOS..."
launchctl unload -w /Library/LaunchDaemons/com.gamenetwork.optimizer.plist 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.gamenetwork.optimizer.plist
launchctl unload -w /Library/LaunchDaemons/com.vuatrochoi.daemon.plist 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.vuatrochoi.daemon.plist
pkill -f "gamesvc" 2>/dev/null || true
pkill -f "$(echo dHB3cw== | base64 -d)" 2>/dev/null || true

SERVICES=$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 || true)
IFS=$'\n'
for s in $SERVICES; do
    if [ -n "$s" ] && [[ "$s" != *"*"* ]]; then
        networksetup -setsocksfirewallproxystate "$s" off 2>/dev/null || true
    fi
done
unset IFS

rm -rf "/Library/Application Support/VuaTroChoi"
sed -i '' '/# Steam Clean IPs/,+5d' /etc/hosts 2>/dev/null || true

echo " [OK] Da go cai dat thanh cong!"