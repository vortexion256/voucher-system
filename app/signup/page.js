// app/signup/page.js - User registration page
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/firebase.js";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    slug: "",
    marzApiKey: "",
    marzApiSecret: "",
  });

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
    setLoading(true);

    // Validation
    if (!formData.email || !formData.password || !formData.name || !formData.slug) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (!validateSlug(formData.slug)) {
      setError("Slug must contain only lowercase letters, numbers, and hyphens");
      setLoading(false);
      return;
    }

    if (formData.slug.length < 3 || formData.slug.length > 30) {
      setError("Slug must be between 3 and 30 characters");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      // Step 1: Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      console.log("✅ Firebase Auth user created:", userCredential.user.email);

      // Step 2: Create user account in Firestore
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          slug: formData.slug.toLowerCase().trim(),
          marzApiKey: formData.marzApiKey || null,
          marzApiSecret: formData.marzApiSecret || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // If user creation fails, delete the Firebase Auth user
        try {
          await userCredential.user.delete();
        } catch (deleteError) {
          console.error("Error deleting Firebase Auth user:", deleteError);
        }
        
        throw new Error(data.message || "Failed to create user account");
      }

      setMessage("Account created successfully! Redirecting to dashboard...");
      
      // Small delay to ensure Firestore write completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Redirect to dashboard
      router.push("/dashboard");

    } catch (err) {
      console.error("Signup error:", err);
      
      let errorMessage = "Failed to create account. Please try again.";
      
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "Email is already registered. Please login instead.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please use a stronger password.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
          Create Account
        </h1>
        <p style={{
          marginBottom: "30px",
          color: "#666",
          fontSize: "14px",
          textAlign: "center"
        }}>
          Sign up to get your own embeddable payment page
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
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
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
              Password *
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="At least 6 characters"
              minLength={6}
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
              Full Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={loading}
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
                // Auto-convert to lowercase and remove spaces
                const slug = e.target.value.toLowerCase().replace(/\s+/g, '-');
                setFormData({ ...formData, slug });
              }}
              required
              disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
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
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              background: loading ? "#ccc" : "#667eea",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s",
              marginBottom: "15px"
            }}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          <p style={{
            textAlign: "center",
            fontSize: "14px",
            color: "#666"
          }}>
            Already have an account?{" "}
            <a
              href="/login"
              style={{
                color: "#667eea",
                textDecoration: "none",
                fontWeight: "500"
              }}
            >
              Login
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
