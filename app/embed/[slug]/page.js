// app/embed/[slug]/page.js
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

export default function EmbedPage() {
  const params = useParams();
  const { slug } = params;
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(500);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [smsSent, setSmsSent] = useState(false);
  const smsLockRef = useRef(false);
  const voucherRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [paymentReference, setPaymentReference] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pollingInterval, setPollingInterval] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Phone number validation for Uganda
  const validatePhoneNumber = (phone) => {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const ugandaPhoneRegex = /^(\+?256|0)?[0-9]{9}$/;
    return ugandaPhoneRegex.test(cleanPhone);
  };

  const formatPhoneNumber = (phone) => {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (cleanPhone.startsWith('0')) {
      return `256${cleanPhone.substring(1)}`;
    } else if (cleanPhone.startsWith('256')) {
      return cleanPhone;
    } else if (cleanPhone.startsWith('+256')) {
      return cleanPhone.substring(1);
    }
    return cleanPhone;
  };

  useEffect(() => {
    // Fetch user by slug to get userId
    async function fetchUser() {
      try {
        setLoading(true);
        const response = await fetch(`/api/users?slug=${slug}`);
        const data = await response.json();
        
        if (data.success) {
          setUserId(data.data.userId);
          setUserName(data.data.name || "");
        } else {
          setError("Invalid embed link. User not found.");
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setError("Failed to load payment page");
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchUser();
    }
  }, [slug]);

  // Helper to set voucher only once
  const setVoucherOnce = (code) => {
    if (!code || voucherRef.current) return;
    voucherRef.current = code;
    setVoucher(code);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setPaymentReference(null);
  };

  const checkPaymentStatus = async (reference) => {
    setCheckingPayment(true);
    try {
      const res = await fetch("/api/check-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, userId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        const status = data.data.status;

        if (status === "successful") {
          const voucherAmount = currentPaymentAmount || amount;
          if (data.data.voucher) {
            setVoucherOnce(data.data.voucher);
            setMessage("Payment successful!");
            return true;
          }
        } else if (status === "failed") {
          setError("This payment failed. Please try again.");
          setPaymentReference(null);
          return true;
        }
        return false;
      } else {
        setError(data.message || "Failed to check payment status");
        setPaymentReference(null);
        return true;
      }
    } catch (err) {
      console.error("Check payment error:", err);
      setError("Failed to check payment status. Please try again.");
      setPaymentReference(null);
      return true;
    } finally {
      setCheckingPayment(false);
    }
  };

  const startPaymentPolling = (reference) => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    setStatusMessage("Payment initiated, waiting for confirmation...");
    let pollCount = 0;
    const maxPolls = 24;

    const pollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount <= 5) {
        setStatusMessage("Payment initiated, waiting for confirmation...");
      } else if (pollCount <= 15) {
        setStatusMessage("Still processing payment, please wait...");
      } else {
        setStatusMessage("Payment taking longer than usual, please be patient...");
      }

      try {
        const isComplete = await checkPaymentStatus(reference);

        if (isComplete) {
          clearInterval(pollInterval);
          setPollingInterval(null);
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setPollingInterval(null);
          setError("Payment timeout after 2 minutes. Please check your phone or try again.");
          setPaymentReference(null);
          setStatusMessage("");
          setCurrentPaymentAmount(null);
        }
      } catch (err) {
        console.error("Error during payment polling:", err);
        clearInterval(pollInterval);
        setPollingInterval(null);
        setError("An error occurred while checking payment status.");
        setPaymentReference(null);
      }
    }, 5000);

    setPollingInterval(pollInterval);

    setTimeout(() => {
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollingInterval(null);
      }
    }, maxPolls * 5000);
  };

  const checkPaymentByPhone = async () => {
    if (!phone.trim()) {
      setError("Enter your phone number to check status");
      return;
    }
    if (!validatePhoneNumber(phone)) {
      setError("Please enter a valid Ugandan phone number");
      return;
    }
    setError("");
    setMessage("");
    setPaymentLoading(true);
    try {
      const res = await fetch("/api/check-payment-by-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatPhoneNumber(phone), userId }),
      });
      const data = await res.json();
      const d = data?.data;
      if (!data.success || !d) {
        setError(data.message || "Could not check status");
        setPaymentReference(null);
        setVoucher(null);
        return;
      }
      if (d.status === "not_found") {
        setError(d.message || "No payment found for this phone number.");
        setPaymentReference(null);
        setVoucher(null);
        return;
      }
      if (d.status === "successful" && d.voucher) {
        setVoucherOnce(d.voucher);
        setCurrentPaymentAmount(d.amount);
        setMessage("Payment found.");
        return;
      }
      if (d.status === "failed") {
        setError("This payment failed. Please try again.");
        setPaymentReference(null);
        return;
      }
      if (d.reference) {
        setCurrentPaymentAmount(d.amount);
        setPaymentReference(d.reference);
        startPaymentPolling(d.reference);
      }
    } catch (err) {
      setError("Failed to check status. Please try again.");
      setPaymentReference(null);
      setVoucher(null);
    } finally {
      setPaymentLoading(false);
    }
  };

  const resendVoucherSms = async () => {
    if (!phone.trim()) {
      setError("Enter your phone number to resend voucher");
      return;
    }
    if (!validatePhoneNumber(phone)) {
      setError("Please enter a valid Ugandan phone number");
      return;
    }
    setError("");
    setMessage("");
    setPaymentLoading(true);
    try {
      const res = await fetch("/api/resend-voucher-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatPhoneNumber(phone), userId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message || "Voucher sent to your phone.");
      } else {
        setError(data.message || "Could not resend. Make a payment first.");
      }
    } catch (err) {
      setError("Failed to resend. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayment = async (paymentAmount = null) => {
    setError("");
    setMessage("");

    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setVoucher(null);
    setSmsSent(false);
    setCurrentPaymentAmount(null);
    smsLockRef.current = false;
    voucherRef.current = null;

    if (!phone.trim()) {
      setError("Please enter a phone number");
      return;
    }

    if (!validatePhoneNumber(phone)) {
      setError("Please enter a valid Ugandan phone number (e.g., 0701234567 or +256701234567)");
      return;
    }

    const amountToUse = paymentAmount || amount;

    if (!amountToUse || amountToUse <= 0) {
      setError("Please select a valid voucher amount");
      return;
    }

    setCurrentPaymentAmount(amountToUse);
    setPaymentLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(phone);
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone, amount: amountToUse, userId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        if (data.data.voucher) {
          setVoucherOnce(data.data.voucher);
        }
        
        if (data.data.voucher) {
          setMessage("Your voucher code is ready.");
        } else {
          if (data.data.reference) {
            const { reference } = data.data;
            setPaymentReference(reference);
            startPaymentPolling(reference);
          }
        }
      } else {
        setError(data.message || "Payment failed. Please try again.");
      }
    } catch (err) {
      console.error("Payment error:", err);
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again later.");
      }
    } finally {
      setPaymentLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif"
      }}>
        <div>Loading payment page...</div>
      </div>
    );
  }

  if (!userId || (error && !paymentReference)) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "20px"
      }}>
        <div style={{ textAlign: "center", maxWidth: "500px" }}>
          <h1 style={{ color: "#d32f2f", marginBottom: "10px" }}>Error</h1>
          <p>{error || "Invalid embed link"}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }
      `}</style>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: "0.25rem",
        backgroundColor: "#f5f5f5"
      }}>
        {/* Main Card */}
        <div style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}>
          {/* Header - Always visible */}
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center", 
            width: "100%", 
            marginBottom: "1rem", 
            textAlign: "center" 
          }}>
            <h1 style={{
              margin: 0,
              fontSize: "1.5rem",
              lineHeight: 1,
              fontWeight: "bold",
              color: "#333"
            }}>
              BUY WIFI CODE
            </h1>
          </div>

          {/* Form Fields - Hidden when processing or voucher received */}
          {!paymentReference && !voucher && (
            <div style={{ width: "100%" }}>
              {/* Phone Number Input */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ 
                  display: "block", 
                  marginBottom: "0.5rem", 
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#333"
                }}>
                  Enter Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="0701234567 or +256701234567"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError("");
                  }}
                  style={{ 
                    padding: "0.75rem", 
                    width: "100%",
                    border: error ? "2px solid #ff4444" : "2px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    boxSizing: "border-box"
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={checkPaymentByPhone}
                    disabled={paymentLoading}
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      color: "#7652AF",
                      background: "none",
                      border: "1px solid #7652AF",
                      borderRadius: "6px",
                      cursor: paymentLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    Check status of a recent payment
                  </button>
                  <button
                    type="button"
                    onClick={resendVoucherSms}
                    disabled={paymentLoading}
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      color: "#28a745",
                      background: "none",
                      border: "1px solid #28a745",
                      borderRadius: "6px",
                      cursor: paymentLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    Resend my last voucher by SMS
                  </button>
                </div>
              </div>

              {/* Voucher Options */}
              <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "1rem", 
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#333"
              }}>
                Voucher Options
              </label>
              
              {/* Voucher Option Buttons */}
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: "0.50rem" 
              }}>
                {/* 4hrs - 500 */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  background: "linear-gradient(135deg, #D93F87 0%, #44328D 100%)",
                  borderRadius: "8px",
                  width: "100%"
                }}>
                  <div style={{ color: "white", textAlign: "left" }}>
                    <div style={{ fontSize: "1rem", fontWeight: "600" }}>4HRS - UGX 500</div>
                  </div>
                  <button
                    onClick={() => {
                      if (!phone.trim()) {
                        setError("Please enter a phone number");
                        return;
                      }
                      if (!validatePhoneNumber(phone)) {
                        setError("Please enter a valid Ugandan phone number");
                        return;
                      }
                      const voucherAmount = 500;
                      setAmount(voucherAmount);
                      handlePayment(voucherAmount);
                    }}
                    disabled={paymentLoading || (paymentReference && !voucher)}
                    style={{ 
                      padding: "0.625rem 1.5rem",
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "700",
                      cursor: (paymentLoading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    BUY
                  </button>
                </div>

                {/* 24hrs - 1000 */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  background: "linear-gradient(135deg, #44328D 0%, #7652AF 100%)",
                  borderRadius: "8px",
                  width: "100%"
                }}>
                  <div style={{ color: "white", textAlign: "left" }}>
                    <div style={{ fontSize: "1rem", fontWeight: "600" }}>24HRS - UGX 1,000</div>
                  </div>
                  <button
                    onClick={() => {
                      if (!phone.trim()) {
                        setError("Please enter a phone number");
                        return;
                      }
                      if (!validatePhoneNumber(phone)) {
                        setError("Please enter a valid Ugandan phone number");
                        return;
                      }
                      const voucherAmount = 1000;
                      setAmount(voucherAmount);
                      handlePayment(voucherAmount);
                    }}
                    disabled={paymentLoading || (paymentReference && !voucher)}
                    style={{ 
                      padding: "0.625rem 1.5rem",
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "700",
                      cursor: (paymentLoading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    BUY
                  </button>
                </div>
              </div>
            </div>

            {/* Payment Providers */}
            <div style={{ 
              marginTop: "1rem", 
              textAlign: "center",
              width: "100%"
            }}>
              <p style={{ 
                margin: "0 0 0.1rem 0", 
                fontSize: "0.875rem", 
                color: "#999",
                fontWeight: "400"
              }}>
                We Accept MTN & Airtel
              </p>
              <div style={{ 
                display: "flex", 
                justifyContent: "center", 
                alignItems: "center",
                gap: "1rem"
              }}>
                <Image 
                  src="/mtn.png" 
                  alt="MTN Mobile Money" 
                  width={50} 
                  height={50} 
                  style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }} 
                />
                <Image 
                  src="/airtel.png" 
                  alt="Airtel Money" 
                  width={50} 
                  height={50} 
                  style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }} 
                />
              </div>
            </div>

            {/* Help Contact */}
            <div style={{ 
              marginTop: "1rem", 
              textAlign: "center",
              width: "100%"
            }}>
              <p style={{ 
                margin: "0 0 0.5rem 0", 
                fontSize: "0.875rem", 
                color: "#666"
              }}>
                For help call <a href="tel:0782830524" style={{ color: "#007bff", textDecoration: "none" }}>0782830524</a>
              </p>
              <p style={{ 
                margin: 0, 
                fontSize: "0.75rem", 
                color: "#999"
              }}>
                Voucher System by AlphaCortex Systems
              </p>
            </div>
            </div>
          )}


          {/* Success Message */}
          {message && !paymentReference && !voucher && (
            <div style={{ 
              marginTop: "1.5rem", 
              padding: "1rem", 
              backgroundColor: "#d4edda", 
              color: "#155724",
              borderRadius: "8px",
              width: "100%",
              textAlign: "center"
            }}>
              {message}
            </div>
          )}

          {/* Error Display - Full Screen (similar to Processing Payment) */}
          {error && !paymentReference && !voucher && (
            <div style={{ 
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 2rem",
              width: "100%"
            }}>
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center",
                marginBottom: "2rem"
              }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "#ff4444"
                }}>
                  <span>Error</span>
                  <p style={{
                    margin: "0.5rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "#666",
                    textAlign: "center",
                    fontWeight: "400"
                  }}>
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Processing Payment Animation - Full Screen */}
          {paymentReference && !voucher && (
            <div style={{ 
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 2rem",
              width: "100%"
            }}>
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center",
                marginBottom: "2rem"
              }}>
                <div style={{
                  width: "60px",
                  height: "60px",
                  border: "5px solid #e9ecef",
                  borderTop: "5px solid #7652AF",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  marginBottom: "2rem"
                }}></div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  background: "linear-gradient(135deg, #D93F87 0%, #7652AF 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}>
                  <span>Processing Payment</span>
                  <p style={{
                    margin: "0.5rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "#666",
                    textAlign: "center",
                    fontWeight: "400"
                  }}>
                    (confirm purchase on your mobile phone and enter pin, (MARZ INNOVATION LIMITED) for help call the number below
                  </p>
                  <div style={{
                    display: "flex",
                    gap: "3px"
                  }}>
                    <div style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: "#7652AF",
                      borderRadius: "50%",
                      animation: "bounce 1.4s ease-in-out infinite both"
                    }}></div>
                    <div style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: "#7652AF",
                      borderRadius: "50%",
                      animation: "bounce 1.4s ease-in-out infinite both",
                      animationDelay: "0.16s"
                    }}></div>
                    <div style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: "#7652AF",
                      borderRadius: "50%",
                      animation: "bounce 1.4s ease-in-out infinite both",
                      animationDelay: "0.32s"
                    }}></div>
                  </div>
                </div>
              </div>
              
              <p style={{ 
                margin: 0, 
                fontSize: "1rem",
                color: "#6c757d",
                textAlign: "center"
              }}>
                Please wait while we confirm your payment...
              </p>
              
            </div>
          )}
          
          {/* Voucher Display - Full Screen */}
          {voucher && (
            <div style={{ 
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 2rem",
              width: "100%"
            }}>
              <h2 style={{ 
                marginBottom: "1.5rem", 
                color: "#28a745", 
                fontSize: "1.5rem",
                fontWeight: "700",
                textAlign: "center"
              }}>
                Payment Successful!
              </h2>
              
              <p style={{ 
                marginBottom: "1rem", 
                fontSize: "0.875rem", 
                color: "#666",
                textAlign: "center"
              }}>
                Your Voucher Code:
              </p>
              
              <div style={{ 
                fontSize: "2rem", 
                fontWeight: "bold", 
                color: "#28a745",
                backgroundColor: "#e0ffe0",
                padding: "1.5rem 2rem",
                borderRadius: "12px",
                border: "3px dashed #28a745",
                marginBottom: "1.5rem",
                letterSpacing: "0.1em",
                textAlign: "center",
                width: "100%",
                maxWidth: "300px"
              }}>
                {voucher}
              </div>
              
              <p style={{ 
                margin: 0, 
                fontSize: "0.875rem", 
                color: "#666",
                textAlign: "center",
                maxWidth: "280px"
              }}>
                Save this code! You can use it to Login to ENOX SUPER FAST WiFi HOTSPOT
              </p>
              <button
                type="button"
                onClick={resendVoucherSms}
                disabled={paymentLoading}
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  color: "#28a745",
                  background: "none",
                  border: "1px solid #28a745",
                  borderRadius: "8px",
                  cursor: paymentLoading ? "not-allowed" : "pointer",
                }}
              >
                Resend code by SMS
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
