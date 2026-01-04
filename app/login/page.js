"use client";
import { Suspense, useEffect, useState } from "react";
import { auth, db } from "../lib/firebase.js";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const res = await signInWithPopup(auth, provider);
      const email = res.user?.email;
      if (!email) throw new Error("No email on account");

      // Check adminEmails approval
      const q = query(
        collection(db, "adminEmails"),
        where("email", "==", email),
        where("approved", "==", true),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        throw new Error("Your email is not approved for Admin Access");
      }

      const cb = search.get("callbackUrl") || "/admin/vouchers";
      router.replace(cb);
    } catch (e) {
      const code = e?.code || "unknown";
      // Known popup issues: fall back to redirect
      if (
        code === "auth/popup-blocked" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await signInWithRedirect(auth, provider);
          return; // flow will continue after redirect
        } catch (e2) {
          setError(`${e2?.code || "error"}: ${e2?.message || "Redirect sign-in failed"}`);
        }
      } else {
        setError(`${code}: ${e?.message || "Sign-in failed"}`);
      }
    } finally {
      setBusy(false);
    }
  }

  // Process redirect result (and handle already signed-in user)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setError("");
        // If already signed in (e.g., from another tab), proceed
        const current = auth.currentUser;
        if (current?.email) {
          const q1 = query(
            collection(db, "adminEmails"),
            where("email", "==", current.email),
            where("approved", "==", true),
            limit(1)
          );
          const snap1 = await getDocs(q1);
          if (!cancelled) {
            if (!snap1.empty) {
              const cb = search.get("callbackUrl") || "/admin/vouchers";
              router.replace(cb);
              return;
            } else {
              setError("Your email is not approved for admin access");
            }
          }
        }

        // Handle redirect callback
        const res = await getRedirectResult(auth);
        if (res?.user?.email && !cancelled) {
          const q2 = query(
            collection(db, "adminEmails"),
            where("email", "==", res.user.email),
            where("approved", "==", true),
            limit(1)
          );
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            const cb = search.get("callbackUrl") || "/admin/vouchers";
            router.replace(cb);
          } else {
            setError("Your email is not approved for admin access");
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Sign-in failed");
      }
    }
    run();
    return () => { cancelled = true; };
  }, [router, search]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #ecf0ff 0%, #f7f9ff 100%)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #eef0f4",
          borderRadius: 16,
          boxShadow:
            "0 10px 15px -3px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.06)",
          padding: "2rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "#eef2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            DE
          </div>
          <h1 style={{ margin: 0, fontSize: 24, color: "#111827" }}>Admin Login</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Sign in with your approved Google account to continue.
          </p>
        </div>

        <button
          onClick={handleGoogle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "0.8rem 1rem",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all .15s ease",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#f9fafb";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#ffffff";
          }}
          disabled={busy}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 48 48"
          >
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 31.6 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.3 7.1 28.9 5 24 5 17.1 5 10.9 9 7.6 14.7z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.2 18.9 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.3 7.1 28.9 5 24 5 17.1 5 10.9 9 7.6 14.7z"/>
            <path fill="#4CAF50" d="M24 45c5 0 9.4-1.9 12.8-5.1l-5.9-4.8C29 36.7 26.7 37.5 24 37.5c-5.2 0-9.6-3.4-11.2-8.1l-6.6 5C10 40.9 16.5 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 3.2-3.3 5.8-6.2 7.5l.1.1 5.9 4.8c-.4.4 7.9-5.7 7.9-17.4 0-1.3-.1-2.5-.4-3.5z"/>
          </svg>
          {busy ? "Signing in..." : "Continue with Google"}
        </button>

        <div style={{ marginTop: 16, color: "#6b7280", fontSize: 13, textAlign: "center" }}>
          Access is limited to approved admin emails only.
        </div>
        {error && (
          <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 13, textAlign: "center" }}>{error}</div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}
