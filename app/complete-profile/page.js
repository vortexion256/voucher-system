// app/complete-profile/page.js - Complete user profile for existing Firebase Auth accounts
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    marzApiKey: "",
    marzApiSecret: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Check if user record already exists
        try {
          const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            // User already has a profile, redirect to dashboard
            router.push("/dashboard");
            return;
          }
          
          // Pre-fill email (read-only)
          setFormData(prev => ({ ...prev, email: firebaseUser.email }));
        } catch (err) {
          console.error("Error checking user:", err);
          setError("Failed to check user status");
        } finally {
          setLoading(false);
        }
      } else {
        // Not logged in, redirect to login
        router.push("/login?callbackUrl=/complete-profile");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const validateSlug = (slug) => {
    const slugRegex = /^[a-z0-9-]+$/;
    return slugRegex.test(slug);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setChecking(true);

    // Validation
    if (!formData.name || !formData.slug) {
      setError("Name and slug are required");
      setChecking(false);
      return;
    }

    if (!validateSlug(formData.slug)) {
      setError("Slug must contain only lowercase letters, numbers, and hyphens");
      setChecking(false);
      return;
    }

    if (formData.slug.length < 3 || formData.slug.length > 30) {
      setError("Slug must be between 3 and 30 characters");
      setChecking(false);
      return;
    }

    try {
      // Create user account in Firestore
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: formData.name,
          slug: formData.slug.toLowerCase().trim(),
          marzApiKey: formData.marzApiKey || null,
          marzApiSecret: formData.marzApiSecret || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to create user account");
      }

      setMessage("Profile completed successfully! Redirecting to dashboard...");
      
      // Small delay to ensure Firestore write completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Redirect to dashboard
      router.push("/dashboard");

    } catch (err) {
      console.error("Profile completion error:", err);
      setError(err.message || "Failed to complete profile. Please try again.");
    } finally {
      setChecking(false);
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

  if (!user) {
    return null; // Will redirect
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
          Complete Your Profile
        </h1>
        <p style={{
          marginBottom: "30px",
          color: "#666",
          fontSize: "14px",
          textAlign: "center"
        }}>
          Your account exists, but we need a few more details to set up your payment page.
        </p>

        <div style={{
          padding: "12px",
          background: "#e3f2fd",
          color: "#1565c0",
          borderRadius: "6px",
          marginBottom: "20px",
          fontSize: "13px"
        }}>
          <strong>Email:</strong> {user.email}
        </div>

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

        {message && (
          <div style={{
            padding: "12px",
            background: "#e8f5e9",
            color: "#2e7d32",
            borderRadius: "6px",
            marginBottom: "20px",
            fontSize: "14px"
          }}>
            {message}
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
              Full Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={checking}
              placeholder="John Doe"
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
              URL Slug *
            </label>
            <input
              type="text"
              name="slug"
              value={formData.slug}
              onChange={(e) => {
                const slug = e.target.value.toLowerCase().replace(/\s+/g, '-');
                setFormData({ ...formData, slug });
              }}
              required
              disabled={checking}
              placeholder="johndoe"
              pattern="[a-z0-9-]+"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "16px",
                boxSizing: "border-box"
              }}
            />
            <p style={{
              marginTop: "4px",
              fontSize: "12px",
              color: "#666"
            }}>
              Your embed URL will be: <strong>/embed/{formData.slug || "yourslug"}</strong>
            </p>
            <p style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "#999"
            }}>
              Only lowercase letters, numbers, and hyphens allowed
            </p>
          </div>

          <div style={{
            padding: "15px",
            background: "#f5f5f5",
            borderRadius: "6px",
            marginBottom: "20px"
          }}>
            <p style={{
              fontSize: "13px",
              color: "#666",
              marginBottom: "10px",
              fontWeight: "500"
            }}>
              Marz Pay API Credentials (Optional)
            </p>
            <p style={{
              fontSize: "12px",
              color: "#999",
              marginBottom: "15px"
            }}>
              You can add these later in your dashboard
            </p>

            <div style={{ marginBottom: "15px" }}>
              <label style={{
                display: "block",
                marginBottom: "6px",
                color: "#666",
                fontSize: "13px"
              }}>
                API Key
              </label>
              <input
                type="text"
                name="marzApiKey"
                value={formData.marzApiKey}
                onChange={handleChange}
                disabled={checking}
                placeholder="Leave empty to add later"
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{
                display: "block",
                marginBottom: "6px",
                color: "#666",
                fontSize: "13px"
              }}>
                API Secret
              </label>
              <input
                type="password"
                name="marzApiSecret"
                value={formData.marzApiSecret}
                onChange={handleChange}
                disabled={checking}
                placeholder="Leave empty to add later"
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={checking}
            style={{
              width: "100%",
              padding: "14px",
              background: checking ? "#ccc" : "#667eea",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: checking ? "not-allowed" : "pointer",
              transition: "background 0.2s",
              marginBottom: "15px"
            }}
          >
            {checking ? "Completing Profile..." : "Complete Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
