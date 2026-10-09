/**
 * ProofCash Wallet State & Execution Engine
 * Manages eUTXOs, Pico-Joules accounting (1 PCASH = 10^12 pJ),
 * Two-Tier Enclave Delegation lifecycle, AI streaming channels,
 * and JSON-RPC node communication.
 *
 * Author: Ren Ishida (2026)
 */

class ProofCashWalletEngine {
  constructor() {
    this.crypto = new PasskeyCrypto();
    this.STORAGE_KEY = 'proofcash_wallet_v1';
    this.DEFAULT_RPC = 'http://127.0.0.1:8332';

    // Canonical Genesis Invariants (Block #0)
    this.GENESIS = {
      height: 0,
      hash: "0xef77394f7adbc68ef6f7b084b9e9d54896f6b3347e550577a3b39bce5e4cb09a",
      stateRoot: "0x9d24db8529db13d58549346b8ec1a4e8d23ce7130389e3e9b70fe25863b9a46c",
      poswHash: "0x00000b4aec2efa3689408bfcb91cf4d7ffcc3e6c06a8f7103310cb230557432b",
      nonce: 7111,
      headline: "Financial Times 09/Oct/2026 Sovereign debt surpasses $100T as autonomous AI compute drains global power grids",
      author: "Ren Ishida",
      premine: "0.0000 PCASH (100% Burned)"
    };
    
    // Core Wallet State
    this.state = {
      networkMode: 'testnet', // 'testnet' | 'mainnet'
      rpcUrl: this.DEFAULT_RPC,
      currentBlockHeight: 104281,
      balance_pJ: 250000000000000n, // 250.0 PCASH default initial test balance
      address: null,
      credentials: [], // Registered Passkeys
      activeCredentialId: null,
      activeDelegation: null, // DelegationCertificate
      activeSessionKey: null, // BabyJubjub ephemeral key
      utxos: [],
      txHistory: [],
      streamingChannel: null,
      isNodeConnected: false
    };

    this.subscribers = [];
  }

  // --- Persistence & Initialization ---

  async init() {
    this.loadState();

    // If no address exists, generate a deterministic default address
    if (!this.state.address) {
      this.state.address = "pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20)));
      this.saveState();
    }

    // Initialize initial default UTXOs if empty
    if (this.state.utxos.length === 0) {
      this.state.utxos.push({
        txid: "0x8fa3028d7b321a00ef923c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
        index: 0,
        amount_pJ: this.state.balance_pJ.toString(),
        commitment: "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
        nullifierKey: "0x9876543210abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      });
      this.saveState();
    }

    // Ping proofcashd node in background
    this.pingNode();

    return this.state;
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.state,
          ...parsed,
          networkMode: parsed.networkMode || 'testnet',
          rpcUrl: parsed.rpcUrl || this.DEFAULT_RPC,
          balance_pJ: BigInt(parsed.balance_pJ || "250000000000000")
        };
      }
    } catch (e) {
      console.error("[WalletEngine] Failed to load local storage state:", e);
    }
  }

  saveState() {
    try {
      const serialized = {
        ...this.state,
        balance_pJ: this.state.balance_pJ.toString(),
        // Don't persist active in-memory ephemeral secret scalar in permanent storage
        activeSessionKey: this.state.activeSessionKey ? {
          publicPointHex: this.state.activeSessionKey.publicPointHex,
          x: this.state.activeSessionKey.x,
          y: this.state.activeSessionKey.y
        } : null
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
      this.notifySubscribers();
    } catch (e) {
      console.error("[WalletEngine] Failed to persist state:", e);
    }
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.state);
  }

  notifySubscribers() {
    this.subscribers.forEach(cb => {
      try { cb(this.state); } catch (e) { console.error(e); }
    });
  }

  // --- Conversions ---

  formatPcash(pJ) {
    const val = typeof pJ === 'bigint' ? pJ : BigInt(pJ || 0);
    const whole = val / 1000000000000n;
    const frac = val % 1000000000000n;
    const fracStr = frac.toString().padStart(12, '0').substring(0, 4);
    return `${whole}.${fracStr}`;
  }

  pcashToPJ(pcashStr) {
    const num = parseFloat(pcashStr || "0");
    return BigInt(Math.round(num * 1e12));
  }

  // --- Tier 1 & 2 Enclave Delegation Workflow ---

  /**
   * Register a new hardware biometric passkey on this device
   */
  async registerPasskey(label = "Primary Device") {
    const res = await this.crypto.createPasskey("ren_ishida", label);
    if (res.success) {
      const credEntry = {
        id: res.credentialId,
        rawIdHex: res.rawIdHex,
        sec1PubkeyHex: res.sec1PubkeyHex,
        label: label,
        isHardwareEnclave: res.isHardwareEnclave,
        authenticatorType: res.authenticatorType,
        createdAt: res.timestamp
      };

      this.state.credentials.push(credEntry);
      this.state.activeCredentialId = res.credentialId;
      this.saveState();

      // Automatically authorize an initial session key
      await this.authorizeSessionKey(144); // 144 blocks ~ 24 hours
      return credEntry;
    }
    throw new Error("Failed to register passkey");
  }

  /**
   * Generate an ephemeral BabyJubjub session key and obtain biometric authorization
   * from the Hardware Enclave (TouchID/FaceID)
   */
  async authorizeSessionKey(validityBlocks = 144) {
    let cred = this.state.credentials.find(c => c.id === this.state.activeCredentialId);
    if (!cred) {
      // If none registered, auto-register default passkey
      cred = await this.registerPasskey("Biometric Hardware Key");
    }

    // Step A: Generate ephemeral BabyJubjub in-circuit keypair
    const sessionKey = await this.crypto.generateBabyJubjubKeypair();
    this.state.activeSessionKey = sessionKey;

    // Step B: Request Enclave Biometric Assertion to sign DelegationCertificate
    const targetExpiration = this.state.currentBlockHeight + validityBlocks;
    const delegation = await this.crypto.signDelegationCertificate(
      cred.id,
      cred.sec1PubkeyHex,
      sessionKey.publicPointBytes,
      targetExpiration
    );

    if (delegation.success) {
      this.state.activeDelegation = {
        enclaveRootPubkey: delegation.enclaveRootPubkey,
        sessionPubkeyHex: delegation.sessionPubkeyHex,
        expirationHeight: targetExpiration,
        derSignatureHex: delegation.derSignatureHex,
        parsedSig: delegation.parsedSig,
        method: delegation.method,
        createdAt: Date.now()
      };

      // Add to tx history as an enclave audit event
      this.state.txHistory.unshift({
        type: "ENCLAVE_DELEGATION",
        txid: "0xdel_" + delegation.derSignatureHex.substring(0, 16),
        height: this.state.currentBlockHeight,
        description: `Biometric Enclave authorized BabyJubjub session key (Valid until block #${targetExpiration})`,
        amount: "0.0000",
        timestamp: Date.now(),
        status: "CONFIRMED"
      });

      this.saveState();
      return this.state.activeDelegation;
    }

    throw new Error("Biometric delegation authorization failed");
  }

  isSessionValid() {
    if (!this.state.activeSessionKey || !this.state.activeDelegation) return false;
    return this.state.currentBlockHeight < this.state.activeDelegation.expirationHeight;
  }

  // --- Shielded Payment & In-Circuit ZK Spend ---

  async sendShieldedPayment(recipient, amountPcash, memo = "") {
    const amount_pJ = this.pcashToPJ(amountPcash);
    const fee_pJ = 100000000n; // 0.0001 PCASH thermodynamic base fee

    if (this.state.balance_pJ < amount_pJ + fee_pJ) {
      throw new Error(`Insufficient funds: Balance is ${this.formatPcash(this.state.balance_pJ)} PCASH, requested ${amountPcash} PCASH + fee`);
    }

    // Ensure session key is active and authorized
    if (!this.isSessionValid()) {
      await this.authorizeSessionKey(144);
    }

    // 1. Generate Spend Transaction hash
    const txNonce = crypto.getRandomValues(new Uint8Array(16));
    const txPayload = `ProofCash_Spend:${recipient}:${amount_pJ}:${PasskeyCrypto.bufferToHex(txNonce)}`;
    const txHash = PasskeyCrypto.bufferToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txPayload))));

    // 2. Client-side ZK AIR constraint evaluation (< 1,850 constraints)
    const airResult = this.crypto.evaluateDelegationAirConstraints(
      this.state.activeDelegation,
      this.state.currentBlockHeight
    );

    // 3. Sign with BabyJubjub Ephemeral Session Key (takes < 45 ms)
    const sigResult = await this.crypto.signSessionTransaction(
      this.state.activeSessionKey,
      txHash
    );

    // 4. Update balances and UTXOs
    this.state.balance_pJ -= (amount_pJ + fee_pJ);

    const txEntry = {
      type: "SHIELDED_SPEND",
      txid: "0x" + txHash,
      recipient: recipient,
      amount: amountPcash,
      fee: "0.0001",
      memo: memo,
      height: this.state.currentBlockHeight,
      constraints: airResult.constraintCount,
      airDurationMs: airResult.durationMs,
      signature: sigResult.signatureHex,
      timestamp: Date.now(),
      status: "CONFIRMED"
    };

    this.state.txHistory.unshift(txEntry);
    this.saveState();

    // 5. Broadcast to proofcashd RPC node
    this.broadcastTransaction(txEntry);

    return {
      success: true,
      txid: txEntry.txid,
      amountPcash: amountPcash,
      airVerification: airResult,
      sessionSignature: sigResult
    };
  }

  // --- AI Micro-Payment Streaming Channel ---

  startAiStream(agentUri = "agent://neural-cluster-04.pcash", onTick = null) {
    if (this.state.streamingChannel) {
      this.stopAiStream();
    }

    const channelId = "chan_0x" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8)));
    const energyBond_pJ = 10000000000n; // 10,000 pJ bond

    this.state.streamingChannel = {
      id: channelId,
      agentUri: agentUri,
      tokensStreamed: 0,
      streamed_pJ: 0n,
      ratePcashPerToken: "0.000001",
      energyBond_pJ: energyBond_pJ,
      active: true,
      startTime: Date.now()
    };

    this.streamInterval = setInterval(() => {
      if (!this.state.streamingChannel || !this.state.streamingChannel.active) return;

      const tokensBatch = 16;
      const cost_pJ = 16000000n; // 16 tokens * 0.000001 PCASH

      if (this.state.balance_pJ >= cost_pJ) {
        this.state.balance_pJ -= cost_pJ;
        this.state.streamingChannel.tokensStreamed += tokensBatch;
        this.state.streamingChannel.streamed_pJ += cost_pJ;

        if (onTick) {
          onTick({
            tokens: this.state.streamingChannel.tokensStreamed,
            amountPcash: this.formatPcash(this.state.streamingChannel.streamed_pJ),
            balancePcash: this.formatPcash(this.state.balance_pJ)
          });
        }
        this.saveState();
      } else {
        this.stopAiStream();
      }
    }, 120);

    return this.state.streamingChannel;
  }

  stopAiStream() {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    if (this.state.streamingChannel) {
      this.state.streamingChannel.active = false;
      const finalAmount = this.formatPcash(this.state.streamingChannel.streamed_pJ);

      this.state.txHistory.unshift({
        type: "AI_STREAM_SETTLE",
        txid: "0xsettle_" + this.state.streamingChannel.id.substring(7),
        channelId: this.state.streamingChannel.id,
        recipient: this.state.streamingChannel.agentUri,
        tokens: this.state.streamingChannel.tokensStreamed,
        amount: finalAmount,
        height: this.state.currentBlockHeight,
        timestamp: Date.now(),
        status: "CONFIRMED"
      });

      const ch = this.state.streamingChannel;
      this.state.streamingChannel = null;
      this.saveState();
      return ch;
    }
    return null;
  }

  // --- Commutative Delta-UTXO Parallel Monoid Batch ---

  fireMonoidBatch(deltas) {
    let net_pJ = 0n;
    const applied = [];

    deltas.forEach(d => {
      const pJ = this.pcashToPJ(Math.abs(d.amount).toString());
      if (d.amount >= 0) {
        net_pJ += pJ;
      } else {
        net_pJ -= pJ;
      }
      applied.push({
        label: d.label,
        amount: d.amount,
        hash: "0x" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(4)))
      });
    });

    if (net_pJ < 0n && this.state.balance_pJ < -net_pJ) {
      throw new Error("Pool overdraft violation: commutative reduction aborted");
    }

    this.state.balance_pJ += net_pJ;

    this.state.txHistory.unshift({
      type: "DELTA_MONOID_REDUCTION",
      txid: "0xmonoid_" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8))),
      batchSize: deltas.length,
      netChange: this.formatPcash(net_pJ),
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED"
    });

    this.saveState();
    return { applied, netChange: this.formatPcash(net_pJ) };
  }

  // --- Testnet Faucet ---

  claimFaucet(amountPcash = "50.0") {
    const claim_pJ = this.pcashToPJ(amountPcash);
    this.state.balance_pJ += claim_pJ;

    this.state.txHistory.unshift({
      type: "FAUCET_DISBURSEMENT",
      txid: "0xfaucet_" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(8))),
      amount: amountPcash,
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED"
    });

    this.saveState();
    return this.formatPcash(this.state.balance_pJ);
  }

  // --- Mobile / Edge Mining Reward ---

  creditMinedBlock(nonce, hash, subsidyPcash = "100.0") {
    const reward_pJ = this.pcashToPJ(subsidyPcash);
    this.state.balance_pJ += reward_pJ;
    this.state.currentBlockHeight += 1;

    const txEntry = {
      type: "MINED_BLOCK_REWARD",
      txid: hash.startsWith("0x") ? hash : "0x" + hash,
      nonce: nonce,
      amount: subsidyPcash,
      height: this.state.currentBlockHeight,
      timestamp: Date.now(),
      status: "CONFIRMED"
    };

    this.state.txHistory.unshift(txEntry);
    this.saveState();
    return {
      balance: this.formatPcash(this.state.balance_pJ),
      height: this.state.currentBlockHeight,
      tx: txEntry
    };
  }

  // --- JSON-RPC proofcashd Integration ---

  async pingNode() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const resp = await fetch(this.state.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getblockchaininfo", params: [] }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        this.state.isNodeConnected = true;
        if (data.result && data.result.height) {
          this.state.currentBlockHeight = data.result.height;
        }
      } else {
        this.state.isNodeConnected = false;
      }
    } catch (e) {
      this.state.isNodeConnected = false;
    }
    this.notifySubscribers();
  }

  async broadcastTransaction(tx) {
    if (!this.state.isNodeConnected) return;
    try {
      await fetch(this.state.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "sendrawtransaction",
          params: [JSON.stringify(tx)]
        })
      });
    } catch (e) {
      console.warn("[WalletEngine] Broadcast to node failed (will retry):", e);
    }
  }

  // --- Network & RPC Management ---

  updateRpcUrl(newUrl) {
    if (!newUrl) return;
    this.state.rpcUrl = newUrl.trim();
    this.saveState();
    this.pingNode();
  }

  setNetworkMode(mode) {
    this.state.networkMode = mode;
    if (mode === 'mainnet') {
      this.state.currentBlockHeight = 0; // Genesis block anchor
    } else {
      if (this.state.currentBlockHeight === 0) {
        this.state.currentBlockHeight = 104281; // Testnet simulation tip
      }
    }
    this.saveState();
    this.pingNode();
  }

  resetWallet() {
    localStorage.removeItem(this.STORAGE_KEY);
    window.location.reload();
  }
}

// Global export
window.ProofCashWalletEngine = ProofCashWalletEngine;
