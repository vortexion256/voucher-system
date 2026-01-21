"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../lib/firebase.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";

export default function VouchersAdminPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState(1000);
  const [bulk, setBulk] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [vouchers, setVouchers] = useState([]);
  const [filterAmount, setFilterAmount] = useState(0);
  const [onlyUnused, setOnlyUnused] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState("vouchers"); // 'vouchers' | 'bulk' | 'transactions' | 'payments'
  const [transactions, setTransactions] = useState([]);
  const [txStatusFilter, setTxStatusFilter] = useState("all"); // all|successful|failed|pending
  const [payments, setPayments] = useState([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all"); // all|processing|failed|completed

  const baseQuery = useMemo(() => {
    const col = collection(db, "vouchers");
    const constraints = [];
    if (filterAmount && Number(filterAmount) > 0) constraints.push(where("amount", "==", Number(filterAmount)));
    if (onlyUnused) constraints.push(where("used", "==", false));
    constraints.push(orderBy("code", "asc"));
    constraints.push(limit(50));
    return query(col, ...constraints);
  }, [filterAmount, onlyUnused]);

  async function refreshList() {
    try {
      const snap = await getDocs(baseQuery);
      setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refreshList();
  }, [baseQuery]);

  async function refreshTransactions() {
    try {
      const col = collection(db, "transactions");
      const constraints = [];
      if (txStatusFilter !== "all") constraints.push(where("status", "==", txStatusFilter));
      constraints.push(orderBy("createdAt", "desc"));
      constraints.push(limit(50));
      const snap = await getDocs(query(col, ...constraints));
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (authorized && activeTab === "transactions") {
      refreshTransactions();
    }
  }, [authorized, activeTab, txStatusFilter]);

  async function refreshPayments() {
    try {
      const [pendSnap, compSnap] = await Promise.all([
        getDocs(collection(db, "pendingPayments")),
        getDocs(collection(db, "completedVouchers")),
      ]);
      const list = [];
      pendSnap.docs.forEach(d => {
        const x = d.data();
        list.push({
          id: d.id,
          reference: d.id,
          phone: x.phone,
          amount: x.amount,
          status: x.status || "processing",
          voucher: x.voucher || null,
          date: x.createdAt?.toDate?.() || x.createdAt || new Date(0),
          source: "pending",
        });
      });
      compSnap.docs.forEach(d => {
        const x = d.data();
        list.push({
          id: d.id,
          reference: d.id,
          phone: x.phone,
          amount: x.amount,
          status: "completed",
          voucher: x.voucher || null,
          date: x.updatedAt?.toDate?.() || x.updatedAt || new Date(0),
          source: "completed",
        });
      });
      list.sort((a, b) => (b.date || 0) - (a.date || 0));
      setPayments(list.slice(0, 100));
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (authorized && activeTab === "payments") {
      refreshPayments();
    }
  }, [authorized, activeTab]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user?.email) {
          router.replace(`/login?callbackUrl=${encodeURIComponent("/admin/vouchers")}`);
          return;
        }
        setUserEmail(user.email);
        const q = query(
          collection(db, "adminEmails"),
          where("email", "==", user.email),
          where("approved", "==", true),
          limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          setAuthorized(false);
          router.replace(`/login?callbackUrl=${encodeURIComponent("/admin/vouchers")}`);
        } else {
          setAuthorized(true);
        }
      } catch (e) {
        setAuthorized(false);
        router.replace(`/login?callbackUrl=${encodeURIComponent("/admin/vouchers")}`);
      } finally {
        setAuthChecked(true);
      }
    });
    return () => unsub();
  }, [router]);

  async function handleAddSingle(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!code.trim() || !amount) {
      setError("Code and amount are required");
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, "vouchers"), {
        code: code.trim(),
        amount: Number(amount),
        used: false,
        createdAt: serverTimestamp(),
      });
      setMessage("Voucher added");
      setCode("");
      await refreshList();
    } catch (e) {
      setError(e?.message || "Failed to add voucher");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddBulk(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    const rows = bulk
      .split("\n")
      .map(r => r.trim())
      .filter(Boolean);
    if (rows.length === 0 || !amount) {
      setError("Provide codes and amount");
      return;
    }
    setLoading(true);
    let added = 0;
    try {
      for (const c of rows) {
        await addDoc(collection(db, "vouchers"), {
          code: c,
          amount: Number(amount),
          used: false,
          createdAt: serverTimestamp(),
        });
        added += 1;
      }
      setMessage(`Added ${added} vouchers`);
      setBulk("");
      await refreshList();
    } catch (e) {
      setError(e?.message || "Bulk add failed");
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Checking access...
      </div>
    );
  }
  if (!authorized) return null;

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>Admin</h1>
        <div className="topbar-right">
          <span className="email">{userEmail}</span>
          <button onClick={() => signOut(auth)} className="btn">Sign out</button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        <button className={`tab ${activeTab === "vouchers" ? "active" : ""}`} onClick={() => setActiveTab("vouchers")}>
          Vouchers
        </button>
        <button className={`tab ${activeTab === "bulk" ? "active" : ""}`} onClick={() => setActiveTab("bulk")}>Bulk Add</button>
        <button className={`tab ${activeTab === "transactions" ? "active" : ""}`} onClick={() => setActiveTab("transactions")}>
          Transactions
        </button>
        <button className={`tab ${activeTab === "payments" ? "active" : ""}`} onClick={() => setActiveTab("payments")}>
          Payments
        </button>
      </div>

      {activeTab === "vouchers" && (
        <div className="card">
          <section>
            <h2>Add Single</h2>
            <form onSubmit={handleAddSingle} className="form-grid">
              <input placeholder="Code" value={code} onChange={e => setCode(e.target.value)} />
              <select value={amount} onChange={e => setAmount(Number(e.target.value))}>
                <option value={500}>UGX 500 (4hrs)</option>
                <option value={1000}>UGX 1,000 (24hrs)</option>
                <option value={1500}>UGX 1,500 (Legacy)</option>
                <option value={2500}>UGX 2,500 (3days)</option>
                {/* <option value={5000}>UGX 5,000 (Weekly)</option> */}
                <option value={7000}>UGX 7,000 (Legacy)</option>
                {/* <option value={20000}>UGX 20,000 (Monthly)</option> */}
              </select>
              <button type="submit" className="btn" disabled={loading}>Add</button>
            </form>
          </section>

          <section>
            <div className="toolbar">
              <h2>Inventory</h2>
              <div className="toolbar-right">
                <select value={filterAmount} onChange={e => setFilterAmount(Number(e.target.value))}>
                  <option value={0}>All amounts</option>
                  <option value={500}>UGX 500 (4hrs)</option>
                  <option value={1000}>UGX 1,000 (24hrs)</option>
                  <option value={1500}>UGX 1,500 (Legacy)</option>
                  <option value={2500}>UGX 2,500 (3days)</option>
                  {/* <option value={5000}>UGX 5,000 (Weekly)</option> */}
                  <option value={7000}>UGX 7,000 (Legacy)</option>
                  {/* <option value={20000}>UGX 20,000 (Monthly)</option> */}
                </select>
                <label className="checkbox">
                  <input type="checkbox" checked={onlyUnused} onChange={e => setOnlyUnused(e.target.checked)} /> Only unused
                </label>
                <button onClick={refreshList} className="btn subtle">Refresh</button>
              </div>
            </div>
            <div className="table table-desktop">
              <div className="table-inner">
                <div className="thead">
                  <div>Code</div>
                  <div>Amount</div>
                  <div>Used</div>
                  <div>Assigned To</div>
                </div>
                {vouchers.map(v => (
                  <div key={v.id} className="trow">
                    <div className="code">{v.code}</div>
                    <div>{v.amount?.toLocaleString?.() ?? v.amount}</div>
                    <div>{String(v.used)}</div>
                    <div>{v.assignedTo || ""}</div>
                  </div>
                ))}
                {vouchers.length === 0 && <div className="empty">No vouchers found</div>}
              </div>
            </div>

            {/* Mobile card list */}
            <div className="list-mobile">
              {vouchers.map(v => (
                <div key={v.id} className="card-row">
                  <div className="row-line"><span className="label">Code</span><span className="value code">{v.code}</span></div>
                  <div className="row-line"><span className="label">Amount</span><span className="value">{v.amount?.toLocaleString?.() ?? v.amount}</span></div>
                  <div className="row-line"><span className="label">Used</span><span className="value">{String(v.used)}</span></div>
                  <div className="row-line"><span className="label">Assigned To</span><span className="value">{v.assignedTo || ""}</span></div>
                </div>
              ))}
              {vouchers.length === 0 && <div className="empty">No vouchers found</div>}
            </div>
          </section>
        </div>
      )}

      {activeTab === "bulk" && (
        <div className="card">
          <section>
            <h2>Bulk Add Vouchers</h2>
            <form onSubmit={handleAddBulk}>
              <div className="form-grid-bulk">
                <textarea placeholder="One code per line" rows={10} value={bulk} onChange={e => setBulk(e.target.value)} />
                <div className="side">
                  <label className="lbl">Amount</label>
                  <select value={amount} onChange={e => setAmount(Number(e.target.value))}>
                    <option value={500}>UGX 500 (4hrs)</option>
                    <option value={1000}>UGX 1,000 (24hrs)</option>
                    <option value={1500}>UGX 1,500 (Legacy)</option>
                    <option value={2500}>UGX 2,500 (3days)</option>
                    {/* <option value={5000}>UGX 5,000 (Weekly)</option> */}
                    <option value={7000}>UGX 7,000 (Legacy)</option>
                    {/* <option value={20000}>UGX 20,000 (Monthly)</option> */}
                  </select>
                  <button type="submit" className="btn" disabled={loading} style={{ marginTop: '.5rem' }}>Add All</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="card">
          <div className="toolbar">
            <h2>Transactions</h2>
            <div className="toolbar-right">
              <select value={txStatusFilter} onChange={e => setTxStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="successful">Successful</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <button onClick={refreshTransactions} className="btn subtle">Refresh</button>
            </div>
          </div>
          <div className="table tx">
            <div className="thead">
              <div>Date</div>
              <div>Phone</div>
              <div>Amount</div>
              <div>Status</div>
              <div>Voucher</div>
              <div>Reference</div>
            </div>
            {transactions.map(t => (
              <div key={t.id} className="trow">
                <div>{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : ""}</div>
                <div>{t.phone || ""}</div>
                <div>{t.amount?.toLocaleString?.() ?? t.amount}</div>
                <div className={`badge ${t.status}`}>{t.status}</div>
                <div className="code" title={t.voucher || ""}>{t.voucher || ""}</div>
                <div className="code" title={t.reference || ""}>{t.reference || ""}</div>
              </div>
            ))}
            {transactions.length === 0 && <div className="empty">No transactions found</div>}
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="card">
          <div className="toolbar">
            <h2>Payments</h2>
            <div className="toolbar-right">
              <select value={paymentStatusFilter} onChange={e => setPaymentStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="completed">Completed</option>
              </select>
              <button onClick={refreshPayments} className="btn subtle">Refresh</button>
            </div>
          </div>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "12px", color: "#6b7280" }}>
            Processing = waiting for customer on phone. Completed = paid, voucher issued. From pendingPayments + completedVouchers.
          </p>
          <div className="table tx">
            <div className="thead">
              <div>Date</div>
              <div>Phone</div>
              <div>Amount</div>
              <div>Status</div>
              <div>Voucher</div>
              <div>Reference</div>
            </div>
            {payments
              .filter(p => paymentStatusFilter === "all" || p.status === paymentStatusFilter)
              .map(t => (
                <div key={t.id} className="trow">
                  <div>{t.date ? (t.date instanceof Date ? t.date.toLocaleString() : new Date(t.date).toLocaleString()) : "—"}</div>
                  <div>{t.phone || ""}</div>
                  <div>{t.amount != null ? Number(t.amount).toLocaleString() : ""}</div>
                  <div className={`badge ${t.status}`}>{t.status}</div>
                  <div className="code" title={t.voucher || ""}>{t.voucher || "—"}</div>
                  <div className="code" title={t.reference || ""}>{t.reference || ""}</div>
                </div>
              ))}
            {payments.filter(p => paymentStatusFilter === "all" || p.status === paymentStatusFilter).length === 0 && (
              <div className="empty">No payments match the filter</div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .wrap { max-width: 1000px; margin: 1rem auto; padding: 1rem; overflow-x:hidden; }
        .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.75rem; }
        .topbar h1{ margin:0; font-size:20px; }
        .topbar-right{ display:flex; gap:.5rem; align-items:center; }
        .email{ font-size:12px; color:#6b7280; }
        .btn{ padding: .5rem .8rem; border:1px solid #e5e7eb; background:#fff; border-radius:8px; cursor:pointer; }
        .btn.subtle{ background:#f9fafb; }
        .tabs{ display:flex; gap:.5rem; margin-bottom:.75rem; }
        .tab{ padding:.5rem .9rem; border:1px solid #e5e7eb; border-radius:999px; background:#fff; cursor:pointer; }
        .tab.active{ background:#111827; color:#fff; border-color:#111827; }
        .card{ background:#fff; border:1px solid #eef0f4; border-radius:16px; padding:1rem; box-shadow:0 10px 15px -3px rgba(16,24,40,.06); overflow:hidden; }
        .form-grid{ display:grid; grid-template-columns: 1fr 200px 120px; gap:.5rem; }
        .form-grid-bulk{ display:grid; grid-template-columns: 1fr 280px; gap:1rem; }
        .form-grid-bulk .side{ display:flex; flex-direction:column; }
        .toolbar{ display:flex; align-items:center; justify-content:space-between; margin: .5rem 0; flex-wrap: wrap; gap:.5rem; }
        .toolbar-right{ display:flex; gap:.5rem; align-items:center; margin-left:auto; }
        .checkbox{ display:flex; gap:.4rem; align-items:center; }
        .table{ border:1px solid #eee; border-radius:10px; overflow-x:auto; overflow-y:hidden; width:100%; -webkit-overflow-scrolling:touch; background:#fff; }
        .table-inner{ width:max-content; min-width:100%; }
        .thead{ display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding:.5rem; font-weight:600; background:#fafafa; }
        .trow{ display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding:.5rem; border-top:1px solid #f0f0f0; }
        .table.tx .thead{ grid-template-columns: 1.5fr 1fr .8fr .8fr 1.2fr 1.5fr; }
        .table.tx .trow{ grid-template-columns: 1.5fr 1fr .8fr .8fr 1.2fr 1.5fr; }
        .code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .list-mobile{ display:none; }
        .card-row{ background:#fff; border:1px solid #eee; border-radius:12px; padding:.75rem; margin-top:.5rem; box-shadow:0 4px 6px -2px rgba(16,24,40,.06); }
        .row-line{ display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.2rem 0; }
        .row-line .label{ color:#6b7280; font-size:12px; }
        .row-line .value{ font-size:14px; }
        .alert{ padding:.5rem .75rem; border-radius:8px; margin-bottom:.75rem; }
        .alert.success{ background:#e6ffed; border:1px solid #b7eb8f; color:#135200; }
        .alert.error{ background:#fff1f0; border:1px solid #ffa39e; color:#a8071a; }
        .badge{ display:inline-block; padding:.15rem .45rem; border-radius:999px; font-size:12px; background:#f3f4f6; }
        .badge.successful{ background:#ecfdf5; color:#065f46; }
        .badge.completed{ background:#ecfdf5; color:#065f46; }
        .badge.failed{ background:#fef2f2; color:#991b1b; }
        .badge.pending{ background:#fff7ed; color:#92400e; }
        .badge.processing{ background:#fff7ed; color:#92400e; }

        /* Mobile */
        @media (max-width: 700px){
          .form-grid{ grid-template-columns: 1fr; }
          .form-grid-bulk{ grid-template-columns: 1fr; }
          /* Show cards on mobile, hide table */
          .table-desktop{ display:none; }
          .list-mobile{ display:block; }
          /* Transactions still stack on mobile */
          .table.tx .thead{ display:none; }
          .table.tx .trow{ display:flex; flex-direction:column; gap:.25rem; }
        }
      `}</style>
    </div>
  );
}
