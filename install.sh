#!/bin/bash
# Universal entry point for Unix (Linux / Steam Deck & macOS)
OS="$(uname -s)"
case "$OS" in
    Linux*)
        echo " [+] Nhan dien he dieu hanh: Linux / Steam Deck"
        exec bash <(curl -sSL "https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/install_linux.sh") "$@"
        ;;
    Darwin*)
        echo " [+] Nhan dien he dieu hanh: macOS (Apple Silicon / Intel)"
        exec bash <(curl -sSL "https://raw.githubusercontent.com/kienzexal-del/vuatrochoi/main/install_mac.sh") "$@"
        ;;
    *)
        echo " [-] He dieu hanh $OS chua duoc ho tro."
        exit 1
        ;;
esac