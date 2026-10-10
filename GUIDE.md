# ProofCash (PCASH): Comprehensive User Guide & Jargon Buster

> **Autonomous Thermodynamic Settlement for Humans & Machines**  
> *Author: Ren Ishida (2026) | Version: v1.4.0*

Welcome to **ProofCash**. This guide explains every feature, button, and concept in plain English so anyone—regardless of prior cryptocurrency experience—can confidently use, mine, transfer, and interact with the protocol.

---

## Table of Contents
1. [What is ProofCash in Plain English?](#1-what-is-proofcash-in-plain-english)
2. [Jargon Buster: De-Coding the Crypto Terminology](#2-jargon-buster-de-coding-the-crypto-terminology)
3. [Step-by-Step Feature Walkthrough](#3-step-by-step-feature-walkthrough)
   - [A. Creating & Managing Vaults (Multi-Account)](#a-creating--managing-vaults-multi-account)
   - [B. Getting Testnet Coins (Faucet & Mining)](#b-getting-testnet-coins-faucet--mining)
   - [C. Sending & Receiving Shielded PCASH](#c-sending--receiving-shielded-pcash)
   - [D. Instant eUTXO Transfer Vouchers (Air-Gap Transfer)](#d-instant-eutxo-transfer-vouchers-air-gap-transfer)
   - [E. Mobile & Edge Thermodynamic Mining](#e-mobile--edge-thermodynamic-mining)
   - [F. Two-Tier Biometric Passkey Enclave](#f-two-tier-biometric-passkey-enclave)
   - [G. Encrypted Keystore Backup & Cloud Storage](#g-encrypted-keystore-backup--cloud-storage)
   - [H. AI Micro-Payment Streaming Channels](#h-ai-micro-payment-streaming-channels)
   - [I. Public Ledger Explorer & AIR Verifier](#i-public-ledger-explorer--air-verifier)
4. [Testnet vs. Mainnet Consensus](#4-testnet-vs-mainnet-consensus)
5. [Frequently Asked Questions (FAQ)](#5-frequently-asked-questions-faq)

---

## 1. What is ProofCash in Plain English?

Traditional cryptocurrencies have two major problems:
1. **They are cumbersome for humans:** They force you to write down complex 12-word seed phrases on paper. If you lose them, your money is gone forever. If malware reads them, your money is stolen.
2. **They are too slow and expensive for AI agents:** High transaction fees and slow block confirmations make it impossible for autonomous AI agents to pay each other fractions of a cent per token in real time.

**ProofCash solves both:**
- **Zero Seed Phrases:** It secures your wallet using your device's built-in **Hardware Biometrics** (Face, Fingerprint, Touch ID, Windows Hello) via WebAuthn passkeys.
- **Thermodynamic Backing:** Every coin is minted purely through verifiable computation (**Proof-of-Succinct-Work**). There is **strictly 0 pre-mine**—founders and investors received 0 coins before launch.
- **Instant AI Micro-Streaming:** Allows continuous payments at nano-costs ($0.000001\text{ PCASH}$ per token) with zero block confirmation overhead.
- **Zero External Dependencies:** The wallet is a standalone PWA (Progressive Web App) that runs completely inside your browser with client-side Zero-Knowledge cryptography.

---

## 2. Jargon Buster: De-Coding the Crypto Terminology

| Jargon | What It Means in Plain English |
| :--- | :--- |
| **PCASH** | The native currency of ProofCash. The total supply is mathematically capped at $1,000,000,000\text{ PCASH}$. |
| **Pico-Joules (pJ)** | The smallest subdivision of ProofCash ($1\text{ PCASH} = 1,000,000,000,000\text{ pJ}$). Like cents to a dollar or satoshis to a bitcoin. Represents thermodynamic energy units. |
| **eUTXO** | **Extended Unspent Transaction Output**. Think of eUTXOs like physical cash bills in your pocket. If you have a \$10 bill and pay \$3, you receive a \$7 bill back as change. This allows transactions to process in parallel without account lockups. |
| **ZK-STARK** | **Zero-Knowledge Scalable Transparent Argument of Knowledge**. A cryptographic mathematical proof that verifies a payment is 100% genuine and covered by real funds without revealing who sent it, who received it, or the exact balance. |
| **AIR Constraints** | **Algebraic Intermediate Representation**. The mathematical equations evaluated by the zero-knowledge circuit. ProofCash uses only **1,842 constraints**, allowing your phone to generate spend proofs in under 45 milliseconds without overheating! |
| **Nullifier** | A cryptographic serial number revealed when an eUTXO bill is spent. It marks the bill as "used" so nobody can ever spend the same coin twice, while keeping the owner completely anonymous. |
| **Commitment** | The cryptographic "envelope" hiding the value and recipient of an unspent coin on the blockchain. |
| **PoSW** | **Proof-of-Succinct-Work**. The energy-efficient mining mechanism where your phone or computer solves cryptographic Blake3 puzzles to discover blocks and receive newly minted PCASH subsidies. |
| **Passkey / Enclave** | The tamper-proof cryptographic hardware chip inside your phone or PC (Apple Secure Enclave, Android Titan M, Windows TPM). Your private biometric signature never leaves the chip and is never transmitted over the internet. |
| **Two-Tier Delegation** | A system where your hardware biometric key authorizes a fast, temporary session key for 24 hours. You only tap biometrics once, and all your payments within that day sign instantly in < 45ms. |
| **Zero Pre-Mine** | Founders, developers, venture capitalists, and creators received **0.0000 PCASH** at launch. All coins in existence must be earned through mining or received from peers. |

---

## 3. Step-by-Step Feature Walkthrough

### A. Creating & Managing Vaults (Multi-Account)
ProofCash lets you manage multiple separate vaults within a single wallet:
1. **Active Vault Dropdown:** Click the **Vault:** selector on the main screen to see all your accounts.
2. **Create a New Vault:** Click **`+ New Vault`** and give it a label (e.g., *"Daily Spending"*, *"Savings"*, *"Merchant Store"*).
3. **Instant Isolation:** Each vault receives its own unique shielded address (`pc1q...`) and ledger history, keeping your spending private and organized.

---

### B. Getting Testnet Coins (Faucet & Mining)
Fresh accounts start with `0.0000 PCASH` (no hardcoded balances). You can acquire coins in two ways:
1. **The Testnet Faucet:** Click the **`[🚰 +50 Faucet]`** button on the home screen. In 1 second, your balance will increase by **+50.0000 PCASH**.
2. **Mobile Edge Mining:** Click the **`Miner`** tab, select a thermal profile, and click **`Start Mobile Edge Mining`** to mine real block rewards (+100.0 PCASH per block).

---

### C. Sending & Receiving Shielded PCASH
1. **To Send:**
   - Click **`[Send]`** on the main balance card.
   - Enter the recipient's address (`pc1q...`) or AI agent URI (`agent://...`).
   - Enter the amount (e.g. `10.0`).
   - Click **`Sign & Broadcast Shielded Spend`**.
   - Your device computes the 1,842 ZK constraints, signs the transaction with your biometric session key, and deducts the balance.
2. **To Receive:**
   - Click **`[Receive]`** on the main balance card.
   - Show the QR code to the sender or click **`📋 Copy Address to Clipboard`** and send it to them via message or email.

---

### D. Instant eUTXO Transfer Vouchers (Air-Gap Transfer)
If you are transferring coins to a friend, or between two different browsers/phones where internet connectivity, ad-blockers, or private tabs block automatic network relays:
1. **Sender:** When you click **Send**, a receipt card appears displaying your **🎟️ eUTXO Transfer Voucher**. Click **`📋 Copy`** to copy the voucher code (`PCASH-VOUCHER:ey...`).
2. **Receiver:** Open the **Receive** modal, paste the voucher code into the **Instant Voucher Redemption** box, and click **`⚡ Redeem Voucher`**.
3. **Result:** The funds reflect in the receiver's balance immediately with 100% cryptographic certainty!

---

### E. Mobile & Edge Thermodynamic Mining
ProofCash allows ordinary smartphones and consumer laptops to mine without massive server farms:
1. Navigate to the **`Miner`** tab.
2. Choose your **Device Thermal & Battery Profile**:
   - **Eco / Battery Safe:** Uses 1 lightweight thread with throttled duty cycles. Safe for battery life during normal day use.
   - **Standard (Balanced):** Balanced multi-threaded hashing for laptops or active desktop usage.
   - **Nightstand (Plugged In):** Unthrottled maximum hashrate. Recommended when your device is connected to a charger overnight.
3. Click **`Start Mobile Edge Mining`**.
4. When your device solves a block, your phone vibrates (if enabled) and **+100.0000 PCASH** is credited straight into your active vault.

---

### F. Two-Tier Biometric Passkey Enclave
ProofCash eliminates vulnerable seed phrases:
- **Tier 1 (Root Enclave):** Your device's Secure Enclave / Windows Hello hardware signs a 24-hour cryptographic certificate.
- **Tier 2 (In-Circuit Session Key):** An ephemeral BabyJubjub key that generates ZK proofs in < 45ms.
- **Automatic Renewal:** When the session expires after 144 blocks (~24 hours), the wallet seamlessly prompts for your biometric scan (Face/Touch/PIN) to renew the session.

---

### G. Encrypted Keystore Backup & Cloud Storage
How to protect your wallet against losing your device:
1. Click **`[💾 Backup & Recovery]`** on the main screen.
2. Under **Export Backup**, set a secure passphrase (min 6 characters).
3. **Save to Cloud Storage:** Click **`☁️ Save to Google / Apple Cloud`**.
   - The backup is sealed with military-grade **AES-256-GCM (100,000 PBKDF2 rounds)**.
   - It is mathematically safe to store in **Google Drive**, **Apple iCloud Drive**, or **Dropbox**. Even if someone gains access to your cloud drive, they cannot open the wallet without your passphrase.
4. **Restore:** On any new device, click **Restore from File**, choose your `.json` backup file, enter your passphrase, and all your vaults and coins are restored instantly.
5. **24-Word ZK Phrase:** Under the **24-Word ZK Phrase** subtab, you can also view and write down an air-gapped mnemonic seed on paper as a cold-storage backup.

---

### H. AI Micro-Payment Streaming Channels
ProofCash is the native currency for autonomous AI agents:
1. Navigate to the **`AI Stream`** tab.
2. Set the target AI agent URI (e.g. `agent://neural-cluster-04.pcash`).
3. Click **`⚡ Start Real-Time Inference Stream`**.
4. The wallet establishes an off-chain streaming channel, streaming 16 tokens every 120ms at $0.000001\text{ PCASH}$ per token ($16\text{ pJ}$).
5. When complete, click **`⏹ Settle Stream`** to record the final thermodynamic balance.

---

### I. Public Ledger Explorer & AIR Verifier
1. Click **`🔍 Explorer`** in the top navigation bar.
2. **Search Anything:** Enter any block height (e.g. `#104281`), transaction hash (`0xtx_...`), nullifier (`0xnull_...`), or address (`pc1q...`).
3. **Interactive In-Browser ZK Prover Benchmark:** Click **`⚡ Evaluate 1,842 AIR Constraints`** to watch your browser verify the full Plonky3 STARK spend circuit in under 40 milliseconds!

---

## 4. Testnet vs. Mainnet Consensus

In the top right corner of the wallet, you can switch between **Testnet** and **Mainnet**:

| Mode | What Happens |
| :--- | :--- |
| **Testnet (Chaosnet)** | Safe development sandbox. Faucet is enabled. Balances start at 0.0000 PCASH and coins can be acquired instantly via faucet or mobile miner. Used for testing and learning. |
| **Mainnet (Genesis)** | The immutable production ledger. Anchored at Block #0 with **strictly 0 pre-mine**. Faucet is permanently disabled. Live countdown tracks the Genesis network synchronization. |

---

## 5. Frequently Asked Questions (FAQ)

#### Q: If I clear my browser cookies or switch devices, will I lose my coins?
**A:** In a decentralized PWA, keys are stored in your device's secure browser storage. To avoid losing access, always use **`Backup & Recovery`** to download your encrypted keystore file or save it to Google Drive / Apple iCloud.

#### Q: Is the Mobile Edge Miner safe for my phone's battery?
**A:** Yes. When set to **Eco Profile**, the miner runs throttled single-threaded batches with rest pauses between computations, preventing device heating. For full-speed mining, switch to **Nightstand Profile** while plugged into a charger.

#### Q: Why did ProofCash remove 12-word seed phrases?
**A:** Seed phrases are the #1 cause of lost funds and phishing hacks in Web3. Hardware Enclave Passkeys (FIDO2 / WebAuthn) store cryptographic keys in physical silicon chips that cannot be extracted, phished, or screenshotted.

#### Q: How can I verify that the code has zero tracking or telemetry?
**A:** ProofCash is 100% open-source and zero-dependency. All cryptographic operations happen locally in your browser using native WebCrypto and WebAssembly. You can inspect all code in the [GitHub Repository](https://github.com/Renishidaproject/proofcash).
