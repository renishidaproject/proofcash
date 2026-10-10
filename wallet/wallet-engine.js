/**
 * ProofCash Wallet State & Execution Engine v1.2
 * Manages eUTXOs, Pico-Joules accounting (1 PCASH = 10^12 pJ),
 * Two-Tier Enclave Delegation lifecycle, AI streaming channels,
 * Multi-Account switching, Real-Time P2P Mesh Synchronization,
 * and JSON-RPC node communication.
 *
 * Author: Ren Ishida (October 2026)
 */

class ProofCashWalletEngine {
  constructor() {
    this.crypto = new PasskeyCrypto();
    this.STORAGE_KEY = 'proofcash_wallet_v1';
    this.DEFAULT_RPC = (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://127.0.0.1:8332'
      : 'https://rpc.proofcash.org';

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
      activeAccountId: 'acc_1',
      accounts: [],
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
    this.processedTxids = new Set();
    this.initP2pMesh();
  }

  // --- Persistence & Multi-Account Initialization ---

  async init() {
    this.loadState();

    // Initialize Default Accounts if none exist
    if (!this.state.accounts || this.state.accounts.length === 0) {
      const defaultAddr = this.state.address || ("pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20))));
      this.state.accounts = [
        {
          id: 'acc_1',
          name: 'Account 1 (Main Vault)',
          address: defaultAddr,
          balance_pJ: (this.state.balance_pJ || 250000000000000n).toString(),
          txHistory: this.state.txHistory || []
        }
      ];
      this.state.activeAccountId = 'acc_1';
      this.state.address = defaultAddr;
      this.saveState();
    } else {
      // Sync active account fields to top-level state
      this.syncActiveAccountFromList();
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
          balance_pJ: BigInt(parsed.balance_pJ || "250000000000000"),
          accounts: parsed.accounts || []
        };
      }
    } catch (e) {
      console.error("[WalletEngine] Failed to load local storage state:", e);
    }
  }

  saveState() {
    try {
      // Keep active account record updated in accounts array
      if (this.state.accounts && this.state.accounts.length > 0) {
        const idx = this.state.accounts.findIndex(a => a.id === this.state.activeAccountId);
        if (idx !== -1) {
          this.state.accounts[idx] = {
            ...this.state.accounts[idx],
            address: this.state.address,
            balance_pJ: this.state.balance_pJ.toString(),
            txHistory: this.state.txHistory
          };
        }
      }

      const serialized = {
        ...this.state,
        balance_pJ: this.state.balance_pJ.toString(),
        accounts: this.state.accounts,
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

  // --- Multi-Account Management ---

  syncActiveAccountFromList() {
    const acc = this.state.accounts.find(a => a.id === this.state.activeAccountId) || this.state.accounts[0];
    if (acc) {
      this.state.activeAccountId = acc.id;
      this.state.address = acc.address;
      this.state.balance_pJ = BigInt(acc.balance_pJ || "0");
      this.state.txHistory = acc.txHistory || [];
    }
  }

  createAccount(name = null) {
    const nextNum = this.state.accounts.length + 1;
    const accountName = name || `Account ${nextNum} (${nextNum === 2 ? 'Secondary' : 'Savings'})`;
    const newAddress = "pc1q" + PasskeyCrypto.bufferToHex(crypto.getRandomValues(new Uint8Array(20)));
    const newId = `acc_${Date.now()}`;

    // Fresh accounts start with 25 PCASH initial test balance
    const initBalance = 25000000000000n; // 25.0 PCASH

    const newAcc = {
      id: newId,
      name: accountName,
      address: newAddress,
      balance_pJ: initBalance.toString(),
      txHistory: [
        {
          type: "ACCOUNT_GENESIS",
          txid: "0xacc_" + newAddress.substring(4, 12),
          amount: "25.0000",
          height: this.state.currentBlockHeight,
          timestamp: Date.now(),
          status: "CONFIRMED"
        }
      ]
    };

    this.state.accounts.push(newAcc);
    this.switchAccount(newId);
    return newAcc;
  }

  switchAccount(accountId) {
    // 1. Flush current active changes
    const currentIdx = this.state.accounts.findIndex(a => a.id === this.state.activeAccountId);
    if (currentIdx !== -1) {
      this.state.accounts[currentIdx].balance_pJ = this.state.balance_pJ.toString();
      this.state.accounts[currentIdx].txHistory = this.state.txHistory;
    }

    // 2. Load target account
    const target = this.state.accounts.find(a => a.id === accountId);
    if (target) {
      this.state.activeAccountId = target.id;
      this.state.address = target.address;
      this.state.balance_pJ = BigInt(target.balance_pJ || "0");
      this.state.txHistory = target.txHistory || [];
      this.saveState();
      return target;
    }
    return null;
  }

  // --- Real-time P2P Mesh & WebSocket Synchronization ---

  initP2pMesh() {
    // 1. BroadcastChannel across tabs and browser windows
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.p2pChannel = new BroadcastChannel('proofcash_p2p_mesh');
        this.p2pChannel.onmessage = (event) => {
          if (event && event.data) {
            this.handleIncomingP2pTransfer(event.data);
          }
        };
      } catch (e) {
        console.warn("[P2P Mesh] BroadcastChannel unavailable:", e);
      }
    }

    // 2. Storage event fallback for cross-window isolation
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'proofcash_p2p_transfer' && e.newValue) {
          try {
            const packet = JSON.parse(e.newValue);
            this.handleIncomingP2pTransfer(packet);
          } catch (err) {}
        }
      });
    }

    // 3. Connect to Public Global WebSocket Relay (Syncing across phone & PC)
    this.connectPublicRelay();
  }

  connectPublicRelay() {
    const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
    const chosenRelay = relays[0];

    try {
      this.wsRelay = new WebSocket(chosenRelay);
      this.wsRelay.onopen = () => {
        // Subscribe to ProofCash settlement channel
        const subReq = JSON.stringify([
          "REQ",
          "proofcash_live_settlement",
          {
            "kinds": [29200],
            "#t": ["proofcash_tx"]
          }
        ]);
        this.wsRelay.send(subReq);
      };

      this.wsRelay.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg[0] === 'EVENT' && msg[2] && msg[2].content) {
            const txPacket = JSON.parse(msg[2].content);
            this.handleIncomingP2pTransfer(txPacket);
          }
        } catch (e) {}
      };

      this.wsRelay.onerror = () => {};
      this.wsRelay.onclose = () => {
        // Auto-reconnect after 8 seconds
        setTimeout(() => this.connectPublicRelay(), 8000);
      };
    } catch (e) {
      console.warn("[P2P Relay] WebSocket connection error:", e);
    }
  }

  handleIncomingP2pTransfer(packet) {
    if (!packet || !packet.txid || !packet.recipient) return;
    if (this.processedTxids.has(packet.txid)) return;
    this.processedTxids.add(packet.txid);

    const targetAddr = packet.recipient.trim();
    const amount_pJ = BigInt(packet.amount_pJ || "0");
    const amountPcash = packet.amountPcash || this.formatPcash(amount_pJ);

    let matched = false;

    // Check if target matches active account
    if (this.state.address === targetAddr) {
      this.state.balance_pJ += amount_pJ;
      const receiveRecord = {
        type: "SHIELDED_RECEIVE",
        txid: packet.txid,
        recipient: targetAddr,
        sender: packet.sender || "Shielded Origin",
        amount: amountPcash,
        fee: "0.0000",
        memo: packet.memo || "Shielded eUTXO Transfer",
        height: this.state.currentBlockHeight,
        timestamp: packet.timestamp || Date.now(),
        status: "CONFIRMED"
      };
      this.state.txHistory.unshift(receiveRecord);
      matched = true;
    } else {
      // Check if target matches any other account in our multi-account list
      const accIdx = this.state.accounts.findIndex(a => a.address === targetAddr);
      if (accIdx !== -1) {
        const cur = BigInt(this.state.accounts[accIdx].balance_pJ || "0");
        this.state.accounts[accIdx].balance_pJ = (cur + amount_pJ).toString();
        this.state.accounts[accIdx].txHistory = this.state.accounts[accIdx].txHistory || [];
        this.state.accounts[accIdx].txHistory.unshift({
          type: "SHIELDED_RECEIVE",
          txid: packet.txid,
          recipient: targetAddr,
          sender: packet.sender || "Shielded Origin",
          amount: amountPcash,
          fee: "0.0000",
          height: this.state.currentBlockHeight,
          timestamp: packet.timestamp || Date.now(),
          status: "CONFIRMED"
        });
        matched = true;
      }
    }

    if (matched) {
      this.saveState();
      this.notifySubscribers();

      // Dispatch event to show in-app banner/toast
      window.dispatchEvent(new CustomEvent('proofcash:received', {
        detail: {
          amount: amountPcash,
          recipient: targetAddr,
          txid: packet.txid
        }
      }));
    }
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
      await this.authorizeSessionKey(144);
      return credEntry;
    }
    throw new Error("Failed to register passkey");
  }

  async authorizeSessionKey(validityBlocks = 144) {
    let cred = this.state.credentials.find(c => c.id === this.state.activeCredentialId);
    if (!cred) {
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

  // --- Shielded Payment & Real-Time Transfer Reflection ---

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

    // 3. Sign with BabyJubjub Ephemeral Session Key (< 45 ms)
    const sigResult = await this.crypto.signSessionTransaction(
      this.state.activeSessionKey,
      txHash
    );

    // 4. Deduct sender balance
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
    this.processedTxids.add(txEntry.txid);

    // 5. Handle Direct In-Wallet Multi-Account Transfer (Alice -> Bob on same device)
    const targetAccIdx = this.state.accounts.findIndex(a => a.address === recipient.trim());
    if (targetAccIdx !== -1 && this.state.accounts[targetAccIdx].id !== this.state.activeAccountId) {
      const curBal = BigInt(this.state.accounts[targetAccIdx].balance_pJ || "0");
      this.state.accounts[targetAccIdx].balance_pJ = (curBal + amount_pJ).toString();
      this.state.accounts[targetAccIdx].txHistory = this.state.accounts[targetAccIdx].txHistory || [];
      this.state.accounts[targetAccIdx].txHistory.unshift({
        type: "SHIELDED_RECEIVE",
        txid: txEntry.txid,
        recipient: recipient,
        sender: this.state.address,
        amount: amountPcash,
        fee: "0.0000",
        memo: memo,
        height: this.state.currentBlockHeight,
        timestamp: Date.now(),
        status: "CONFIRMED"
      });
    }

    this.saveState();

    // 6. Broadcast P2P Packet to other open Tabs / Windows
    const p2pPacket = {
      type: "PCASH_TRANSFER",
      txid: txEntry.txid,
      sender: this.state.address,
      recipient: recipient.trim(),
      amountPcash: amountPcash,
      amount_pJ: amount_pJ.toString(),
      memo: memo,
      timestamp: Date.now()
    };

    if (this.p2pChannel) {
      this.p2pChannel.postMessage(p2pPacket);
    }
    try {
      localStorage.setItem('proofcash_p2p_transfer', JSON.stringify(p2pPacket));
    } catch (e) {}

    // 7. Publish to Global WebSocket Relay (across different phones/devices)
    if (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN) {
      try {
        const nostrEvent = [
          "EVENT",
          {
            kind: 29200,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["t", "proofcash_tx"], ["p", recipient]],
            content: JSON.stringify(p2pPacket)
          }
        ];
        this.wsRelay.send(JSON.stringify(nostrEvent));
      } catch (err) {}
    }

    // 8. Broadcast to proofcashd RPC node
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
    const subsidy_pJ = this.pcashToPJ(subsidyPcash);
    this.state.balance_pJ += subsidy_pJ;
    this.state.currentBlockHeight += 1;

    const txEntry = {
      type: "MINED_BLOCK_REWARD",
      txid: "0xblk_" + hash.substring(0, 16),
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
      console.warn("[WalletEngine] Broadcast to node failed:", e);
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
