# ProofCash: Namecheap DNS & GitHub Pages Configuration Guide

**Target Domain:** `proofcash.org`  
**Target Repository:** `https://github.com/Renishidaproject/proofcash`  
**GitHub Pages Target:** `renishidaproject.github.io`  
**Document Version:** 1.0 (Live Deployment)  
**Author:** Ren Ishida (`renishida@proton.me`)

---

## 1. Overview

This document provides step-by-step instructions for configuring **Namecheap DNS** to route `proofcash.org` and `www.proofcash.org` to GitHub Pages with automated SSL/TLS encryption.

---

## 2. Resolving the "Namecheap Requires Nameservers" Issue

If Namecheap asks you for nameserver addresses (`ns1...`, `ns2...`), your domain is currently set to **"Custom DNS"**. To manage individual DNS records directly within Namecheap, you must switch to **Namecheap BasicDNS**.

### Step-by-Step Fix:
1. Log in to your **[Namecheap Dashboard](https://ap.www.namecheap.com/)**.
2. Click **Domain List** in the left sidebar.
3. Click the **MANAGE** button next to `proofcash.org`.
4. On the primary **Domain** tab, scroll down to the **NAMESERVERS** section.
5. Click the dropdown menu and select:
   ```text
   Namecheap BasicDNS
   ```
6. Click the **green checkmark (✓)** to save the selection.

```
+--------------------------------------------------------------------+
| NAMESERVERS                                                        |
| [ Namecheap BasicDNS             ▼ ]  [ ✓ Save ]                   |
+--------------------------------------------------------------------+
```

---

## 3. Adding GitHub Pages Host Records (Advanced DNS)

Once **Namecheap BasicDNS** is active and saved, the **Advanced DNS** tab will become unlocked.

1. Click the **Advanced DNS** tab at the top of the page (next to "Domain" and "Products").
2. Scroll to the **HOST RECORDS** section.
3. If there are default parking records (such as "Parking Page", "URL Redirect", or "Welcome to Namecheap"), click the **trash can icon (🗑️)** on the right to delete them.
4. Click the red **ADD NEW RECORD** button and add the following **5 records**:

### Required DNS Records Table

| Record # | Type | Host | Value / Target | TTL | Purpose |
| :---: | :--- | :---: | :--- | :---: | :--- |
| **1** | **A Record** | `@` | `185.199.108.153` | `Automatic` | GitHub Pages Anycast Node 1 |
| **2** | **A Record** | `@` | `185.199.109.153` | `Automatic` | GitHub Pages Anycast Node 2 |
| **3** | **A Record** | `@` | `185.199.110.153` | `Automatic` | GitHub Pages Anycast Node 3 |
| **4** | **A Record** | `@` | `185.199.111.153` | `Automatic` | GitHub Pages Anycast Node 4 |
| **5** | **CNAME Record** | `www` | `renishidaproject.github.io` | `Automatic` | WWW Redirection to GitHub |

*(Note: Namecheap automatically formats `@` to represent the root domain `proofcash.org`)*

5. Click **SAVE ALL CHANGES** (green checkmark at the bottom of the table).

---

## 4. Connecting & Enforcing HTTPS on GitHub Pages

The repository already has the canonical [`CNAME`](../CNAME) file containing `proofcash.org` committed on the `main` branch.

1. Open your browser and navigate to the GitHub Pages repository settings:
   👉 **`https://github.com/Renishidaproject/proofcash/settings/pages`**
2. Scroll down to the **Custom domain** section:
   * Verify that **`proofcash.org`** is entered.
   * If not already present, enter `proofcash.org` and click **Save**.
3. GitHub will display a status message:
   ```text
   DNS check in progress...
   ```
4. Allow **5 to 15 minutes** for global DNS propagation. Once verified, GitHub will show:
   ```text
   ✓ DNS check successful
   ```
5. Check the box:
   * **[x] Enforce HTTPS**
   * GitHub will automatically generate, verify, and bind a free **Let's Encrypt TLS/SSL Certificate** with automated renewals.

---

## 5. Verification Commands

To verify that Namecheap has propagated your new IP records from your terminal or command prompt:

### On Windows PowerShell:
```powershell
Resolve-DnsName -Name "proofcash.org" -Type A
Resolve-DnsName -Name "www.proofcash.org" -Type CNAME
```

### On Linux / macOS / Terminal:
```bash
dig +short proofcash.org
dig +short www.proofcash.org
```

### Expected Output:
```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

---

## 6. Live Production URLs

Once propagation completes:
* **Protocol Portal:** `https://proofcash.org`
* **Passkey Web Wallet & Edge Miner:** `https://proofcash.org/wallet/`
* **Public Ledger Block Explorer:** `https://proofcash.org/explorer/`
* **Whitepaper Source:** `https://proofcash.org/proofcash_whitepaper.html`
