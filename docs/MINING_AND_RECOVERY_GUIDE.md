# ProofCash: Comprehensive Mining & Account Recovery Guide

**Author:** Ren Ishida (`renishida@proton.me`)  
**Protocol:** ProofCash (`PCASH`) — Layer-1 Autonomous Settlement  
**Canonical Radicle URN:** `rad:zHqa2hHCU4ARpLvjQCDNxJdc487F`  
**License:** MIT-0 / Unlicense (Public Domain Dedication)

---

## Table of Contents
1. [Overview](#1-overview)
2. [Mining Option 1: Mobile Edge Mining (PWA / In-Browser)](#2-mining-option-1-mobile-edge-mining-pwa--in-browser)
3. [Mining Option 2: CPU Reference Mining (Laptops & Desktops)](#3-mining-option-2-cpu-reference-mining-laptops--desktops)
4. [Mining Option 3: GPU High-Throughput Rig Mining (Plonky3 & Binius)](#4-mining-option-3-gpu-high-throughput-rig-mining-plonky3--binius)
5. [Mining Option 4: Cloud & Autonomous AI Agent Mining](#5-mining-option-4-cloud--autonomous-ai-agent-mining)
6. [Account Recovery: Why There Are No 24-Word Seed Phrases](#6-account-recovery-why-there-are-no-24-word-seed-phrases)
7. [Recovery Method 1: Native Passkey Cloud Sync (Automatic)](#7-recovery-method-1-native-passkey-cloud-sync-automatic)
8. [Recovery Method 2: Multi-Device Hardware Registration (Backup Enclaves)](#8-recovery-method-2-multi-device-hardware-registration-backup-enclaves)
9. [Recovery Method 3: Social & Guardian Threshold Recovery (M-of-N)](#9-recovery-method-3-social--guardian-threshold-recovery-m-of-n)
10. [Recovery Method 4: Exportable Encrypted Cold Keystore](#10-recovery-method-4-exportable-encrypted-cold-keystore)
11. [FAQ & Invariants](#11-faq--invariants)

---

## 1. Overview

ProofCash implements a **thermodynamic, ASIC-resistant consensus protocol** anchored to Blake3 Proof-of-Sequential-Work (PoSW) and Goldilocks Poseidon2 hashing. The network was engineered from first principles in October 2026 to ensure that mining can be performed across everyday hardware—from mobile smartphones to dedicated multi-core workstations—without being monopolized by centralized industrial ASIC warehouses.

Furthermore, ProofCash replaces obsolete, error-prone 24-word paper seed phrases with **Two-Tier Hardware Enclave Delegation** (FIDO2 / WebAuthn NIST P-256 + BabyJubjub in-circuit session keys).

---

## 2. Mining Option 1: Mobile Edge Mining (PWA / In-Browser)

The Mobile Edge Miner operates directly within any modern mobile web browser (iOS Safari, Android Chrome, Brave, Firefox) without requiring command-line tools or app store approvals.

### How It Works
* **Execution Engine:** Multi-threaded Web Workers running WebAssembly (Wasm) compiled with SIMD / ARM NEON vector extensions.
* **Access Point:** Navigate to `https://renishidaproject.github.io/proofcash/wallet/` (or `https://proofcash.xyz/wallet/` once domain is active) and select the **⚡ Mobile Edge Miner** tab.

### Operational Profiles
To protect your mobile battery longevity and thermal health, three configurable duty cycles are provided:

| Profile | Threads | CPU Throttling | Recommended Use Case |
| :--- | :--- | :--- | :--- |
| **Eco / Battery Safe** | 1 Core | 50% Duty Cycle | Background mining during daily phone usage; zero perceptible battery drain. |
| **Standard (Balanced)** | 2 Cores | 100% Active | Desktop or active mobile use while working or commuting. |
| **Nightstand Charger** | All Efficiency Cores | Max Throughput | Device connected to overnight charger. Emits **haptic vibration alerts** upon valid nonce discovery. |

### Step-by-Step Instructions
1. Open the ProofCash wallet on your mobile device.
2. Tap the **⚡ Mobile Edge Miner** tab.
3. Select your desired profile (e.g., *Nightstand Charger* before sleeping).
4. Tap **"Start Mobile Edge Mining"**.
5. When a candidate thermodynamic nonce meets the network target, the block is submitted and the block subsidy ($R(b) = 100 \cdot e^{-10^{-7}b}\text{ PCASH}$) is credited directly to your shielded Delta-UTXO balance.

---

## 3. Mining Option 2: CPU Reference Mining (Laptops & Desktops)

For home PCs, laptops, and Raspberry Pi 5 clusters, the native Rust consensus implementation provides high-throughput Blake3 PoSW execution.

### Prerequisites
* Rust toolchain (Rust 1.80+ or later):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### Step-by-Step Instructions
1. Clone the repository via Git or Radicle P2P:
   ```bash
   # Via Radicle sovereign P2P
   rad clone rad:zHqa2hHCU4ARpLvjQCDNxJdc487F
   cd proofcash

   # OR via GitHub mirror
   git clone https://github.com/Renishidaproject/proofcash.git
   cd proofcash
   ```

2. Compile the optimized release binary:
   ```bash
   cargo build --release -p proofcash-node
   ```

3. Start mining with your recipient address and desired CPU thread count:
   ```bash
   ./target/release/proofcash-node \
     --mine \
     --threads 8 \
     --reward-addr pc1q8fa3028d7b321a00ef923c4d5e6f7a8b9c0d1e2f \
     --rpc-connect http://127.0.0.1:8332
   ```

### Why CPUs Remain Competitive
ProofCash interleaves fast Blake3 sequential hashing with Goldilocks Poseidon2 memory-hard lookups. This structure exploits the large, ultra-low-latency L1/L2/L3 cache hierarchies of modern desktop processors (AMD Zen 4/5, Intel Core Ultra, Apple M-series), rendering fixed-function ASIC hashing cost-inefficient.

---

## 4. Mining Option 3: GPU High-Throughput Rig Mining (Plonky3 & Binius)

High-performance mining rigs utilize consumer gaming GPUs to perform two simultaneous operations:
1. Fast PoSW candidate nonce generation.
2. Folding recursive zero-knowledge validity STARK proofs ($\approx 43.2\text{ KB}$) over binary tower fields ($\mathbb{F}_{2^8}, \mathbb{F}_{2^{64}}$).

### Hardware Requirements
* **GPU:** NVIDIA GeForce RTX 3060, RTX 4070, RTX 4090, AMD Radeon RX 7000-series, or Apple M-series Max/Ultra.
* **VRAM:** $< 12\text{ GB}$ (specifically engineered to fit comfortably within commodity consumer cards).
* **OS:** Linux (Ubuntu 22.04 / 24.04 recommended) or Windows 11 with CUDA / Vulkan drivers.

### Step-by-Step Instructions
1. Navigate to the GPU prover crate:
   ```bash
   cd proofcash/crates/proofcash-circuits
   ```

2. Build with CUDA acceleration (or Vulkan for AMD/Apple):
   ```bash
   # For NVIDIA GPUs
   cargo build --release --features cuda

   # For AMD / Vulkan
   cargo build --release --features vulkan
   ```

3. Launch the high-throughput GPU worker:
   ```bash
   ./target/release/proofcash-gpu-miner \
     --gpu-device 0 \
     --reward-addr pc1q... \
     --batch-size 65536
   ```

GPU miners receive both the base block subsidy and priority thermodynamic execution fees from commutative Delta-UTXO transaction bundles.

---

## 5. Mining Option 4: Cloud & Autonomous AI Agent Mining

ProofCash is designed for the autonomous machine economy. AI clusters and server farms (AWS, Hetzner, GCP) can participate headlessly via the JSON-RPC daemon.

### Features for Autonomous AI Agents
* **Energy-Bonded Streaming:** Agents can lock off-chain energy bonds ($10{,}000\text{ pJ}$) to stream fractional mining shares directly to Stratum pool coordinators.
* **No Halving Shocks:** Unlike Bitcoin's sudden 4-year halving cliffs, ProofCash employs continuous thermodynamic decay ($R(b) = 100 \cdot e^{-10^{-7}b}$), automatically stabilized by an on-chain Proportional-Integral-Derivative (PID) Fee Reservoir. This guarantees continuous revenue predictability for automated infrastructure budgets.

### Running the Headless Daemon
```bash
# Launch background consensus daemon
proofcashd --daemon --listen 0.0.0.0:8332 --max-peers 64

# Query network mining difficulty and block template via JSON-RPC
curl -s -X POST http://127.0.0.1:8332 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblocktemplate","params":[],"id":1}'
```

---

## 6. Account Recovery: Why There Are No 24-Word Seed Phrases

In legacy blockchain networks, users are forced to write down 24 English words on paper. In practice:
* Paper gets lost, destroyed by fire/water, or stolen.
* Users get phished by fake websites asking for their seed phrase.
* Non-technical users cannot securely store physical keys.

**ProofCash eliminates seed phrases entirely.** Security is rooted in **Two-Tier Hardware Enclave Delegation**:
1. **Tier 1 (Hardware Root):** The non-extractable biometric chip (Apple Secure Enclave, Google Titan / Android StrongBox, Windows Hello, YubiKey) generates a NIST P-256 key that never leaves the silicon.
2. **Tier 2 (In-Circuit Session Key):** An ephemeral BabyJubjub key signed by the enclave at a ZK constraint budget of only $1{,}842$ constraints ($< 45\text{ ms}$ on mobile).

---

## 7. Recovery Method 1: Native Passkey Cloud Sync (Automatic)

Under the FIDO Alliance WebAuthn standard, hardware passkeys are **end-to-end encrypted multi-device credentials**.

### How Recovery Works If You Lose Your Phone
1. **Apple Users (iPhone / iPad / Mac):**
   * If your iPhone is lost, destroyed, or stolen, purchase a new Apple device.
   * Sign in with your **Apple ID**.
   * Apple restores your encrypted **iCloud Keychain**.
   * Open the ProofCash wallet: your biometric sensor (Touch/Face) recognizes the existing passkey credential immediately. Your balance and eUTXOs are restored instantly.
2. **Android Users (Pixel / Samsung / Xiaomi):**
   * Log into your new Android phone with your **Google Account**.
   * Your passkey is restored via **Google Password Manager**.
   * Open the ProofCash wallet and authenticate with your fingerprint.
3. **Password Manager Users (1Password, Bitwarden, Dashlane):**
   * Passkeys sync securely across platforms (e.g., from Android to iPhone or Windows to Mac).

---

## 8. Recovery Method 2: Multi-Device Hardware Registration (Backup Enclaves)

ProofCash allows registering multiple independent hardware roots for a single wallet identity:
* You can register:
  * Primary Phone (Platform Biometrics)
  * Work Laptop (MacBook TouchID / Windows Hello)
  * Physical Hardware Key (YubiKey 5C NFC)

### How Recovery Works
If your primary phone falls into the ocean:
1. Open the ProofCash wallet on your laptop or insert your YubiKey.
2. Authenticate using the secondary device.
3. Because the secondary device is already an authorized enclave delegate, you have full custody of your funds.
4. From the settings panel, revoke the lost phone's credential ID and authorize your new phone.

---

## 9. Recovery Method 3: Social & Guardian Threshold Recovery (M-of-N)

At the consensus protocol layer, ProofCash supports **$M$-of-$N$ Threshold Delegation Certificates**:
* You can designate trusted guardians (e.g., 2 family members, an attorney, or a cold air-gapped device in a bank vault).
* If you lose all your devices simultaneously:
  1. Generate a fresh passkey on your new device.
  2. The $M$-of-$N$ guardians sign an in-circuit ZK recovery certificate authorizing the transfer of UTXO ownership to your new credential.
  3. Guardians can **never steal your funds**—they only possess the authority to approve a key rotation, subject to an on-chain 48-hour time-lock delay during which you can cancel fraudulent attempts.

---

## 10. Recovery Method 4: Exportable Encrypted Cold Keystore

For users who refuse cloud synchronization or require air-gapped cold storage:
1. Open the ProofCash wallet Settings.
2. Click **Export Encrypted Keystore**.
3. Set a high-entropy password (256-bit AES-GCM encryption).
4. Save the resulting `.json` file or print the encrypted paper QR code to an offline safe.
5. On any new device, select **Import Keystore**, enter your password, and re-bind custody to the new hardware enclave.

---

## 11. FAQ & Invariants

#### Where do my coins actually live?
Your coins **never live inside your phone's battery or browser cache**.  
They are recorded on the global, decentralized ProofCash blockchain as shielded **Commutative Delta-UTXOs**. Your phone only holds the cryptographic key that authorizes spending.

#### How fast is wallet recovery?
Because ProofCash uses recursive STARK validity proofs over binary tower fields, chain state is compressed to a constant size of $\approx 43.2\text{ KB}$. A fresh device recovers and verifies the entire historical chain from Genesis (Block #0) in **under 10 milliseconds**.

#### What if the web wallet site is down?
The wallet is an installable **Progressive Web App (PWA)** that operates completely offline using Service Workers. You can connect it to your own local node (`http://127.0.0.1:8332`) or any community seed node on the Radicle P2P network.
