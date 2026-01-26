// app/auth/login/page.js - Multi-tenant login page
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function AuthLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user has a profile in users collection
        try {
          const q = query(collection(db, "users"), where("email", "==", user.email));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            // User has profile, go to dashboard
            router.push("/dashboard");
            return;
          } else {
            // User exists in Firebase Auth but no profile - redirect to complete profile
            router.push("/complete-profile");
            return;
          }
        } catch (err) {
          console.error("Error checking user:", err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user has a profile
      const q = query(collection(db, "users"), where("email", "==", userCredential.user.email));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // User has profile, go to dashboard
        router.push("/dashboard");
      } else {
        // No profile, redirect to complete profile
        router.push("/complete-profile");
      }
    } catch (err) {
      console.error("Login error:", err);
      
      let errorMessage = "Login failed. Please check your credentials.";
      if (err.code === "auth/user-not-found") {
        errorMessage = "No account found with this email. Please sign up first.";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Incorrect password. Please try again.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif"
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    }}>
      <div style={{
        background: "white",
        borderRadius: "12px",
        padding: "40px",
        maxWidth: "500px",
        width: "100%",
        boxShadow: "0 10px 40px rgba(0,0,0,0.1)"
      }}>
        <h1 style={{
          marginBottom: "10px",
          color: "#333",
          fontSize: "28px",
          textAlign: "center"
        }}>
          Login
        </h1>
        <p style={{
          marginBottom: "30px",
          color: "#666",
          fontSize: "14px",
          textAlign: "center"
        }}>
          Sign in to access your dashboard
        </p>

        {error && (
          <div style={{
            padding: "12px",
            background: "#ffebee",
            color: "#c62828",
            borderRadius: "6px",
            marginBottom: "20px",
            fontSize: "14px"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              color: "#333",
              fontWeight: "500"
            }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={signingIn}
              placeholder="your@email.com"
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
            <label style={{
              display: "block",
              marginBottom: "8px",
              color: "#333",
              fontWeight: "500"
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={signingIn}
              placeholder="Enter your password"
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

          <button
            type="submit"
            disabled={signingIn}
            style={{
              width: "100%",
              padding: "14px",
              background: signingIn ? "#ccc" : "#667eea",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: signingIn ? "not-allowed" : "pointer",
              transition: "background 0.2s",
              marginBottom: "15px"
            }}
          >
            {signingIn ? "Signing in..." : "Sign In"}
          </button>

          <p style={{
            textAlign: "center",
            fontSize: "14px",
            color: "#666"
          }}>
            Don't have an account?{" "}
            <a
              href="/signup"
              style={{
                color: "#667eea",
                textDecoration: "none",
                fontWeight: "500"
              }}
            >
              Sign Up
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
