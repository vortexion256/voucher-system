import { getPaymentByPhone, getVoucher } from "../../lib/storage.js";
import { db } from "../../lib/firebase.js";
import { collection, query, where, limit, getDocs, updateDoc, doc } from "firebase/firestore";
import axios from "axios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { phone } = await request.json();
    
    if (!phone) {
      return Response.json(
        { success: false, message: "Phone number required" },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking payment status for phone: ${phone}`);
    
    // Get payment by phone number (most recent)
    const payment = await getPaymentByPhone(phone);
    
    if (!payment) {
      console.log(`❌ No payment found for phone: ${phone}`);
      return Response.json({
        success: true,
        data: {
          status: "not_found",
          message: "No payment found for this phone number"
        }
      });
    }

    console.log(`📊 Found payment: ${payment.reference}, status: ${payment.status}`);

    // If payment is completed and has voucher, return it
    if (payment.status === "successful" && payment.voucher) {
      console.log(`✅ Payment completed with voucher: ${payment.voucher}`);
      return Response.json({
        success: true,
        data: {
          status: "successful",
          voucher: payment.voucher,
          amount: payment.amount,
          phone: payment.phone,
          reference: payment.reference,
          completedAt: payment.updatedAt
        }
      });
    }

    // If payment is still processing, check with MarzPay API
    if (payment.status === "processing" && payment.transactionId) {
      console.log(`🌐 Checking MarzPay API for transaction: ${payment.transactionId}`);
      
      try {
        // Build base URL from request headers to work in local and production
        const proto = request.headers.get('x-forwarded-proto') || 'https';
        const host = request.headers.get('host');
        const baseUrl = `${proto}://${host}`;
        
        // Call our MarzPay API checker
        const marzCheckResponse = await fetch(`${baseUrl}/api/check-marz-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            reference: payment.reference, 
            transactionUuid: payment.transactionId 
          })
        });
        
        if (marzCheckResponse.ok) {
          const marzData = await marzCheckResponse.json();
          console.log(`📊 MarzPay API response:`, marzData.data);
          
          if (marzData.success && marzData.data.isComplete) {
            console.log(`✅ Payment completed via MarzPay API: ${marzData.data.internalStatus}`);

            // Update our storage with the new status
            if (marzData.data.internalStatus === 'successful' && marzData.data.shouldGenerateVoucher) {
              // Check if voucher already assigned to prevent duplicates
              const existingVoucher = await getVoucher(payment.reference);
              if (existingVoucher) {
                console.log(`🎫 Voucher already assigned for reference ${payment.reference}, skipping duplicate assignment`);
                return Response.json({
                  success: true,
                  data: {
                    status: "successful",
                    voucher: existingVoucher.voucher,
                    amount: payment.amount,
                    phone: payment.phone,
                    reference: payment.reference,
                    completedAt: existingVoucher.updatedAt
                  }
                });
              }

              // Fetch an unused voucher for the amount from Firestore and mark as used
              const vouchersRef = collection(db, "vouchers");
              const q = query(
                vouchersRef,
                where("amount", "==", payment.amount),
                where("used", "==", false),
                limit(1)
              );
              const snapshot = await getDocs(q);

              if (!snapshot.empty) {
                const voucherDoc = snapshot.docs[0];
                const voucherData = voucherDoc.data();

                // Validate voucher amount matches payment amount
                if (Number(voucherData.amount) !== Number(payment.amount)) {
                  console.error(`🚨 CRITICAL: Voucher amount mismatch! Payment: ${payment.amount}, Voucher: ${voucherData.amount}`);
                  return Response.json({
                    success: true,
                    data: {
                      status: "successful",
                      voucher: null,
                      amount: payment.amount,
                      phone: payment.phone,
                      reference: payment.reference,
                      message: "Payment completed but voucher assignment failed"
                    }
                  });
                }

                await updateDoc(doc(db, "vouchers", voucherDoc.id), {
                  used: true,
                  assignedTo: payment.phone,
                  assignedAt: new Date(),
                  paymentReference: payment.reference,
                });

                // Update payment status with voucher code
                const { updatePaymentStatus } = await import("../../lib/storage.js");
                await updatePaymentStatus(payment.reference, "successful", voucherData.code);

                // Send voucher by SMS immediately (no need to wait for user to "check status")
                try {
                  const proto = request.headers.get("x-forwarded-proto") || "https";
                  const host = request.headers.get("host");
                  const baseUrl = `${proto}://${host}`;
                  const msg = `Your wifi code ${voucherData.code}. Ref: ${payment.reference}.`;
                  const smsRes = await fetch(`${baseUrl}/api/send-sms`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ number: payment.phone, message: msg }),
                  });
                  const smsJson = await smsRes.json();
                  if (smsRes.ok && smsJson.success) console.log(`📱 SMS sent to ${payment.phone}`);
                  else console.error("📱 SMS failed:", smsJson);
                } catch (e) {
                  console.error("📱 SMS send error:", e);
                }

                console.log(`🎫 Issued voucher: ${voucherData.code} (${voucherData.amount} UGX) for payment: ${payment.amount} UGX`);

                return Response.json({
                  success: true,
                  data: {
                    status: "successful",
                    voucher: voucherData.code,
                    amount: payment.amount,
                    phone: payment.phone,
                    reference: payment.reference,
                    completedAt: new Date().toISOString(),
                  },
                });
              } else {
                console.warn(`⚠️ No available vouchers in Firestore for amount: ${payment.amount} UGX`);
                return Response.json({
                  success: true,
                  data: {
                    status: "successful",
                    voucher: null,
                    amount: payment.amount,
                    phone: payment.phone,
                    reference: payment.reference,
                    message: "Payment completed but no vouchers available"
                  },
                });
              }
            } else if (marzData.data.internalStatus === 'failed') {
              // Update payment status to failed
              const { updatePaymentStatus } = await import("../../lib/storage.js");
              await updatePaymentStatus(payment.reference, "failed");
              
              return Response.json({
                success: true,
                data: {
                  status: "failed",
                  amount: payment.amount,
                  phone: payment.phone,
                  reference: payment.reference,
                  createdAt: payment.createdAt,
                  voucher: null
                }
              });
            }
          } else {
            console.log(`⏳ Payment still processing via MarzPay API: ${marzData.data.internalStatus}`);
          }
        } else {
          console.log(`⚠️ MarzPay API check failed, using local status`);
        }
      } catch (marzError) {
        console.error(`❌ MarzPay API check error:`, marzError);
        console.log(`⚠️ Falling back to local status`);
      }
    }
    
    // Return current status
    console.log(`📊 Returning payment status: ${payment.status}`);
    return Response.json({
      success: true,
      data: {
        status: payment.status,
        amount: payment.amount,
        phone: payment.phone,
        reference: payment.reference,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        voucher: payment.voucher || null
      }
    });
    
  } catch (error) {
    console.error("Check payment by phone error:", error);
    return Response.json(
      { success: false, message: "Failed to check payment status" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ success: true, message: "check-payment-by-phone alive" });
}
