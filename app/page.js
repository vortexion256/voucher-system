"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { updatePaymentStatus } from "./lib/storage.js";
import { doc, setDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
// import { db } from "@/lib/firebase.js";
import { db } from "./lib/firebase.js"; // relative path
// import { doc, setDoc, serverTimestamp } from "firebase/firestore";
// import { db } from "./lib/firebase";



export default function Home() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(500);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState(null); // Store the amount being paid
  const [loading, setLoading] = useState(false);
  const [voucher, setVoucher] = useState(null);
  const [smsSent, setSmsSent] = useState(false);
  const smsLockRef = useRef(false);
  const voucherRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [paymentReference, setPaymentReference] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pollingInterval, setPollingInterval] = useState(null);



  // Phone number validation for Uganda
  const validatePhoneNumber = (phone) => {
    // Remove any spaces or special characters
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    // Check if it's a valid Ugandan phone number (starts with 256, 0, or +256)
    const ugandaPhoneRegex = /^(\+?256|0)?[0-9]{9}$/;
    return ugandaPhoneRegex.test(cleanPhone);
  };

  // Auto-send SMS with voucher code once available (only once per purchase)
  useEffect(() => {
    if (!voucher || !phone) {
      console.log("📱 SMS: Missing voucher or phone", { voucher: !!voucher, phone });
      return;
    }
    if (smsLockRef.current) {
      console.log("📱 SMS: Already sent (locked)");
      return; // prevent duplicate sends due to re-renders/StrictMode
    }
    smsLockRef.current = true;
    console.log("📱 SMS: Starting SMS send process");

    (async () => {
      try {
        const formattedNumber = formatPhoneNumber(phone);
        // Add + prefix for EGOSMS API
        const number = formattedNumber.startsWith('256') ? `+${formattedNumber}` : formattedNumber;
        const message = `Your wifi code ${voucher}`;

        console.log("📱 SMS: Sending to", { number, messageLength: message.length });

        console.time("📱 SMS API Call");
        const response = await fetch("/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number, message }),
        });

        const result = await response.json();
        console.timeEnd("📱 SMS API Call");
        console.log("📱 SMS: API Response", result);

        if (!response.ok || !result.success) {
          console.error("❌ SMS: Failed to send", result);
          setError("Failed to send SMS with voucher code. Please contact support.");
        } else {
          console.log("✅ SMS: Sent successfully");
        }
      } catch (err) {
        console.error("❌ SMS: Error sending SMS", err);
        setError("Failed to send SMS with voucher code. Please contact support.");
      } finally {
        setSmsSent(true);
      }
    })();
  }, [voucher, phone]);

  // Helper to set voucher only once and stop any ongoing polling
  const setVoucherOnce = (code) => {
    console.time(`🎫 Voucher Processing - ${code}`);
    if (!code) {
      console.timeEnd(`🎫 Voucher Processing - ${code}`);
      return;
    }
    if (voucherRef.current) {
      console.timeEnd(`🎫 Voucher Processing - ${code}`);
      return;
    }
    voucherRef.current = code;
    setVoucher(code);
    // Stop polling defensively
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setPaymentReference(null);
    console.timeEnd(`🎫 Voucher Processing - ${code}`);
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


const saveTransactionOnce = async ({
  reference,
  phone,
  amount,
  status,
  voucher = null,
}) => {
  if (!reference) {
    console.error("❌ Cannot save transaction: Missing reference");
    return;
  }

  try {
    console.time(`💾 Firestore Save - ${reference}`);
    await setDoc(
      doc(db, "transactions", reference), // Using reference as document ID
      {
        reference,
        phone,
        amount,
        status,
        voucher,
        createdAt: serverTimestamp(),
      },
      { merge: false } // Prevents overwriting existing documents
    );
    console.timeEnd(`💾 Firestore Save - ${reference}`);
    console.log("✅ Transaction saved successfully:", reference);
  } catch (err) {
    if (err.code === 'permission-denied') {
      console.error("❌ Permission denied. Check your Firebase rules.");
    } else if (err.code === 'not-found') {
      console.error("❌ Firestore database not found. Check your Firebase configuration.");
    } else {
      console.error("❌ Failed to save transaction:", err);
    }
    throw err; // Re-throw to handle in the calling function
  }
};


  const checkPaymentStatus = async (reference) => {
    const apiCallId = `api_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.time(`🔍 Check Payment API - ${apiCallId}`);
    setCheckingPayment(true);
    try {
      console.log(`🔍 Checking payment status for reference: ${reference}`);

      const res = await fetch("/api/check-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log("📊 Payment status response:", data);

    if (data.success) {
      const status = data.data.status;
      console.log(`📊 Current status: ${status}`);

      if (status === "successful") {
        console.log("✅ Payment marked successful");

        // Determine the voucher amount
        const voucherAmount = currentPaymentAmount || amount;

        // If API returned a voucher, use it directly
        if (data.data && data.data.voucher) {
          setVoucherOnce(data.data.voucher);
          setMessage("Payment completed! Your voucher is ready.");
          setPaymentReference(null);

          // ✅ Save successful transaction to Firestore
          try {
              await saveTransactionOnce({
                reference,
                phone,
                amount: data.data.amount,
                voucher: data.data.voucher,
                status: "successful",
              });

              console.log("✅ Transaction saved to Firestore");
          } catch (fireErr) {
            console.error("❌ Failed to save transaction:", fireErr);
          }
          return true;
        }

        // If no voucher returned, this means check-payment API couldn't assign one
        // This should not happen with our consolidated approach, but handle gracefully
        console.error(`❌ Payment successful but no voucher assigned by check-payment API`);
        setError(`Payment completed for ${voucherAmount} UGX, but voucher assignment failed. Please contact support with reference: ${reference}`);
        return true;

      } else if (status === "failed") {
        console.log("❌ Payment failed.");
        setError("Payment failed. Please try again.");
        setPaymentReference(null);

        // Optionally save failed attempt
        try {
          console.time(`💾 Firestore Save Failed - ${reference}`);
          await addDoc(collection(db, "transactions"), {
            phone,
            amount: currentPaymentAmount || amount,
            status: "failed",
            reference,
            createdAt: new Date(),
          });
          console.timeEnd(`💾 Firestore Save Failed - ${reference}`);
          console.log("⚠️ Failed transaction recorded in Firestore.");
        } catch (fireErr) {
          console.error("❌ Failed to record failed transaction:", fireErr);
        }

        return true; // stop polling

      } else {
        console.log(`⏳ Payment still ${status}, continuing to poll...`);
        return false; // Still processing
      }

    } else {
      console.error(`❌ Payment check failed: ${data.message}`);
      setError(data.message || "Failed to check payment status");
      return true; // Stop polling
    }
  } catch (err) {
    console.error("❌ Check payment error:", err);
    setError("Failed to check payment status. Please try again.");
    return true; // Stop polling
  } finally {
    setCheckingPayment(false);
    console.timeEnd(`🔍 Check Payment API - ${apiCallId}`);
  }
};


const startPaymentPolling = (reference) => {
  console.log(`🔄 Starting payment polling for reference: ${reference}`);
  const pollingSessionId = `polling_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.time(`🔄 Total Polling Time - ${pollingSessionId}`);

  // Clear any existing polling interval first
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  setStatusMessage("Payment initiated, waiting for confirmation...");
  let pollCount = 0;
  const maxPolls = 24; // 5 seconds * 24 = 120 seconds (2 minutes) max polling
  let pollingActive = true;
  let pollingCompleted = false; // Flag to ensure timer is only ended once

  const pollInterval = setInterval(async () => {
    if (!pollingActive) {
      console.log(`🛑 Polling stopped for reference: ${reference}`);
      return;
    }

    pollCount++;
    console.log(`🔍 Polling attempt ${pollCount}/${maxPolls} for reference: ${reference}`);

    // Update user-friendly status message based on attempts
    if (pollCount <= 5) {
      setStatusMessage("Payment initiated, waiting for confirmation...");
    } else if (pollCount <= 15) {
      setStatusMessage("Still processing payment, please wait...");
    } else if (pollCount <= 25) {
      setStatusMessage("Payment taking longer than usual, please be patient...");
    } else {
      setStatusMessage("Final attempt, please check your phone for confirmation...");
    }

    // Timeout warning at 75 seconds (15 polls * 5 seconds)
    if (pollCount === 15) {
      console.warn("⚠️ Payment taking longer than expected.");
    }

    try {
      const isComplete = await checkPaymentStatus(reference);

      if (isComplete && !pollingCompleted) {
        console.log(`✅ Payment completed for reference: ${reference}`);
        setStatusMessage("Payment completed successfully!");
        pollingActive = false;
        pollingCompleted = true;
        clearInterval(pollInterval);
        setPollingInterval(null);
        console.timeEnd(`🔄 Total Polling Time - ${pollingSessionId}`);
      } else if (pollCount >= maxPolls && !pollingCompleted) {
        console.log(`⏰ Polling timeout reached for reference: ${reference}`);
        pollingActive = false;
        pollingCompleted = true;
        clearInterval(pollInterval);
        setPollingInterval(null);
        if (paymentReference === reference) {
          setError("Payment timeout after 2 minutes. Please check your phone or try again.");
          setPaymentReference(null);
          setStatusMessage("Payment timeout - please try again");
          updatePaymentStatus(reference, "failed");
          console.timeEnd(`🔄 Total Polling Time - ${pollingSessionId}`);
        }
      }
    } catch (err) {
      console.error("❌ Error during payment polling:", err);
      if (!pollingCompleted) {
        pollingActive = false;
        pollingCompleted = true;
        clearInterval(pollInterval);
        setPollingInterval(null);
        setError("An error occurred while checking payment status.");
        console.timeEnd(`🔄 Total Polling Time - ${pollingSessionId}`);
      }
    }
  }, 5000); // Poll every 5 seconds

  // Save the interval id so you can clear it later if needed
  setPollingInterval(pollInterval);

  // Backup timeout (in case interval fails)
  setTimeout(() => {
    if (pollingActive) {
      console.log(`⏰ Backup timeout reached for reference: ${reference}`);
      pollingActive = false;
      clearInterval(pollInterval);
      setPollingInterval(null);
      if (paymentReference === reference) {
        setError("Payment timeout after 2 minutes. Please check your phone or try again.");
        setPaymentReference(null);
        setStatusMessage("Payment timeout - please try again");
        updatePaymentStatus(reference, "failed");
      }
    }
  }, maxPolls * 2000);
};


  // const startPaymentPolling = (reference) => {
  //   console.log(`🔄 Starting payment polling for reference: ${reference}`);
    
  //   // Clear any existing polling
  //   if (pollingInterval) {
  //     clearInterval(pollingInterval);
  //   }
    
  //   setStatusMessage("Payment initiated, waiting for confirmation...");
  //   let pollCount = 0;
  //   const maxPolls = 60; // 30 * 2 seconds = 60 seconds max
  //   let pollingActive = true; // Flag to control polling
    
  //   const pollInterval = setInterval(async () => {
  //     if (!pollingActive) {
  //       console.log(`🛑 Polling stopped for reference: ${reference}`);
  //       return;
  //     }
      
  //     pollCount++;
  //     console.log(`🔍 Polling attempt ${pollCount}/${maxPolls} for reference: ${reference}`);
      
  //     // Update status message based on polling progress
  //     if (pollCount <= 5) {
  //       setStatusMessage("Payment initiated, waiting for confirmation...");
  //     } else if (pollCount <= 15) {
  //       setStatusMessage("Still processing payment, please wait...");
  //     } else if (pollCount <= 25) {
  //       setStatusMessage("Payment taking longer than usual, please be patient...");
  //     } else {
  //       setStatusMessage("Final attempt, please check your phone for confirmation...");
  //     }
      
  //     // Show timeout warning after 30 seconds (15 attempts)
  //     if (pollCount === 15) {
  //       console.log("⚠️ Payment taking longer than expected - user can stop if needed");
  //     }
      
  //     const isComplete = await checkPaymentStatus(reference);
  //     if (isComplete) {
  //       console.log(`✅ Payment completed for reference: ${reference}`);
  //       setStatusMessage("Payment completed successfully!");
  //       pollingActive = false;
  //       clearInterval(pollInterval);
  //       setPollingInterval(null);
  //     } else if (pollCount >= maxPolls) {
  //       console.log(`⏰ Polling timeout reached for reference: ${reference}`);
  //       pollingActive = false;
  //       clearInterval(pollInterval);
  //       setPollingInterval(null);
  //       if (paymentReference === reference) {
  //         setError("Payment timeout after 60 seconds. Please check your phone for payment confirmation or try again.");
  //         setPaymentReference(null);
  //         setStatusMessage("Payment timeout - please try again");
  //         // Trigger failed status in storage
  //         updatePaymentStatus(reference, "failed");
  //       }
  //     }
  //   }, 2000); // Check every 2 seconds as requested
    
  //   // Store the interval for cleanup
  //   setPollingInterval(pollInterval);

  //   // Stop polling after 60 seconds - backup timeout
  //   setTimeout(() => {
  //     if (pollingActive) {
  //       console.log(`⏰ Backup timeout reached for reference: ${reference}`);
  //       pollingActive = false;
  //       clearInterval(pollInterval);
  //       setPollingInterval(null);
  //       if (paymentReference === reference) {
  //         setError("Payment timeout after 60 seconds. Please check your phone for payment confirmation or try again.");
  //         setPaymentReference(null);
  //         setStatusMessage("Payment timeout - please try again");
  //         // Trigger failed status in storage
  //         updatePaymentStatus(reference, "failed");
  //       }
  //     }
  //   }, 60000); // 60 seconds timeout
  // };

  const simulateFailedPayment = async () => {
    if (!paymentReference) {
      setError("No payment reference to simulate failure");
      return;
    }

    try {
      const res = await fetch("/api/test-failed-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: paymentReference }),
      });

      if (res.ok) {
        setMessage("Payment status updated to failed. Check status to see the failure.");
      } else {
        setError("Failed to simulate payment failure");
      }
    } catch (err) {
      setError("Error simulating payment failure");
    }
  };

  // Function to notify admin when vouchers are unavailable
  const notifyAdminOutOfVouchers = async () => {
    try {
      const adminMessage = "Urgent: System out of Vouchers";
      const adminNumber = "+256782830524"; // Admin phone number

      console.log("📱 Notifying admin about voucher shortage");

      console.time("📱 Admin SMS API Call");
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: adminNumber,
          message: adminMessage
        }),
      });

      const result = await response.json();
      console.timeEnd("📱 Admin SMS API Call");
      if (response.ok && result.success) {
        console.log("✅ Admin notified about voucher shortage");
      } else {
        console.error("❌ Failed to notify admin:", result);
      }
    } catch (err) {
      console.error("❌ Error notifying admin:", err);
    }
  };

  const handlePayment = async (paymentAmount = null) => {
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.time(`💰 Total Payment Process - ${paymentId}`);

    setError("");
    setMessage("");

    // Clear any existing polling before starting new payment
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setVoucher(null);
    setSmsSent(false);
    setCurrentPaymentAmount(null); // Clear stored payment amount
    smsLockRef.current = false;
    voucherRef.current = null;

    // Validation
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

    // Store the payment amount for voucher fetching
    setCurrentPaymentAmount(amountToUse);

    // ✅ STEP 1: Check voucher availability BEFORE charging user
    setLoading(true);
    try {
      console.log("🔍 Checking voucher availability before payment...");

      const availabilityRes = await fetch("/api/check-voucher-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountToUse }),
      });

      const availabilityData = await availabilityRes.json();

      if (!availabilityData.success || !availabilityData.available) {
        console.error("❌ No vouchers available for amount:", amountToUse);
        setError("System Error please call Admin");

        // Notify admin about voucher shortage
        await notifyAdminOutOfVouchers();

        setLoading(false);
        return;
      }

      console.log(`✅ Vouchers available: ${availabilityData.count} for ${amountToUse} UGX`);

    } catch (availabilityErr) {
      console.error("❌ Error checking voucher availability:", availabilityErr);
      setError("System Error please call Admin");

      // Notify admin about system error
      await notifyAdminOutOfVouchers();

      setLoading(false);
      return;
    }

    // ✅ STEP 2: Proceed with payment only if vouchers are available
    try {
      const formattedPhone = formatPhoneNumber(phone);
      console.log("💳 Initiating payment with:", { phone: formattedPhone, amount: amountToUse, amountType: typeof amountToUse });

      console.time("🔄 Payment API Call");
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone, amount: amountToUse }),
      });
      console.timeEnd("🔄 Payment API Call");

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        // Only set voucher if it exists (payment was successful)
        if (data.data.voucher) {
          setVoucherOnce(data.data.voucher);
        }
        
        // Hide success message - just handle the logic silently
        const marzResponse = data.data.paymentResponse;
        let successMessage = ""; // Empty message - no green card shown
        
        if (data.data.voucher) {
          // Only show message if voucher is ready
          successMessage = "Your voucher code is ready.";
        } else {
          // No message shown for processing - just start polling silently
          // Store reference for polling if payment is still processing
          if (data.data.reference) {
             const { reference, transactionUuid } = data.data; // <-- add this line
            setPaymentReference(data.data.reference);
            // Start polling for payment status
            
            startPaymentPolling(reference, transactionUuid); // <-- updated to include transactionUuid
          }
        }
        
        // Hide detailed transaction information - just show simple message
        // if (marzResponse && marzResponse.data) {
        //   const transaction = marzResponse.data.transaction;
        //   const collection = marzResponse.data.collection;
        //   
        //   if (transaction && collection) {
        //     successMessage = `Payment ${marzResponse.status}! 
        //     Transaction ID: ${transaction.uuid}
        //     Amount: ${collection.amount.formatted} ${collection.amount.currency}
        //     Status: ${transaction.status}
        //     Mode: ${collection.mode}`;
        //     
        //     if (data.data.voucher) {
        //       successMessage += `\nVoucher Code: ${data.data.voucher}`;
        //     }
        //   }
        // }
        
        setMessage(successMessage);
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
      setLoading(false);
      console.timeEnd(`💰 Total Payment Process - ${paymentId}`);
    }
  };

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
          {/* Header */}
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
                    fontSize: "1.2rem",
                    boxSizing: "border-box",
                    color: "#000"  // Force black text always, override dark mode
                  }}
                />
                {error && (
                  <p style={{ 
                    color: "#ff4444", 
                    fontSize: "0.875rem", 
                    marginTop: "0.5rem",
                    marginBottom: 0
                  }}>
                    {error}
                  </p>
                )}
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
                    disabled={loading || (paymentReference && !voucher)}
                    style={{ 
                      padding: "0.625rem 1.5rem",
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "700",
                      cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
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
                    disabled={loading || (paymentReference && !voucher)}
                    style={{ 
                      padding: "0.625rem 1.5rem",
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "700",
                      cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    BUY
                  </button>
                </div>

                {/* 3days - 2500 - COMMENTED OUT TEMPORARILY */}
                {/*
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  background: "linear-gradient(135deg, #7652AF 0%, #352154 100%)",
                  borderRadius: "8px",
                  width: "100%"
                }}>
                  <div style={{ color: "white", textAlign: "left" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>3DAYS</div>
                    <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 2,500</div>
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
                      const voucherAmount = 2500;
                      setAmount(voucherAmount);
                      handlePayment(voucherAmount);
                    }}
                    disabled={loading || (paymentReference && !voucher)}
                    style={{
                      padding: "0.625rem 1.5rem",
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "700",
                      cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    BUY
                  </button>
                </div>
                */}

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
              
              {/* Status Message - COMMENTED OUT */}
              {/*
              {statusMessage && (
                <div style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  backgroundColor: "#fff3cd",
                  color: "#856404",
                  borderRadius: "8px",
                  width: "100%",
                  maxWidth: "300px",
                  textAlign: "center",
                  fontSize: "0.875rem",
                  border: "1px solid #ffeaa7"
                }}>
                  {statusMessage}
                </div>
              )}
              */}
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
              <div style={{
                width: "80px",
                height: "80px",
                background: "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "2rem"
              }}>
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}


// "use client";

// import React, { useEffect, useRef, useState } from "react";
// import Image from "next/image";
// import { updatePaymentStatus } from "./lib/storage.js";
// import { addDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
// // import { db } from "@/lib/firebase.js";
// import { db } from "./lib/firebase.js"; // relative path



// export default function Home() {
//   const [phone, setPhone] = useState("");
//   const [amount, setAmount] = useState(500);
//   const [currentPaymentAmount, setCurrentPaymentAmount] = useState(null); // Store the amount being paid
//   const [loading, setLoading] = useState(false);
//   const [voucher, setVoucher] = useState(null);
//   const [smsSent, setSmsSent] = useState(false);
//   const smsLockRef = useRef(false);
//   const voucherRef = useRef(null);
//   const [message, setMessage] = useState("");
//   const [error, setError] = useState("");
//   const [paymentReference, setPaymentReference] = useState(null);
//   const [checkingPayment, setCheckingPayment] = useState(false);
//   const [debugMode, setDebugMode] = useState(false);
//   const [statusMessage, setStatusMessage] = useState("");
//   const [pollingInterval, setPollingInterval] = useState(null);

//   // Helper function to check if transaction has already been logged
//   const hasTransactionBeenLogged = async (reference) => {
//     try {
//       const q = query(collection(db, "transactions"), where("reference", "==", reference), limit(1));
//       const snapshot = await getDocs(q);
//       return !snapshot.empty;
//     } catch (error) {
//       console.error("Error checking transaction existence:", error);
//       return false; // If check fails, allow logging to avoid missing transactions
//     }
//   };

//   // Phone number validation for Uganda
//   const validatePhoneNumber = (phone) => {
//     // Remove any spaces or special characters
//     const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
//     // Check if it's a valid Ugandan phone number (starts with 256, 0, or +256)
//     const ugandaPhoneRegex = /^(\+?256|0)?[0-9]{9}$/;
//     return ugandaPhoneRegex.test(cleanPhone);
//   };

//   // Auto-send SMS with voucher code once available (only once per purchase)
//   useEffect(() => {
//     if (!voucher || !phone) {
//       console.log("📱 SMS: Missing voucher or phone", { voucher: !!voucher, phone });
//       return;
//     }
//     if (smsLockRef.current) {
//       console.log("📱 SMS: Already sent (locked)");
//       return; // prevent duplicate sends due to re-renders/StrictMode
//     }
//     smsLockRef.current = true;
//     console.log("📱 SMS: Starting SMS send process");

//     (async () => {
//       try {
//         const formattedNumber = formatPhoneNumber(phone);
//         // Add + prefix for EGOSMS API
//         const number = formattedNumber.startsWith('256') ? `+${formattedNumber}` : formattedNumber;
//         const message = `Your wifi code ${voucher}`;

//         console.log("📱 SMS: Sending to", { number, messageLength: message.length });

//         const response = await fetch("/api/send-sms", {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ number, message }),
//         });

//         const result = await response.json();
//         console.log("📱 SMS: API Response", result);

//         if (!response.ok || !result.success) {
//           console.error("❌ SMS: Failed to send", result);
//           setError("Failed to send SMS with voucher code. Please contact support.");
//         } else {
//           console.log("✅ SMS: Sent successfully");
//         }
//       } catch (err) {
//         console.error("❌ SMS: Error sending SMS", err);
//         setError("Failed to send SMS with voucher code. Please contact support.");
//       } finally {
//         setSmsSent(true);
//       }
//     })();
//   }, [voucher, phone]);

//   // Helper to set voucher only once and stop any ongoing polling
//   const setVoucherOnce = (code) => {
//     if (!code) return;
//     if (voucherRef.current) return;
//     voucherRef.current = code;
//     setVoucher(code);
//     // Stop polling defensively
//     if (pollingInterval) {
//       clearInterval(pollingInterval);
//       setPollingInterval(null);
//     }
//     setPaymentReference(null);
//   };

//   const formatPhoneNumber = (phone) => {
//     const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
//     if (cleanPhone.startsWith('0')) {
//       return `256${cleanPhone.substring(1)}`;
//     } else if (cleanPhone.startsWith('256')) {
//       return cleanPhone;
//     } else if (cleanPhone.startsWith('+256')) {
//       return cleanPhone.substring(1);
//     }
//     return cleanPhone;
//   };





//   const checkPaymentStatus = async (reference) => {
//   setCheckingPayment(true);
//   try {
//     console.log(`🔍 Checking payment status for reference: ${reference}`);
    
//     const res = await fetch("/api/check-payment", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ reference }),
//     });

//     if (!res.ok) {
//       throw new Error(`HTTP error! status: ${res.status}`);
//     }

//     const data = await res.json();
//     console.log("📊 Payment status response:", data);

//     if (data.success) {
//       const status = data.data.status;
//       console.log(`📊 Current status: ${status}`);

//       if (status === "successful") {
//         console.log("✅ Payment marked successful, fetching voucher...");

//         // If API already returned a voucher, use it directly
//         if (data.data && data.data.voucher) {
//           setVoucherOnce(data.data.voucher);
//           setMessage("Payment completed! Your voucher is ready.");
//           setPaymentReference(null);

//           // ✅ Save successful transaction to Firestore
//           try {
//             if (!await hasTransactionBeenLogged(reference)) {
//               await addDoc(collection(db, "transactions"), {
//                 phone,
//                 amount: currentPaymentAmount || amount,
//                 voucher: data.data.voucher,
//                 status: "successful",
//                 reference,
//                 createdAt: new Date(),
//               });
//               console.log("✅ Transaction saved to Firestore");
//             }
//           } catch (fireErr) {
//             console.error("❌ Failed to save transaction:", fireErr);
//           }
//           return true;
//         }

//         // Otherwise fetch from vouchers inventory using stored payment amount
//         const voucherAmount = currentPaymentAmount || amount; // Use stored payment amount or fallback to state
//         console.log("🎫 Fetching voucher for amount:", voucherAmount);

//         const voucherRes = await fetch("/api/get-voucher", {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ amount: voucherAmount, phone }),
//         });

//         const voucherData = await voucherRes.json();

//         if (voucherData.success) {
//           setVoucherOnce(voucherData.voucher);
//           setMessage("Payment completed! Your voucher is ready.");
//           setPaymentReference(null); // clear after completion

//           // ✅ Save successful transaction to Firestore 1000ugx
//           try {
//             if (!await hasTransactionBeenLogged(reference)) {
//               await addDoc(collection(db, "transactions"), {
//                 phone,
//                 amount: voucherAmount,  // This should be the correct amount from the voucher
//                 voucher: voucherData.voucher,
//                 status: "successful",
//                 reference,
//                 createdAt: new Date(),
//               });
//               console.log("✅ Transaction saved to Firestore");
//             }
//           } catch (fireErr) {
//             console.error("❌ Failed to save transaction:", fireErr);
//           }

//           return true; // Payment completed
//         } else {
//           console.error(`❌ Voucher assignment failed: ${voucherData.message || 'Unknown error'}`);
//           setError(`Payment completed for ${voucherAmount} UGX, but no voucher available for this amount. Please contact support with reference: ${reference}`);
//           return true;
//         }

//       } else if (status === "failed") {
//         console.log("❌ Payment failed.");
//         setError("Payment failed. Please try again.");
//         setPaymentReference(null);

//         // Optionally save failed attempt
//         try {
//           await addDoc(collection(db, "transactions"), {
//             phone,
//             amount: currentPaymentAmount || amount,
//             status: "failed",
//             reference,
//             createdAt: new Date(),
//           });
//           console.log("⚠️ Failed transaction recorded in Firestore.");
//         } catch (fireErr) {
//           console.error("❌ Failed to record failed transaction:", fireErr);
//         }

//         return true; // stop polling

//       } else {
//         console.log(`⏳ Payment still ${status}, continuing to poll...`);
//         return false; // Still processing
//       }

//     } else {
//       console.error(`❌ Payment check failed: ${data.message}`);
//       setError(data.message || "Failed to check payment status");
//       return true; // Stop polling
//     }
//   } catch (err) {
//     console.error("❌ Check payment error:", err);
//     setError("Failed to check payment status. Please try again.");
//     return true; // Stop polling
//   } finally {
//     setCheckingPayment(false);
//   }
// };


//   const startPaymentPolling = (reference) => {
//     console.log(`🔄 Starting payment polling for reference: ${reference}`);
    
//     // Clear any existing polling
//     if (pollingInterval) {
//       clearInterval(pollingInterval);
//     }
    
//     setStatusMessage("Payment initiated, waiting for confirmation...");
//     let pollCount = 0;
//     const maxPolls = 60; // 30 * 2 seconds = 60 seconds max
//     let pollingActive = true; // Flag to control polling
    
//     const pollInterval = setInterval(async () => {
//       if (!pollingActive) {
//         console.log(`🛑 Polling stopped for reference: ${reference}`);
//         return;
//       }
      
//       pollCount++;
//       console.log(`🔍 Polling attempt ${pollCount}/${maxPolls} for reference: ${reference}`);
      
//       // Update status message based on polling progress
//       if (pollCount <= 5) {
//         setStatusMessage("Payment initiated, waiting for confirmation...");
//       } else if (pollCount <= 15) {
//         setStatusMessage("Still processing payment, please wait...");
//       } else if (pollCount <= 25) {
//         setStatusMessage("Payment taking longer than usual, please be patient...");
//       } else {
//         setStatusMessage("Final attempt, please check your phone for confirmation...");
//       }
      
//       // Show timeout warning after 30 seconds (15 attempts)
//       if (pollCount === 15) {
//         console.log("⚠️ Payment taking longer than expected - user can stop if needed");
//       }
      
//       const isComplete = await checkPaymentStatus(reference);
//       if (isComplete) {
//         console.log(`✅ Payment completed for reference: ${reference}`);
//         setStatusMessage("Payment completed successfully!");
//         pollingActive = false;
//         clearInterval(pollInterval);
//         setPollingInterval(null);
//       } else if (pollCount >= maxPolls) {
//         console.log(`⏰ Polling timeout reached for reference: ${reference}`);
//         pollingActive = false;
//         clearInterval(pollInterval);
//         setPollingInterval(null);
//         if (paymentReference === reference) {
//           setError("Payment timeout after 60 seconds. Please check your phone for payment confirmation or try again.");
//           setPaymentReference(null);
//           setStatusMessage("Payment timeout - please try again");
//           // Trigger failed status in storage
//           updatePaymentStatus(reference, "failed");
//         }
//       }
//     }, 2000); // Check every 2 seconds as requested
    
//     // Store the interval for cleanup
//     setPollingInterval(pollInterval);

//     // Stop polling after 60 seconds - backup timeout
//     setTimeout(() => {
//       if (pollingActive) {
//         console.log(`⏰ Backup timeout reached for reference: ${reference}`);
//         pollingActive = false;
//         clearInterval(pollInterval);
//         setPollingInterval(null);
//         if (paymentReference === reference) {
//           setError("Payment timeout after 60 seconds. Please check your phone for payment confirmation or try again.");
//           setPaymentReference(null);
//           setStatusMessage("Payment timeout - please try again");
//           // Trigger failed status in storage
//           updatePaymentStatus(reference, "failed");
//         }
//       }
//     }, 60000); // 60 seconds timeout
//   };

//   const simulateFailedPayment = async () => {
//     if (!paymentReference) {
//       setError("No payment reference to simulate failure");
//       return;
//     }

//     try {
//       const res = await fetch("/api/test-failed-payment", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ reference: paymentReference }),
//       });

//       if (res.ok) {
//         setMessage("Payment status updated to failed. Check status to see the failure.");
//       } else {
//         setError("Failed to simulate payment failure");
//       }
//     } catch (err) {
//       setError("Error simulating payment failure");
//     }
//   };

//   const handlePayment = async (paymentAmount = null) => {
//     setError("");
//     setMessage("");
    
//     // Clear any existing polling before starting new payment
//     if (pollingInterval) {
//       clearInterval(pollingInterval);
//       setPollingInterval(null);
//     }
//     setVoucher(null);
//     setSmsSent(false);
//     setCurrentPaymentAmount(null); // Clear stored payment amount
//     smsLockRef.current = false;
//     voucherRef.current = null;

//     // Validation
//     if (!phone.trim()) {
//       setError("Please enter a phone number");
//       return;
//     }

//     if (!validatePhoneNumber(phone)) {
//       setError("Please enter a valid Ugandan phone number (e.g., 0701234567 or +256701234567)");
//       return;
//     }

//     const amountToUse = paymentAmount || amount;

//     if (!amountToUse || amountToUse <= 0) {
//       setError("Please select a valid voucher amount");
//       return;
//     }

//     // Store the payment amount for voucher fetching
//     setCurrentPaymentAmount(amountToUse);

//     setLoading(true);

//     try {
//       const formattedPhone = formatPhoneNumber(phone);
//       console.log("💳 Initiating payment with:", { phone: formattedPhone, amount: amountToUse, amountType: typeof amountToUse });

      
//       const res = await fetch("/api/pay", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ phone: formattedPhone, amount: amountToUse }),
//       });

//       if (!res.ok) {
//         throw new Error(`HTTP error! status: ${res.status}`);
//       }

//       const data = await res.json();
      
//       if (data.success) {
//         // Only set voucher if it exists (payment was successful)
//         if (data.data.voucher) {
//           setVoucherOnce(data.data.voucher);
//         }
        
//         // Hide success message - just handle the logic silently
//         const marzResponse = data.data.paymentResponse;
//         let successMessage = ""; // Empty message - no green card shown
        
//         if (data.data.voucher) {
//           // Only show message if voucher is ready
//           successMessage = "Your voucher code is ready.";
//         } else {
//           // No message shown for processing - just start polling silently
//           // Store reference for polling if payment is still processing
//           if (data.data.reference) {
//              const { reference, transactionUuid } = data.data; // <-- add this line
//             setPaymentReference(data.data.reference);
//             // Start polling for payment status
            
//             startPaymentPolling(reference, transactionUuid); // <-- updated to include transactionUuid
//           }
//         }
        
//         // Hide detailed transaction information - just show simple message
//         // if (marzResponse && marzResponse.data) {
//         //   const transaction = marzResponse.data.transaction;
//         //   const collection = marzResponse.data.collection;
//         //   
//         //   if (transaction && collection) {
//         //     successMessage = `Payment ${marzResponse.status}! 
//         //     Transaction ID: ${transaction.uuid}
//         //     Amount: ${collection.amount.formatted} ${collection.amount.currency}
//         //     Status: ${transaction.status}
//         //     Mode: ${collection.mode}`;
//         //     
//         //     if (data.data.voucher) {
//         //       successMessage += `\nVoucher Code: ${data.data.voucher}`;
//         //     }
//         //   }
//         // }
        
//         setMessage(successMessage);
//       } else {
//         setError(data.message || "Payment failed. Please try again.");
//       }
//     } catch (err) {
//       console.error("Payment error:", err);
//       if (err.name === 'TypeError' && err.message.includes('fetch')) {
//         setError("Network error. Please check your connection and try again.");
//       } else {
//         setError("Something went wrong. Please try again later.");
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <>
//       <style jsx>{`
//         @keyframes spin {
//           0% { transform: rotate(0deg); }
//           100% { transform: rotate(360deg); }
//         }
        
//         @keyframes bounce {
//           0%, 80%, 100% {
//             transform: scale(0);
//           }
//           40% {
//             transform: scale(1);
//           }
//         }
//       `}</style>
//       <div style={{ 
//         display: "flex", 
//         flexDirection: "column", 
//         alignItems: "center", 
//         justifyContent: "center",
//         minHeight: "100vh",
//         padding: "1rem",
//         backgroundColor: "#f5f5f5"
//       }}>
//         {/* Main Card */}
//         <div style={{
//           width: "100%",
//           maxWidth: "400px",
//           backgroundColor: "white",
//           borderRadius: "12px",
//           boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
//           padding: "2rem",
//           display: "flex",
//           flexDirection: "column",
//           alignItems: "center"
//         }}>
//           {/* Header */}
//           <div style={{ 
//             display: "flex", 
//             flexDirection: "column", 
//             alignItems: "center", 
//             width: "100%", 
//             marginBottom: "2rem", 
//             textAlign: "center" 
//           }}>
//             <h1 style={{
//               margin: 0,
//               fontSize: "1.5rem",
//               lineHeight: 1.3,
//               fontWeight: "bold",
//               color: "#333"
//             }}>
//               YOU BUY ENOX WIFI VOUCHER USING MOBILE MONEY
//             </h1>
//           </div>

//           {/* Form Fields - Hidden when processing or voucher received */}
//           {!paymentReference && !voucher && (
//             <div style={{ width: "100%" }}>
//               {/* Phone Number Input */}
//               <div style={{ marginBottom: "1.5rem" }}>
//                 <label style={{ 
//                   display: "block", 
//                   marginBottom: "0.5rem", 
//                   fontSize: "0.875rem",
//                   fontWeight: "600",
//                   color: "#333"
//                 }}>
//                   Enter Mobile Number
//                 </label>
//                 <input
//                   type="tel"
//                   placeholder="0701234567 or +256701234567"
//                   value={phone}
//                   onChange={(e) => {
//                     setPhone(e.target.value);
//                     setError("");
//                   }}
//                   style={{ 
//                     padding: "0.75rem", 
//                     width: "100%",
//                     border: error ? "2px solid #ff4444" : "2px solid #ddd",
//                     borderRadius: "8px",
//                     fontSize: "1rem",
//                     boxSizing: "border-box"
//                   }}
//                 />
//                 {error && (
//                   <p style={{ 
//                     color: "#ff4444", 
//                     fontSize: "0.875rem", 
//                     marginTop: "0.5rem",
//                     marginBottom: 0
//                   }}>
//                     {error}
//                   </p>
//                 )}
//               </div>

//               {/* Voucher Options */}
//               <div style={{ marginBottom: "1.5rem" }}>
//               <label style={{ 
//                 display: "block", 
//                 marginBottom: "1rem", 
//                 fontSize: "0.875rem",
//                 fontWeight: "600",
//                 color: "#333"
//               }}>
//                 Voucher Options
//               </label>
              
//               {/* Voucher Option Buttons */}
//               <div style={{ 
//                 display: "flex", 
//                 flexDirection: "column", 
//                 gap: "0.75rem" 
//               }}>
//                 {/* 4hrs - 500 */}
//                 <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                   padding: "1rem",
//                   background: "linear-gradient(135deg, #D93F87 0%, #44328D 100%)",
//                   borderRadius: "8px",
//                   width: "100%"
//                 }}>
//                   <div style={{ color: "white", textAlign: "left" }}>
//                     <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>4HRS</div>
//                     <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 500</div>
//                   </div>
//                   <button
//                     onClick={() => {
//                       if (!phone.trim()) {
//                         setError("Please enter a phone number");
//                         return;
//                       }
//                       if (!validatePhoneNumber(phone)) {
//                         setError("Please enter a valid Ugandan phone number");
//                         return;
//                       }
//                       const voucherAmount = 500;
//                       setAmount(voucherAmount);
//                       handlePayment(voucherAmount);
//                     }}
//                     disabled={loading || (paymentReference && !voucher)}
//                     style={{ 
//                       padding: "0.625rem 1.5rem",
//                       backgroundColor: "rgba(255, 255, 255, 0.2)",
//                       color: "white",
//                       border: "2px solid white",
//                       borderRadius: "6px",
//                       fontSize: "0.875rem",
//                       fontWeight: "700",
//                       cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
//                       transition: "all 0.2s ease"
//                     }}
//                   >
//                     BUY
//                   </button>
//                 </div>

//                 {/* 24hrs - 1000 */}
//                 <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                   padding: "1rem",
//                   background: "linear-gradient(135deg, #44328D 0%, #7652AF 100%)",
//                   borderRadius: "8px",
//                   width: "100%"
//                 }}>
//                   <div style={{ color: "white", textAlign: "left" }}>
//                     <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>24HRS</div>
//                     <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 1,000</div>
//                   </div>
//                   <button
//                     onClick={() => {
//                       if (!phone.trim()) {
//                         setError("Please enter a phone number");
//                         return;
//                       }
//                       if (!validatePhoneNumber(phone)) {
//                         setError("Please enter a valid Ugandan phone number");
//                         return;
//                       }
//                       const voucherAmount = 1000;
//                       setAmount(voucherAmount);
//                       handlePayment(voucherAmount);
//                     }}
//                     disabled={loading || (paymentReference && !voucher)}
//                     style={{ 
//                       padding: "0.625rem 1.5rem",
//                       backgroundColor: "rgba(255, 255, 255, 0.2)",
//                       color: "white",
//                       border: "2px solid white",
//                       borderRadius: "6px",
//                       fontSize: "0.875rem",
//                       fontWeight: "700",
//                       cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
//                       transition: "all 0.2s ease"
//                     }}
//                   >
//                     BUY
//                   </button>
//                 </div>

//                 {/* 3days - 2500 */}
//                 <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                   padding: "1rem",
//                   background: "linear-gradient(135deg, #7652AF 0%, #352154 100%)",
//                   borderRadius: "8px",
//                   width: "100%"
//                 }}>
//                   <div style={{ color: "white", textAlign: "left" }}>
//                     <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>3DAYS</div>
//                     <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 2,500</div>
//                   </div>
//                   <button
//                     onClick={() => {
//                       if (!phone.trim()) {
//                         setError("Please enter a phone number");
//                         return;
//                       }
//                       if (!validatePhoneNumber(phone)) {
//                         setError("Please enter a valid Ugandan phone number");
//                         return;
//                       }
//                       const voucherAmount = 2500;
//                       setAmount(voucherAmount);
//                       handlePayment(voucherAmount);
//                     }}
//                     disabled={loading || (paymentReference && !voucher)}
//                     style={{
//                       padding: "0.625rem 1.5rem",
//                       backgroundColor: "rgba(255, 255, 255, 0.2)",
//                       color: "white",
//                       border: "2px solid white",
//                       borderRadius: "6px",
//                       fontSize: "0.875rem",
//                       fontWeight: "700",
//                       cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
//                       transition: "all 0.2s ease"
//                     }}
//                   >
//                     BUY
//                   </button>
//                 </div>

//                 {/* Weekly - 5000 - COMMENTED OUT TEMPORARILY */}
//                 {/* <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                   padding: "1rem",
//                   background: "linear-gradient(135deg, #352154 0%, #D93F87 100%)",
//                   borderRadius: "8px",
//                   width: "100%"
//                 }}>
//                   <div style={{ color: "white", textAlign: "left" }}>
//                     <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>WEEKLY</div>
//                     <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 5,000</div>
//                   </div>
//                   <button
//                     onClick={() => {
//                       if (!phone.trim()) {
//                         setError("Please enter a phone number");
//                         return;
//                       }
//                       if (!validatePhoneNumber(phone)) {
//                         setError("Please enter a valid Ugandan phone number");
//                         return;
//                       }
//                       const voucherAmount = 5000;
//                       setAmount(voucherAmount);
//                       handlePayment(voucherAmount);
//                     }}
//                     disabled={loading || (paymentReference && !voucher)}
//                     style={{
//                       padding: "0.625rem 1.5rem",
//                       backgroundColor: "rgba(255, 255, 255, 0.2)",
//                       color: "white",
//                       border: "2px solid white",
//                       borderRadius: "6px",
//                       fontSize: "0.875rem",
//                       fontWeight: "700",
//                       cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
//                       transition: "all 0.2s ease"
//                     }}
//                   >
//                     BUY
//                   </button>
//                 </div> */}

//                 {/* Monthly - 20000 - COMMENTED OUT TEMPORARILY */}
//                 {/* <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                   padding: "1rem",
//                   background: "linear-gradient(135deg, #D93F87 0%, #352154 100%)",
//                   borderRadius: "8px",
//                   width: "100%"
//                 }}>
//                   <div style={{ color: "white", textAlign: "left" }}>
//                     <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>MONTHLY</div>
//                     <div style={{ fontSize: "1rem", fontWeight: "600", marginTop: "0.25rem" }}>UGX 20,000</div>
//                   </div>
//                   <button
//                     onClick={() => {
//                       if (!phone.trim()) {
//                         setError("Please enter a phone number");
//                         return;
//                       }
//                       if (!validatePhoneNumber(phone)) {
//                         setError("Please enter a valid Ugandan phone number");
//                         return;
//                       }
//                       const voucherAmount = 20000;
//                       setAmount(voucherAmount);
//                       handlePayment(voucherAmount);
//                     }}
//                     disabled={loading || (paymentReference && !voucher)}
//                     style={{
//                       padding: "0.625rem 1.5rem",
//                       backgroundColor: "rgba(255, 255, 255, 0.2)",
//                       color: "white",
//                       border: "2px solid white",
//                       borderRadius: "6px",
//                       fontSize: "0.875rem",
//                       fontWeight: "700",
//                       cursor: (loading || (paymentReference && !voucher)) ? "not-allowed" : "pointer",
//                       transition: "all 0.2s ease"
//                     }}
//                   >
//                     BUY
//                   </button>
//                 </div> */}
//               </div>
//             </div>

//             {/* Payment Providers */}
//             <div style={{ 
//               marginTop: "1rem", 
//               textAlign: "center",
//               width: "100%"
//             }}>
//               <p style={{ 
//                 margin: "0 0 0.75rem 0", 
//                 fontSize: "0.875rem", 
//                 color: "#999",
//                 fontWeight: "400"
//               }}>
//                 We Accept MTN & Airtel
//               </p>
//               <div style={{ 
//                 display: "flex", 
//                 justifyContent: "center", 
//                 alignItems: "center",
//                 gap: "1.5rem"
//               }}>
//                 <Image 
//                   src="/mtn.png" 
//                   alt="MTN Mobile Money" 
//                   width={50} 
//                   height={50} 
//                   style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }} 
//                 />
//                 <Image 
//                   src="/airtel.png" 
//                   alt="Airtel Money" 
//                   width={50} 
//                   height={50} 
//                   style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }} 
//                 />
//               </div>
//             </div>

//             {/* Help Contact */}
//             <div style={{ 
//               marginTop: "1.5rem", 
//               textAlign: "center",
//               width: "100%"
//             }}>
//               <p style={{ 
//                 margin: "0 0 0.5rem 0", 
//                 fontSize: "0.875rem", 
//                 color: "#666"
//               }}>
//                 For help call <a href="tel:0782830524" style={{ color: "#007bff", textDecoration: "none" }}>0782830524</a>
//               </p>
//               <p style={{ 
//                 margin: 0, 
//                 fontSize: "0.75rem", 
//                 color: "#999"
//               }}>
//                 Voucher System by AlphaCortex Systems
//               </p>
//             </div>
//             </div>
//           )}

//           {/* Success Message */}
//           {message && !paymentReference && !voucher && (
//             <div style={{ 
//               marginTop: "1.5rem", 
//               padding: "1rem", 
//               backgroundColor: "#d4edda", 
//               color: "#155724",
//               borderRadius: "8px",
//               width: "100%",
//               textAlign: "center"
//             }}>
//               {message}
//             </div>
//           )}

//           {/* Processing Payment Animation - Full Screen */}
//           {paymentReference && !voucher && (
//             <div style={{ 
//               display: "flex",
//               flexDirection: "column",
//               alignItems: "center",
//               justifyContent: "center",
//               padding: "3rem 2rem",
//               width: "100%"
//             }}>
//               <div style={{ 
//                 display: "flex", 
//                 flexDirection: "column", 
//                 alignItems: "center",
//                 marginBottom: "2rem"
//               }}>
//                 <div style={{
//                   width: "60px",
//                   height: "60px",
//                   border: "5px solid #e9ecef",
//                   borderTop: "5px solid #7652AF",
//                   borderRadius: "50%",
//                   animation: "spin 1s linear infinite",
//                   marginBottom: "2rem"
//                 }}></div>
//                 <div style={{
//                   display: "flex",
//                   alignItems: "center",
//                   gap: "0.5rem",
//                   fontSize: "1.5rem",
//                   fontWeight: "600",
//                   background: "linear-gradient(135deg, #D93F87 0%, #7652AF 100%)",
//                   WebkitBackgroundClip: "text",
//                   WebkitTextFillColor: "transparent",
//                   backgroundClip: "text"
//                 }}>
//                   <span>Processing Payment</span>
//                   <div style={{
//                     display: "flex",
//                     gap: "3px"
//                   }}>
//                     <div style={{
//                       width: "6px",
//                       height: "6px",
//                       backgroundColor: "#7652AF",
//                       borderRadius: "50%",
//                       animation: "bounce 1.4s ease-in-out infinite both"
//                     }}></div>
//                     <div style={{
//                       width: "6px",
//                       height: "6px",
//                       backgroundColor: "#7652AF",
//                       borderRadius: "50%",
//                       animation: "bounce 1.4s ease-in-out infinite both",
//                       animationDelay: "0.16s"
//                     }}></div>
//                     <div style={{
//                       width: "6px",
//                       height: "6px",
//                       backgroundColor: "#7652AF",
//                       borderRadius: "50%",
//                       animation: "bounce 1.4s ease-in-out infinite both",
//                       animationDelay: "0.32s"
//                     }}></div>
//                   </div>
//                 </div>
//               </div>
              
//               <p style={{ 
//                 margin: 0, 
//                 fontSize: "1rem",
//                 color: "#6c757d",
//                 textAlign: "center"
//               }}>
//                 Please wait while we confirm your payment...
//               </p>
              
//               {/* Status Message */}
//               {statusMessage && (
//                 <div style={{
//                   marginTop: "1.5rem",
//                   padding: "1rem",
//                   backgroundColor: "#fff3cd",
//                   color: "#856404",
//                   borderRadius: "8px",
//                   width: "100%",
//                   maxWidth: "300px",
//                   textAlign: "center",
//                   fontSize: "0.875rem",
//                   border: "1px solid #ffeaa7"
//                 }}>
//                   {statusMessage}
//                 </div>
//               )}
//             </div>
//           )}
          
//           {/* Voucher Display - Full Screen */}
//           {voucher && (
//             <div style={{ 
//               display: "flex",
//               flexDirection: "column",
//               alignItems: "center",
//               justifyContent: "center",
//               padding: "3rem 2rem",
//               width: "100%"
//             }}>
//               <div style={{
//                 width: "80px",
//                 height: "80px",
//                 background: "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
//                 borderRadius: "50%",
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "center",
//                 marginBottom: "2rem"
//               }}>
//                 <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
//                   <polyline points="20 6 9 17 4 12"></polyline>
//                 </svg>
//               </div>
              
//               <h2 style={{ 
//                 marginBottom: "1.5rem", 
//                 color: "#28a745", 
//                 fontSize: "1.5rem",
//                 fontWeight: "700",
//                 textAlign: "center"
//               }}>
//                 Payment Successful!
//               </h2>
              
//               <p style={{ 
//                 marginBottom: "1rem", 
//                 fontSize: "0.875rem", 
//                 color: "#666",
//                 textAlign: "center"
//               }}>
//                 Your Voucher Code:
//               </p>
              
//               <div style={{ 
//                 fontSize: "2rem", 
//                 fontWeight: "bold", 
//                 color: "#28a745",
//                 backgroundColor: "#e0ffe0",
//                 padding: "1.5rem 2rem",
//                 borderRadius: "12px",
//                 border: "3px dashed #28a745",
//                 marginBottom: "1.5rem",
//                 letterSpacing: "0.1em",
//                 textAlign: "center",
//                 width: "100%",
//                 maxWidth: "300px"
//               }}>
//                 {voucher}
//               </div>
              
//               <p style={{ 
//                 margin: 0, 
//                 fontSize: "0.875rem", 
//                 color: "#666",
//                 textAlign: "center",
//                 maxWidth: "280px"
//               }}>
//                 Save this code! You can use it to Login to ENOX SUPER FAST WiFi HOTSPOT
//               </p>
//             </div>
//           )}
//         </div>
//       </div>
//     </>
//   );
// }

