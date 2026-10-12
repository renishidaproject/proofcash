# ProofCash: Official Domain Setup & Integration Guide (proofcash.xyz)

**Author:** Ren Ishida (`renishida@proton.me`)  
**Target Domain:** `proofcash.xyz`  
**Protocol:** ProofCash (`PCASH`) — Layer-1 Autonomous Settlement  
**Canonical Radicle URN:** `rad:zHqa2hHCU4ARpLvjQCDNxJdc487F`  
**License:** MIT-0 / Unlicense (Public Domain Dedication)

---

## Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [Step 1: Domain Registration & DNS Records Configuration](#2-step-1-domain-registration--dns-records-configuration)
3. [Step 2: Connecting GitHub Pages to proofcash.xyz (Zero-Cost Hosting & SSL)](#3-step-2-connecting-github-pages-to-proofcashorg-zero-cost-hosting--ssl)
4. [Step 3: WebAuthn Passkey Relying Party Domain Binding](#4-step-3-webauthn-passkey-relying-party-domain-binding)
5. [Step 4: Launching the Public P2P Seed Node (seed.proofcash.xyz:8776)](#5-step-4-launching-the-public-p2p-seed-node-seedproofcashorg8776)
6. [Step 5: Launching the High-Speed JSON-RPC Gateway (rpc.proofcash.xyz:443)](#6-step-5-launching-the-high-speed-json-rpc-gateway-rpcproofcashorg443)
7. [Step 6: Updating Client Wallets & Node Defaults](#7-step-6-updating-client-wallets--node-defaults)
8. [Step 7: Censorship-Immunity & Localhost Fallback Guarantees](#8-step-7-censorship-immunity--localhost-fallback-guarantees)

---

## 1. Overview & Architecture

When the creator or a community crypto enthusiast acquires `proofcash.xyz`, the domain serves as the high-availability "front door" for the general public, light mobile clients, and developer tooling.

The complete infrastructure distributes across four dedicated endpoints:

```
                            ┌─────────────────────────────┐
                            │       proofcash.xyz         │
                            │      (Registered DNS)       │
                            └──────────────┬──────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│  TIER 1: PORTAL  │             │  TIER 2: RPC API │             │  TIER 3: SEEDS   │
│  proofcash.xyz   │             │ rpc.proofcash.xyz│             │seed.proofcash.xyz│
│ GitHub Pages CDN │             │ Reverse Proxy    │             │ P2P Gossip Node  │
│ (Wallet & Docs)  │             │ port 443 -> 8332 │             │   port 8776      │
│ Free SSL/TLS     │             │ Shielded eUTXOs  │             │ Block Discovery  │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

---

## 2. Step 1: Domain Registration & DNS Records Configuration

### Where to Buy
Any reputable domain registrar can be used:
* **Cloudflare Registrar** (Recommended: at-cost pricing, built-in DDoS protection, DNSSEC, and global Anycast DNS).
* **Namecheap**, **Porkbun**, or **Njalla** (for privacy-focused registration).

### Recommended DNS Zone Table
Configure the following records in your DNS manager (Cloudflare / Namecheap):

| Type | Name / Host | Target / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (apex) | `185.199.108.153` | Auto | GitHub Pages CDN IP 1 |
| **A** | `@` (apex) | `185.199.109.153` | Auto | GitHub Pages CDN IP 2 |
| **A** | `@` (apex) | `185.199.110.153` | Auto | GitHub Pages CDN IP 3 |
| **A** | `@` (apex) | `185.199.111.153` | Auto | GitHub Pages CDN IP 4 |
| **CNAME** | `www` | `renishidaproject.github.io` | Auto | WWW redirection to apex |
| **A** | `seed` | `<YOUR_VPS_PUBLIC_IPV4>` | Auto | P2P Seed Node gossip |
| **AAAA** | `seed` | `<YOUR_VPS_PUBLIC_IPV6>` | Auto | IPv6 P2P Seed Node gossip |
| **A** | `rpc` | `<YOUR_VPS_PUBLIC_IPV4>` | Auto | Public JSON-RPC Gateway |
| **CAA** | `@` | `0 issue "letsencrypt.org"` | Auto | SSL Certificate Authority |

---

## 3. Step 2: Connecting GitHub Pages to proofcash.xyz (Zero-Cost Hosting & SSL)

Because the full repository, documentation, simulator, and mobile wallet are already deployed on GitHub Pages, connecting `proofcash.xyz` requires **zero ongoing hosting costs**.

### Automated Link Procedure
1. Create a `CNAME` file in the root of the repository containing the domain name:
   ```text
   proofcash.xyz
   ```
2. Commit and push the file to branch `main`.
3. Open the GitHub repository settings:
   * Navigate to: `https://github.com/Renishidaproject/proofcash/settings/pages`
   * Under **Custom domain**, enter: `proofcash.xyz`
   * Click **Save**.
4. GitHub checks DNS propagation automatically. Once verified, check the box:
   * **[x] Enforce HTTPS**
5. GitHub will automatically request and renew a free **Let's Encrypt TLS certificate**.

*Both `https://proofcash.xyz` and `https://proofcash.xyz/wallet/` are now live with A+ SSL ratings.*

---

## 4. Step 3: WebAuthn Passkey Relying Party Domain Binding

WebAuthn hardware passkeys (Platform Biometrics, Touch, Windows Hello) are cryptographically tied to the Relying Party ID (`rp.id`).

* When running on `localhost`, the passkey is labeled `localhost`.
* When served from `https://proofcash.xyz`, the browser passes:
  ```javascript
  const publicKeyCredentialCreationOptions = {
    rp: {
      name: "ProofCash Protocol",
      id: "proofcash.xyz" // Automatically inferred from window.location.hostname
    },
    user: {
      id: crypto.getRandomValues(new Uint8Array(16)),
      name: "ren_ishida",
      displayName: "ProofCash Sovereign Holder"
    },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256 (NIST P-256)
    authenticatorSelection: {
      authenticatorAttachment: "platform", // Hardware Secure Enclave
      userVerification: "required",
      residentKey: "required"
    }
  };
  ```
* **User Experience:** When users add ProofCash to their phone home screen, iOS and Android automatically recognize `proofcash.xyz` and back up the credential in **iCloud Keychain** and **Google Password Manager**.

---

## 5. Step 4: Launching the Public P2P Seed Node (seed.proofcash.xyz:8776)

Seed nodes maintain high uptime to accept inbound connections from new miners and wallets, announcing the latest canonical block hashes and Radicle commits.

### Minimal Server Specifications
* **CPU:** 1-2 vCPUs
* **RAM:** 2 GB
* **Storage:** 40 GB SSD
* **Bandwidth:** 1 TB/month (e.g., $4-$5/month on Hetzner Cloud or DigitalOcean)
* **OS:** Ubuntu 22.04 LTS

### Deployment with Docker
Run the pre-configured container with port 8776 exposed:

```bash
# 1. Pull or build the ProofCash node container
docker pull ghcr.io/renishidaproject/proofcash-radicle:latest

# 2. Run the persistent background seed daemon
docker run -d \
  --name proofcash-seed-node \
  --restart always \
  -p 8776:8776 \
  -v /var/lib/proofcash/radicle:/root/.radicle \
  proofcash-radicle \
  radicle-node --listen 0.0.0.0:8776 --force
```

### Firewall Configuration (UFW)
Ensure port `8776` is open for P2P traffic:
```bash
sudo ufw allow 8776/tcp comment "ProofCash P2P Seed Port"
sudo ufw reload
```

Verify that the node is listening:
```bash
docker exec proofcash-seed-node rad node status
```

---

## 6. Step 5: Launching the High-Speed JSON-RPC Gateway (rpc.proofcash.xyz:443)

Mobile wallets and lightweight edge miners need to submit transactions, evaluate Plonky3 AIR constraints, and query Delta-UTXO state without running a heavy full node locally.

### 1. Run the Consensus Daemon
```bash
# Run proofcashd listening on local port 8332
./proofcashd \
  --rpc-bind 127.0.0.1:8332 \
  --rpc-cors "https://proofcash.xyz" \
  --datadir /var/lib/proofcash/chaindata
```

### 2. Configure Caddy or Nginx with Automatic HTTPS
Using **Caddy** (simplest 4-line configuration with automatic Let's Encrypt certificates):

```caddyfile
# /etc/caddy/Caddyfile
rpc.proofcash.xyz {
    reverse_proxy 127.0.0.1:8332 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
    }

    # Enable CORS for the web wallet
    header {
        Access-Control-Allow-Origin "https://proofcash.xyz"
        Access-Control-Allow-Methods "POST, GET, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
}
```

Start Caddy:
```bash
sudo systemctl restart caddy
```

---

## 7. Step 6: Updating Client Wallets & Node Defaults

Once `rpc.proofcash.xyz` is live, update the default configuration in `wallet/wallet-engine.js`:

```javascript
// wallet/wallet-engine.js
class ProofCashWalletEngine {
  constructor() {
    this.crypto = new PasskeyCrypto();
    this.STORAGE_KEY = 'proofcash_wallet_v1';
    
    // Production Public RPC Endpoint with Localhost Failover
    this.DEFAULT_RPC = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:8332'
      : 'https://rpc.proofcash.xyz';
    ...
```

Users can open the in-wallet **⚙️ Network & Node Settings** modal at any time to point to their own local `http://127.0.0.1:8332` node or an alternative community RPC.

---

## 8. Step 7: Censorship-Immunity & Localhost Fallback Guarantees

ProofCash was engineered with a strict principle of **Sovereign Independence**:

1. **No Single Point of Failure:** If the domain `proofcash.xyz` is expired, hijacked, or blocked by regional firewalls:
   * The network does not stop.
   * Full nodes continue syncing over P2P gossip on port `8776` via raw IP addresses.
2. **P2P Code Distribution via Radicle:**
   * All code updates, issues, and patches sync over Radicle:
     ```bash
     rad clone rad:zHqa2hHCU4ARpLvjQCDNxJdc487F
     ```
3. **Localhost Independence:**
   * Every user can run `proofcashd` on `127.0.0.1:8332`. The wallet will connect to `localhost` automatically, verifying zero-knowledge validity proofs with 100% mathematical autonomy.
