// app/dashboard/page.js - User dashboard to manage credentials and vouchers
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [marzApiKey, setMarzApiKey] = useState("");
  const [marzApiSecret, setMarzApiSecret] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [vouchers, setVouchers] = useState([]);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherAmount, setVoucherAmount] = useState(1000);
  const [activeTab, setActiveTab] = useState("credentials"); // 'credentials' | 'vouchers' | 'embed' | 'analytics'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch user data from users collection
        try {
          const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const userId = snapshot.docs[0].id;
            setUserData({ id: userId, ...data });
            setEmbedUrl(data.embedUrl || "");
            setMarzApiKey(data.marzApiKey ? "••••••••" : "");
            
            // Load vouchers for this user
            await loadVouchers(userId);
          } else {
            // User doesn't exist in users collection - redirect to complete profile
            setError("User account not found. Please complete your profile.");
            setTimeout(() => {
              router.push("/complete-profile");
            }, 2000);
          }
        } catch (err) {
          console.error("Error fetching user data:", err);
          setError("Failed to load user data");
        } finally {
          setLoading(false);
        }
      } else {
        router.replace("/login?callbackUrl=/dashboard");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadVouchers = async (userId) => {
    try {
      const q = query(
        collection(db, "vouchers"),
        where("userId", "==", userId)
      );
      const snapshot = await getDocs(q);
      const vouchersList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setVouchers(vouchersList);
    } catch (err) {
      console.error("Error loading vouchers:", err);
    }
  };

  const [testingCredentials, setTestingCredentials] = useState(false);

  const testCredentials = async () => {
    if (!userData) return;

    setTestingCredentials(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/test-marz-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage("✅ Credentials are valid and working!");
      } else {
        setError(data.message || "Credentials test failed");
      }
    } catch (err) {
      setError("Failed to test credentials. Please try again.");
    } finally {
      setTestingCredentials(false);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!userData) return;

    if (!marzApiKey || !marzApiSecret) {
      setError("Both API Key and Secret are required");
      return;
    }

    // Trim whitespace from credentials
    const trimmedKey = marzApiKey.trim();
    const trimmedSecret = marzApiSecret.trim();

    if (!trimmedKey || !trimmedSecret) {
      setError("API Key and Secret cannot be empty");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      // Test credentials before saving
      setMessage("Testing credentials before saving...");
      const testResponse = await fetch("/api/test-marz-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marzApiKey: trimmedKey,
          marzApiSecret: trimmedSecret,
        }),
      });

      const testData = await testResponse.json();
      if (!testData.success && testData.statusCode === 401) {
        setError("Invalid credentials. Please check your API Key and Secret. They were not saved.");
        setSaving(false);
        return;
      }

      // Save credentials
      const response = await fetch(`/api/users/${userData.id}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marzApiKey: trimmedKey,
          marzApiSecret: trimmedSecret,
        }),
      });

      const data = await response.json();
      if (data.success) {
        if (testData.success) {
          setMessage("✅ Credentials updated and verified successfully!");
        } else {
          setMessage("⚠️ Credentials saved but test failed. Please verify they are correct.");
        }
        setMarzApiKey("••••••••");
        setMarzApiSecret("");
      } else {
        setError(data.message || "Failed to update credentials");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVoucher = async () => {
    if (!userData || !voucherCode || !voucherAmount) {
      setError("Voucher code and amount are required");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await addDoc(collection(db, "vouchers"), {
        userId: userData.id,
        code: voucherCode.trim(),
        amount: Number(voucherAmount),
        used: false,
        createdAt: serverTimestamp(),
      });

      setMessage("Voucher added successfully!");
      setVoucherCode("");
      setVoucherAmount(1000);
      await loadVouchers(userData.id);
    } catch (err) {
      setError(err.message || "Failed to add voucher");
    } finally {
      setSaving(false);
    }
  };

  const copyEmbedUrl = () => {
    if (embedUrl) {
      navigator.clipboard.writeText(embedUrl);
      setMessage("Embed URL copied to clipboard!");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        padding: "20px"
      }}>
        <div style={{ textAlign: "center" }}>
          <h1>Error</h1>
          <p>{error || "User account not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      padding: "20px",
      fontFamily: "system-ui, sans-serif",
      maxWidth: "1200px",
      margin: "0 auto"
    }}>
      <h1 style={{ marginBottom: "30px" }}>Dashboard</h1>

      <div style={{
        display: "flex",
        gap: "10px",
        marginBottom: "30px",
        borderBottom: "1px solid #ddd",
        paddingBottom: "10px",
        flexWrap: "wrap"
      }}>
        <button
          onClick={() => setActiveTab("credentials")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: activeTab === "credentials" ? "#667eea" : "#f0f0f0",
            color: activeTab === "credentials" ? "white" : "#333",
            cursor: "pointer",
            borderRadius: "4px"
          }}
        >
          API Credentials
        </button>
        <button
          onClick={() => setActiveTab("vouchers")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: activeTab === "vouchers" ? "#667eea" : "#f0f0f0",
            color: activeTab === "vouchers" ? "white" : "#333",
            cursor: "pointer",
            borderRadius: "4px"
          }}
        >
          Vouchers
        </button>
        <button
          onClick={() => setActiveTab("embed")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: activeTab === "embed" ? "#667eea" : "#f0f0f0",
            color: activeTab === "embed" ? "white" : "#333",
            cursor: "pointer",
            borderRadius: "4px"
          }}
        >
          Embed URL
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: activeTab === "analytics" ? "#667eea" : "#f0f0f0",
            color: activeTab === "analytics" ? "white" : "#333",
            cursor: "pointer",
            borderRadius: "4px"
          }}
        >
          Analytics
        </button>
      </div>

      {message && (
        <div style={{
          padding: "12px",
          background: "#d4edda",
          color: "#155724",
          borderRadius: "6px",
          marginBottom: "20px"
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          padding: "12px",
          background: "#f8d7da",
          color: "#721c24",
          borderRadius: "6px",
          marginBottom: "20px"
        }}>
          {error}
        </div>
      )}

      {activeTab === "credentials" && (
        <div style={{
          background: "white",
          padding: "30px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h2 style={{ marginBottom: "20px" }}>Marz API Credentials</h2>
          <p style={{ color: "#666", marginBottom: "20px" }}>
            Enter your Marz Pay API credentials to enable payments on your embeddable page.
          </p>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Marz API Key
            </label>
            <input
              type="text"
              placeholder="Enter your Marz API Key"
              value={marzApiKey}
              onChange={(e) => setMarzApiKey(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "16px",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Marz API Secret
            </label>
            <input
              type="password"
              placeholder="Enter your Marz API Secret"
              value={marzApiSecret}
              onChange={(e) => setMarzApiSecret(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "16px",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            {userData?.marzBase64Auth && (
              <button
                onClick={testCredentials}
                disabled={testingCredentials || saving}
                style={{
                  padding: "12px 24px",
                  background: testingCredentials ? "#ccc" : "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "16px",
                  cursor: testingCredentials ? "not-allowed" : "pointer",
                  fontWeight: "600"
                }}
              >
                {testingCredentials ? "Testing..." : "Test Credentials"}
              </button>
            )}
            <button
              onClick={handleUpdateCredentials}
              disabled={saving || testingCredentials}
              style={{
                padding: "12px 24px",
                background: saving ? "#ccc" : "#667eea",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: "600"
              }}
            >
              {saving ? "Saving..." : "Update Credentials"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "vouchers" && (
        <div style={{
          background: "white",
          padding: "30px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h2 style={{ marginBottom: "20px" }}>Manage Vouchers</h2>

          <div style={{
            padding: "20px",
            background: "#f5f5f5",
            borderRadius: "6px",
            marginBottom: "30px"
          }}>
            <h3 style={{ marginBottom: "15px" }}>Add New Voucher</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="Voucher Code"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px"
                }}
              />
              <input
                type="number"
                placeholder="Amount"
                value={voucherAmount}
                onChange={(e) => setVoucherAmount(Number(e.target.value))}
                min="500"
                style={{
                  width: "120px",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px"
                }}
              />
              <button
                onClick={handleAddVoucher}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  background: saving ? "#ccc" : "#667eea",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: saving ? "not-allowed" : "pointer"
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: "15px" }}>Your Vouchers ({vouchers.length})</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Code</th>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Amount</th>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Status</th>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                        No vouchers yet. Add your first voucher above.
                      </td>
                    </tr>
                  ) : (
                    vouchers.map((v) => (
                      <tr key={v.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "12px" }}>{v.code}</td>
                        <td style={{ padding: "12px" }}>{v.amount} UGX</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            background: v.used ? "#ffebee" : "#e8f5e9",
                            color: v.used ? "#c62828" : "#2e7d32",
                            fontSize: "12px"
                          }}>
                            {v.used ? "Used" : "Available"}
                          </span>
                        </td>
                        <td style={{ padding: "12px", color: "#666" }}>
                          {v.assignedTo || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "embed" && (
        <div style={{
          background: "white",
          padding: "30px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h2 style={{ marginBottom: "20px" }}>Your Embeddable URL</h2>
          <p style={{ color: "#666", marginBottom: "20px" }}>
            Share this URL with your customers to enable them to make payments. Each payment will use your Marz API credentials.
          </p>

          <div style={{
            padding: "15px",
            background: "#f5f5f5",
            borderRadius: "6px",
            marginBottom: "20px",
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: "14px"
          }}>
            {embedUrl || "Loading..."}
          </div>

          <button
            onClick={copyEmbedUrl}
            style={{
              padding: "12px 24px",
              background: "#667eea",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            Copy URL
          </button>

          <div style={{
            marginTop: "30px",
            padding: "20px",
            background: "#e3f2fd",
            borderRadius: "6px"
          }}>
            <h3 style={{ marginBottom: "10px" }}>How to use:</h3>
            <ol style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
              <li>Copy the embed URL above</li>
              <li>Share it with your customers via email, SMS, or embed it on your website</li>
              <li>When customers make payments, they'll use your Marz API credentials</li>
              <li>Vouchers will be assigned from your voucher pool</li>
            </ol>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <AnalyticsDashboard />
      )}
    </div>
  );
}

// Analytics Dashboard Component
function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAnalytics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/analytics");
      const data = await response.json();
      
      if (data.success) {
        setAnalyticsData(data.data);
      } else {
        setError(data.message || "Failed to load analytics");
      }
    } catch (err) {
      setError("Failed to fetch analytics data");
      console.error("Analytics error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !analyticsData) {
    return (
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        textAlign: "center"
      }}>
        <div>Loading analytics...</div>
      </div>
    );
  }

  if (error && !analyticsData) {
    return (
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div style={{ color: "#721c24", marginBottom: "20px" }}>{error}</div>
        <button
          onClick={fetchAnalytics}
          style={{
            padding: "10px 20px",
            background: "#667eea",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer"
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analyticsData) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div style={{
      background: "white",
      padding: "15px",
      borderRadius: "8px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      width: "100%",
      boxSizing: "border-box"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          style={{
            padding: "8px 16px",
            background: loading ? "#ccc" : "#667eea",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px"
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: "12px",
          background: "#f8d7da",
          color: "#721c24",
          borderRadius: "6px",
          marginBottom: "20px"
        }}>
          {error}
        </div>
      )}

      {/* Voucher Statistics by Category */}
      <div style={{ marginBottom: "40px" }}>
        <h3 style={{ marginBottom: "20px", fontSize: "1.25rem" }}>Voucher Inventory by Category</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px"
        }}>
          {Object.entries(analyticsData.vouchers).map(([amount, stats]) => (
            <div
              key={amount}
              style={{
                padding: "20px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "8px",
                color: "white"
              }}
            >
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "10px" }}>
                {formatCurrency(Number(amount))}
              </div>
              <div style={{ fontSize: "0.875rem", opacity: 0.9, marginBottom: "15px" }}>
                {amount === "500" ? "4HRS" : amount === "1000" ? "24HRS" : "3DAYS"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Total:</span>
                <span style={{ fontWeight: "bold" }}>{stats.total}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Used:</span>
                <span style={{ fontWeight: "bold", color: "#ffeb3b" }}>{stats.used}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Available:</span>
                <span style={{ fontWeight: "bold", color: "#4caf50" }}>{stats.unused}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Sales */}
      <div style={{ marginBottom: "40px" }}>
        <h3 style={{ marginBottom: "20px", fontSize: "1.25rem" }}>Daily Sales (Last 7 Days)</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "10px"
        }}>
          {analyticsData.dailySales.map((day, index) => (
            <div
              key={index}
              style={{
                padding: "15px",
                background: "#f5f5f5",
                borderRadius: "8px",
                textAlign: "center"
              }}
            >
              <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "8px" }}>
                {formatDate(day.date)}
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#667eea", marginBottom: "5px" }}>
                {formatCurrency(day.amount)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#999" }}>
                {day.count} {day.count === 1 ? "sale" : "sales"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Sales */}
      <div style={{ marginBottom: "40px" }}>
        <h3 style={{ marginBottom: "20px", fontSize: "1.25rem" }}>Weekly Sales (Last 4 Weeks)</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "15px"
        }}>
          {analyticsData.weeklySales.map((week, index) => (
            <div
              key={index}
              style={{
                padding: "20px",
                background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                borderRadius: "8px",
                color: "white"
              }}
            >
              <div style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "10px" }}>
                {week.week}
              </div>
              <div style={{ fontSize: "0.75rem", opacity: 0.9, marginBottom: "10px" }}>
                {formatDate(week.startDate)} - {formatDate(week.endDate)}
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "5px" }}>
                {formatCurrency(week.amount)}
              </div>
              <div style={{ fontSize: "0.875rem", opacity: 0.9 }}>
                {week.count} {week.count === 1 ? "sale" : "sales"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Failed Payments */}
      <div>
        <h3 style={{ marginBottom: "20px", fontSize: "1.25rem" }}>Failed Payments</h3>
        <div style={{
          padding: "25px",
          background: analyticsData.failedPayments.count > 0 ? "#fff3cd" : "#d4edda",
          borderRadius: "8px",
          border: `2px solid ${analyticsData.failedPayments.count > 0 ? "#ffc107" : "#28a745"}`,
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "2.5rem",
            fontWeight: "bold",
            color: analyticsData.failedPayments.count > 0 ? "#856404" : "#155724",
            marginBottom: "10px"
          }}>
            {analyticsData.failedPayments.count}
          </div>
          <div style={{
            fontSize: "1rem",
            color: analyticsData.failedPayments.count > 0 ? "#856404" : "#155724",
            marginBottom: "10px"
          }}>
            {analyticsData.failedPayments.count === 1 ? "Failed Payment" : "Failed Payments"}
          </div>
          <div style={{
            fontSize: "1.25rem",
            fontWeight: "600",
            color: analyticsData.failedPayments.count > 0 ? "#856404" : "#155724"
          }}>
            Total Amount: {formatCurrency(analyticsData.failedPayments.amount)}
          </div>
        </div>
      </div>
    </div>
  );
}
