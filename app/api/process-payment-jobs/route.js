import { getNextPendingJob, updateJobStatus, completeJob } from "../../lib/jobQueue.js";
import { updatePaymentStatus, getVoucher } from "../../lib/storage.js";
import { db } from "../../lib/firebase.js";
import { collection, query, where, limit, getDocs, updateDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import axios from "axios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Check payment status with MarzPay API
 * @param {string} transactionUuid - MarzPay transaction UUID
 * @returns {Object} Status result with shouldGenerateVoucher flag
 */
async function checkMarzPayStatus(transactionUuid) {
  const apiUrl = process.env.MARZ_API_BASE_URL || "https://wallet.wearemarz.com/api/v1";
  const base64Auth = process.env.MARZ_BASE64_AUTH || "bWFyel9hMFRBRmlHaHk5M1ZCRmNZOmtXVlRTcnRtVnpsM0lVQU5rd21DVnlzSWJ3dE9BYm1Z";

  try {
    console.log(`🌐 Checking MarzPay API for transaction: ${transactionUuid}`);

    const response = await axios.get(
      `${apiUrl}/collect-money/${transactionUuid}`,
      {
        headers: {
          Authorization: `Basic ${base64Auth}`,
        },
        timeout: 10000, // 10 second timeout
      }
    );

    const transaction = response.data.data?.transaction;
    const status = transaction?.status;
    const amount = transaction?.amount;

    console.log(`📊 MarzPay status for ${transactionUuid}: ${status}`);

    // Map MarzPay status to internal status
    switch (status) {
      case "successful":
      case "completed":
        return {
          status: "successful",
          shouldGenerateVoucher: true,
          amount: amount,
          marzPayStatus: status
        };
      case "failed":
      case "rejected":
        return {
          status: "failed",
          shouldGenerateVoucher: false,
          amount: amount,
          marzPayStatus: status
        };
      case "processing":
      case "pending":
      case "timeout":
        return {
          status: "processing",
          shouldGenerateVoucher: false,
          amount: amount,
          marzPayStatus: status
        };
      default:
        console.warn(`⚠️ Unknown MarzPay status: ${status}`);
        return {
          status: "processing",
          shouldGenerateVoucher: false,
          amount: amount,
          marzPayStatus: status
        };
    }
  } catch (error) {
    console.error(`❌ MarzPay API error for ${transactionUuid}:`, error.message);

    // If it's a 404, the transaction might not exist yet or might be expired
    if (error.response?.status === 404) {
      return {
        status: "processing",
        shouldGenerateVoucher: false,
        error: "Transaction not found - still processing"
      };
    }

    return {
      status: "error",
      shouldGenerateVoucher: false,
      error: error.message
    };
  }
}

/**
 * Generate voucher and send SMS for successful payment
 * @param {string} phone - Customer phone number
 * @param {number} amount - Payment amount
 * @param {string} reference - Payment reference
 * @returns {string|null} Voucher code if successful
 */
async function generateVoucherAndSendSMS(phone, amount, reference) {
  try {
    console.log(`🎫 Generating voucher for ${reference}: ${amount} UGX to ${phone}`);

    // Get available voucher from Firestore
    const vouchersRef = collection(db, "vouchers");
    const q = query(
      vouchersRef,
      where("amount", "==", Number(amount)),
      where("used", "==", false),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const voucherDoc = snapshot.docs[0];
      const voucherData = voucherDoc.data();

      // Validate voucher amount matches payment amount
      if (Number(voucherData.amount) !== Number(amount)) {
        console.error(`🚨 Voucher amount mismatch! Payment: ${amount}, Voucher: ${voucherData.amount}`);
        return null;
      }

      const voucherCode = voucherData.code;

      // Mark voucher as used
      await updateDoc(doc(db, "vouchers", voucherDoc.id), {
        used: true,
        assignedTo: phone,
        assignedAt: new Date(),
        paymentReference: reference,
      });

      console.log(`✅ Voucher assigned: ${voucherCode}`);

      // Send SMS
      await sendSMS(phone, voucherCode, reference);

      // Save transaction to Firestore
      await saveTransactionToFirestore(reference, phone, amount, voucherCode, "successful");

      return voucherCode;
    } else {
      console.error(`❌ No vouchers available for amount: ${amount} UGX`);
      return null;
    }
  } catch (error) {
    console.error("❌ Error generating voucher:", error);
    return null;
  }
}

/**
 * Send SMS with voucher code
 * @param {string} phone - Phone number
 * @param {string} voucherCode - Voucher code
 * @param {string} reference - Payment reference
 */
async function sendSMS(phone, voucherCode, reference) {
  try {
    const message = `Your wifi code ${voucherCode}. Ref: ${reference}`;

    console.log(`📱 Sending SMS to ${phone}: ${message.substring(0, 30)}...`);

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone, message }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("❌ Failed to send SMS:", result);
      throw new Error(`SMS failed: ${result.message || 'Unknown error'}`);
    } else {
      console.log("✅ SMS sent successfully");
    }
  } catch (error) {
    console.error("❌ SMS sending error:", error);
    // Don't throw - SMS failure shouldn't stop voucher assignment
  }
}

/**
 * Save transaction to Firestore
 * @param {string} reference - Payment reference
 * @param {string} phone - Phone number
 * @param {number} amount - Amount
 * @param {string} voucher - Voucher code
 * @param {string} status - Transaction status
 */
async function saveTransactionToFirestore(reference, phone, amount, voucher, status) {
  try {
    await setDoc(
      doc(db, "transactions", reference),
      {
        reference,
        phone,
        amount,
        status,
        voucher,
        processedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: false }
    );
    console.log("✅ Transaction saved to Firestore");
  } catch (error) {
    console.error("❌ Failed to save transaction:", error);
  }
}

export async function GET() {
  try {
    console.log("🔄 Processing payment jobs...");

    const job = await getNextPendingJob();

    if (!job) {
      return Response.json({
        success: true,
        message: "No pending jobs to process",
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📋 Processing job: ${job.reference} (attempt ${job.retryCount + 1}/${job.maxRetries})`);

    // Mark job as processing
    await updateJobStatus(job.id, "processing", { retryCount: job.retryCount + 1 });

    // Check MarzPay status (this is the server-side polling!)
    const paymentStatus = await checkMarzPayStatus(job.transactionUuid);

    if (paymentStatus.status === "successful") {
      console.log(`✅ Payment successful for ${job.reference}`);

      // Check if check-payment (frontend polling) already assigned voucher - if so, only send SMS
      const already = await getVoucher(job.reference);
      if (already?.voucher) {
        console.log(`🎫 Voucher already assigned for ${job.reference}, sending SMS only`);
        await sendSMS(job.phone, already.voucher, job.reference);
        await completeJob(job.id);
        return Response.json({
          success: true,
          processed: job.reference,
          status: "completed",
          voucher: already.voucher,
          smsOnly: true,
          timestamp: new Date().toISOString()
        });
      }

      // Generate voucher and send SMS (server-side only path)
      const voucher = await generateVoucherAndSendSMS(job.phone, job.amount, job.reference);

      if (voucher) {
        // Update payment status in storage
        await updatePaymentStatus(job.reference, "successful", voucher);

        // Remove job from queue
        await completeJob(job.id);

        console.log(`🎫 Payment completed successfully: ${voucher}`);

        return Response.json({
          success: true,
          processed: job.reference,
          status: "completed",
          voucher: voucher,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`❌ Failed to generate voucher for ${job.reference}`);

        // Update payment status to failed
        await updatePaymentStatus(job.reference, "failed");

        // Mark job as failed
        await updateJobStatus(job.id, "failed", {
          error: "No vouchers available",
          finalStatus: "failed"
        });

        // Still complete the job (remove from queue)
        await completeJob(job.id);

        return Response.json({
          success: false,
          processed: job.reference,
          status: "failed",
          error: "No vouchers available",
          timestamp: new Date().toISOString()
        });
      }

    } else if (paymentStatus.status === "failed") {
      console.log(`❌ Payment failed for ${job.reference}`);

      // Update payment status to failed
      await updatePaymentStatus(job.reference, "failed");

      // Mark job as failed and complete it
      await updateJobStatus(job.id, "failed", {
        error: `MarzPay status: ${paymentStatus.marzPayStatus}`,
        finalStatus: "failed"
      });
      await completeJob(job.id);

      return Response.json({
        success: true,
        processed: job.reference,
        status: "failed",
        marzPayStatus: paymentStatus.marzPayStatus,
        timestamp: new Date().toISOString()
      });

    } else if (paymentStatus.status === "error" || job.retryCount >= job.maxRetries) {
      console.log(`⏰ Job timeout or persistent error for ${job.reference} (${job.retryCount}/${job.maxRetries})`);

      // Mark job as failed after max retries
      await updateJobStatus(job.id, "failed", {
        error: paymentStatus.error || "Max retries exceeded",
        finalStatus: "timeout"
      });

      // Don't complete the job yet - might want to retry later or handle manually
      // await completeJob(job.id);

      return Response.json({
        success: false,
        processed: job.reference,
        status: "timeout",
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        timestamp: new Date().toISOString()
      });

    } else {
      // Still processing, keep job in queue for next iteration
      await updateJobStatus(job.id, "pending", { retryCount: job.retryCount + 1 });
      console.log(`⏳ Payment still processing for ${job.reference} (attempt ${job.retryCount + 2})`);

      return Response.json({
        success: true,
        processed: job.reference,
        status: "still_processing",
        retryCount: job.retryCount + 1,
        marzPayStatus: paymentStatus.marzPayStatus,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error("❌ Job processing error:", error);
    return Response.json(
      {
        success: false,
        message: "Job processing failed",
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Same as GET for manual triggering
  return GET();
}
