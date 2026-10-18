#!/usr/bin/env bash
# ==============================================================================
# ProofCash Sovereign Reference Node (proofcashd) Automated Setup Script
# Configures a 24/7 background node daemon and secure JSON-RPC reverse proxy.
#
# Supported OS: Ubuntu 22.04 / 24.04 LTS, Debian 12
# Author: Ren Ishida (October 2026)
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-rpc.proofcash.org}"
EMAIL="${2:-renishida@proton.me}"
NETWORK="${3:-mainnet}"

echo "=================================================================="
echo "  PROOFCASHD TURNKEY NODE INSTALLER                              "
echo "  Target Domain:  ${DOMAIN}                                       "
echo "  Network Mode:   ${NETWORK}                                      "
echo "  Admin Contact:  ${EMAIL}                                        "
echo "=================================================================="

# 1. Install prerequisites
echo "-> [1/6] Installing build essentials, git, nginx, and certbot..."
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential git curl nginx certbot python3-certbot-nginx

# 2. Install Rust toolchain if not present
if ! command -v cargo &> /dev/null; then
    echo "-> [2/6] Installing Rust compiler toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "-> [2/6] Rust compiler already installed ($(cargo --version))."
fi

# 3. Clone or pull latest ProofCash repository
echo "-> [3/6] Fetching latest ProofCash source from GitHub..."
BUILD_DIR="/tmp/proofcash-build"
rm -rf "$BUILD_DIR"
git clone --depth 1 https://github.com/renishidaproject/proofcash.git "$BUILD_DIR"

# 4. Compile proofcashd
echo "-> [4/6] Compiling proofcashd with release optimizations..."
cd "$BUILD_DIR/proofcash/crates/proofcash-node"
cargo build --release
sudo cp target/release/proofcashd /usr/local/bin/proofcashd
sudo chmod +x /usr/local/bin/proofcashd

# 5. Create Systemd Service for 24/7 continuous operation
echo "-> [5/6] Creating systemd service for proofcashd..."
DATA_DIR="/var/lib/proofcash/data"
sudo mkdir -p "$DATA_DIR"

sudo tee /etc/systemd/system/proofcashd.service > /dev/null << EOF
[Unit]
Description=ProofCash Sovereign Reference Node Daemon
After=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=/usr/local/bin/proofcashd --network ${NETWORK} --datadir ${DATA_DIR} --rpc-port 8332 --daemon
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now proofcashd

# 6. Configure Nginx reverse proxy with 64 KB anti-DoS cap
echo "-> [6/6] Configuring Nginx reverse proxy and SSL certificate for ${DOMAIN}..."
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

sudo tee "$NGINX_CONF" > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 64k;

    location / {
        proxy_pass http://127.0.0.1:8332;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Request Let's Encrypt SSL certificate if DNS is pointed
echo "-> Requesting automated SSL certificate from Let's Encrypt..."
if sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect; then
    echo "✓ SSL Certificate successfully acquired and HTTPS activated!"
else
    echo "⚠️ Warning: Certbot was unable to acquire an SSL certificate automatically."
    echo "   Ensure your DNS A-Record for '${DOMAIN}' points to this server's public IP,"
    echo "   then run: sudo certbot --nginx -d ${DOMAIN}"
fi

echo ""
echo "=================================================================="
echo "✓ PROOFCASHD NODE DEPLOYMENT COMPLETE!                            "
echo "  RPC URL:       https://${DOMAIN}/                               "
echo "  Node Status:   sudo systemctl status proofcashd                 "
echo "  Node Logs:     sudo journalctl -u proofcashd -f                 "
echo "=================================================================="
