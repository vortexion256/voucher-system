// import axios from "axios";
// import { v4 as uuidv4 } from "uuid";
// import { storePendingPayment, getVoucher } from "../../lib/storage.js";
// // hey
// export async function POST(request) {
//   try {
//     console.log("API Route: /api/pay called");
//     const { phone, amount } = await request.json();
//     console.log("Received data:", { phone, amount });

//     if (!phone || !amount) {
//       console.log("Validation process failed: missing phone or amount");
//       return Response.json(
//         { success: false, message: "Phone and amount required" },
//         { status: 400 }
//       );
//     }

//     const reference = uuidv4();

//     try {
//       console.log("Environment variables:", {
//         MARZ_API_BASE_URL: process.env.MARZ_API_BASE_URL,
//         MARZ_API_KEY: process.env.MARZ_API_KEY ? "Set" : "Not set",
//         NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
//       });
      
//       console.log("All process.env keys:", Object.keys(process.env).filter(key => key.includes('MARZ') || key.includes('NEXT')));
//       console.log("NODE_ENV:", process.env.NODE_ENV);

//       // Format phone number correctly for Marz Pay API
//       let formattedPhone = phone;
//       if (!phone.startsWith('+')) {
//         if (phone.startsWith('256')) {
//           formattedPhone = `+${phone}`;
//         } else if (phone.startsWith('0')) {
//           formattedPhone = `+256${phone.substring(1)}`;
//         } else {
//           formattedPhone = `+256${phone}`;
//         }
//       }
      
//       console.log("Original phone:", phone);
//       console.log("Formatted phone:", formattedPhone);
//       console.log("Amount:", amount, "Type:", typeof amount);
      
//       // Allow 600 UGX as a special local-voucher package; otherwise enforce Marz limits (500 - 10,000,000)
//       if (amount === 600) {
//         console.log("Amount is 600 UGX; issuing local voucher without calling Marz");
//         const voucher = generateVoucher(amount);
//         return Response.json({
//           success: true,
//           data: {
//             paymentResponse: {
//               status: "success",
//               message: "Local voucher generated for 600 UGX package",
//               data: {
//                 transaction: {
//                   uuid: reference,
//                   reference,
//                   status: "local",
//                   provider_reference: null,
//                 },
//                 collection: {
//                   amount: { formatted: `${amount.toLocaleString()}.00`, raw: amount, currency: "UGX" },
//                   provider: "local",
//                   phone_number: formattedPhone,
//                   mode: "local",
//                 },
//               },
//             },
//             voucher,
//           },
//         });
//       }

//       // Validate amount is within Marz Pay limits (500 - 10,000,000 UGX)
//       if (amount < 500 || amount > 10000000) {
//         console.log("Amount validation failed:", amount, "is not within 500-10,000,000 range");
//         return Response.json(
//           { success: false, message: "Amount must be 100, or between 500 and 10,000,000 UGX" },
//           { status: 400 }
//         );
//       }
      
//       const formData = new URLSearchParams();
//       formData.append("phone_number", formattedPhone);
//       formData.append("amount", amount.toString());
//       formData.append("country", "UG");
//       formData.append("reference", reference);
//       formData.append("description", `Voucher payment ${amount}`);
//       // Remove callback URL - we'll use API polling instead
//       // formData.append("callback_url", `${process.env.NEXT_PUBLIC_APP_URL || 'https://dick-electronics-voucher-app.vercel.app'}/api/webhook`);

//       // For development/testing, simulate a successful response if Marz API is not configured
//       if (!process.env.MARZ_API_BASE_URL || !process.env.MARZ_API_KEY) {
//         console.log("Marz API not configured, simulating successful payment for testing");
//         console.log("Trying with hardcoded values for testing...");
        
//         // Use the correct Marz Pay authentication format
//         const testApiUrl = process.env.MARZ_API_BASE_URL || "https://wallet.wearemarz.com/api/v1";
//         const apiKey = process.env.MARZ_API_KEY || "marz_4TLwoNWQegcxOFeA";
//         const apiSecret = process.env.MARZ_API_SECRET || "7mK6sRgh52DFLZbhzT1MxUmxDETHn9mj";
//         const base64Auth = process.env.MARZ_BASE64_AUTH || "bWFyel80VEx3b05XUWVnY3hPRmVBOjdtSzZzUmdoNTJERkxaYmh6VDFNeFVteERFVEhuOW1q";
        
//         console.log("Using correct Marz Pay authentication:");
//         console.log("API URL:", testApiUrl);
//         console.log("API Key:", apiKey);
//         console.log("API Secret:", apiSecret);
//         console.log("Base64 Auth Header:", base64Auth);
        
//         try {
//           console.log("Making request to Marz Pay API with correct authentication...");
//           console.log("Request data being sent:", Object.fromEntries(formData));
//           console.log("Request URL:", `${testApiUrl}/collect-money`);
          
//           // First, let's check what services are available
//           try {
//             console.log("Checking available services...");
//             const servicesResponse = await axios.get(
//               `${testApiUrl}/collect-money/services`,
//               {
//                 headers: {
//                   Authorization: `Basic ${base64Auth}`,
//                 },
//               }
//             );
//             console.log("Available services:", servicesResponse.data);
//           } catch (servicesError) {
//             console.log("Could not fetch services:", servicesError.response?.data || servicesError.message);
//           }
          
//           const response = await axios.post(
//             `${testApiUrl}/collect-money`,
//             formData,
//             {
//               headers: {
//                 Authorization: `Basic ${base64Auth}`,
//                 "Content-Type": "application/x-www-form-urlencoded",
//               },
//             }
//           );
//           console.log("Marz Pay API response:", response.data);
          
//           // Store pending payment for webhook tracking
//           const transactionId = response.data.data?.transaction?.uuid;
//           storePendingPayment(reference, formattedPhone, amount, transactionId);
//           console.log(`Stored pending payment for reference: ${reference}`);
          
//           // Only generate voucher if transaction status is successful
//           const transactionStatus = response.data.data?.transaction?.status;
//           console.log("Transaction status:", transactionStatus);
          
//           if (transactionStatus === 'successful') {
//             const voucher = generateVoucher(amount);
//             console.log("Payment successful, generating voucher:", voucher);
            
//             return Response.json({
//               success: true,
//               data: {
//                 paymentResponse: response.data,
//                 voucher,
//               },
//             });
//           } else {
//             console.log("Payment not yet successful (status:", transactionStatus, "), no voucher generated");
//             return Response.json({
//               success: true, // API call was successful, but payment is still processing
//               message: `Payment initiated successfully. Status: ${transactionStatus}. Please wait for confirmation.`,
//               data: {
//                 paymentResponse: response.data,
//                 reference, // Include reference so frontend can check status
//               },
//             });
//           }
//         } catch (error) {
//           console.log("Marz Pay API error:", error.response?.data || error.message);
          
//           // Check if it's a country services issue
//           if (error.response?.data?.message?.includes('No collection services available')) {
//             console.log("Collection services not available for Uganda. This might be because:");
//             console.log("1. Your Marz Pay account needs to be activated for Uganda");
//             console.log("2. You might need to contact Marz Pay support to enable Uganda services");
//             console.log("3. Your account might be in sandbox mode with limited country support");
            
//             // For now, let's simulate a successful response for testing
//             console.log("Simulating successful payment for testing purposes...");
            
//             // Only generate voucher for successful simulated payments
//             const voucher = generateVoucher(amount);
//             console.log("Simulated payment successful, generating voucher:", voucher);
            
//             return Response.json({
//               success: true,
//               data: {
//                 paymentResponse: {
//                   status: "success",
//                   message: "Payment simulated - Uganda services not available in your Marz Pay account",
//                   data: {
//                     transaction: {
//                       uuid: reference,
//                       reference: reference,
//                       status: "simulated",
//                       provider_reference: "SIMULATED_UG_REF"
//                     },
//                     collection: {
//                       amount: {
//                         formatted: `${amount.toLocaleString()}.00`,
//                         raw: amount,
//                         currency: "UGX"
//                       },
//                       provider: "simulated",
//                       phone_number: formattedPhone,
//                       mode: "simulated"
//                     }
//                   }
//                 },
//                 voucher,
//               },
//             });
//           }
          
//           throw error;
//         }
//       }

//       console.log("Making request to Marz API...");
//       console.log("Request URL:", `${process.env.MARZ_API_BASE_URL}/collect-money`);
//       console.log("Request data:", Object.fromEntries(formData));
//       console.log("Callback URL:", `${process.env.NEXT_PUBLIC_APP_URL || 'https://dick-electronics-voucher-app.vercel.app'}/api/webhook`);
      
//       const response = await axios.post(
//         `${process.env.MARZ_API_BASE_URL}/collect-money`,
//         formData,
//         {
//           headers: {
//             Authorization: `Basic ${process.env.MARZ_BASE64_AUTH || process.env.MARZ_API_KEY}`,
//             "Content-Type": "application/x-www-form-urlencoded",
//           },
//         }
//       );
//       console.log("Marz API response:", response.data);
//       console.log("Marz API status:", response.status);
//       console.log("Marz API headers:", response.headers);
      
//       // Log the detailed response structure
//       if (response.data) {
//         console.log("=== MARZ API RESPONSE DETAILS ===");
//         console.log("Status:", response.data.status);
//         console.log("Message:", response.data.message);
        
//         if (response.data.data) {
//           console.log("Transaction UUID:", response.data.data.transaction?.uuid);
//           console.log("Transaction Reference:", response.data.data.transaction?.reference);
//           console.log("Transaction Status:", response.data.data.transaction?.status);
//           console.log("Provider Reference:", response.data.data.transaction?.provider_reference);
          
//           if (response.data.data.collection) {
//             console.log("Amount:", response.data.data.collection.amount);
//             console.log("Provider:", response.data.data.collection.provider);
//             console.log("Phone Number:", response.data.data.collection.phone_number);
//             console.log("Mode:", response.data.data.collection.mode);
//           }
          
//           if (response.data.data.timeline) {
//             console.log("Initiated At:", response.data.data.timeline.initiated_at);
//             console.log("Estimated Settlement:", response.data.data.timeline.estimated_settlement);
//           }
          
//           if (response.data.data.metadata) {
//             console.log("Sandbox Mode:", response.data.data.metadata.sandbox_mode);
//             console.log("Test Phone Number:", response.data.data.metadata.test_phone_number);
//           }
//         }
//         console.log("=== END MARZ API RESPONSE ===");
//       }

//       const voucher = generateVoucher(amount);

//       return Response.json({
//         success: true,
//         data: {
//           paymentResponse: response.data,
//           voucher,
//         },
//       });
//     } catch (error) {
//       console.error("Payment error:", error.response?.data || error.message);
      
//       // Handle different types of errors
//       let errorMessage = "Payment failed";
//       let statusCode = 500;
      
//       if (error.response) {
//         // API responded with error status
//         statusCode = error.response.status;
//         errorMessage = error.response.data?.message || `API Error: ${error.response.status}`;
//       } else if (error.request) {
//         // Network error
//         errorMessage = "Network error. Please check your connection.";
//       } else {
//         // Other error
//         errorMessage = error.message || "An unexpected error occurred";
//       }
      
//       return Response.json(
//         { success: false, message: errorMessage },
//         { status: statusCode }
//       );
//     }
//   } catch (error) {
//     console.error("Request parsing error:", error);
//     return Response.json(
//       { success: false, message: "Invalid request data" },
//       { status: 400 }
//     );
//   }
// }

// function generateVoucher(amount) {
//   const prefixMap = { 600: "V600", 1000: "V1000", 1500: "V1500", 7000: "V7000" };
//   const prefix = prefixMap[amount] || "VXXXX";
//   const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
//   return `${prefix}-${rand}`;
// }
























// import axios from "axios";
// import { v4 as uuidv4 } from "uuid";
// import { storePendingPayment, getVoucher } from "../../lib/storage.js";

// export async function POST(request) {
//   try {
//     console.log("API Route: /api/pay called");
//     const { phone, amount } = await request.json();

//     if (!phone || !amount)
//       return Response.json(
//         { success: false, message: "Phone and amount required" },
//         { status: 400 }
//       );

//     const reference = uuidv4();

//     // ✅ Format phone
//     let formattedPhone = phone.startsWith("+")
//       ? phone
//       : phone.startsWith("256")
//       ? `+${phone}`
//       : phone.startsWith("0")
//       ? `+256${phone.substring(1)}`
//       : `+256${phone}`;

//     console.log("Formatted phone:", formattedPhone);

//     // ✅ Handle local test voucher (no API call)
//     if (amount === 600) {
//       const voucher = await getVoucher(amount);
//       if (!voucher)
//         return Response.json({
//           success: false,
//           message:
//             "Payment successful but no voucher available right now. Please contact support with reference.",
//           reference,
//         });

//       return Response.json({
//         success: true,
//         data: {
//           paymentResponse: {
//             status: "success",
//             message: "Local voucher generated for 600 UGX package",
//             data: { transaction: { uuid: reference, status: "local" } },
//           },
//           voucher,
//         },
//       });
//     }

//     // ✅ Validate amount range
//     if (amount < 500 || amount > 10000000)
//       return Response.json(
//         {
//           success: false,
//           message: "Amount must be between 500 and 10,000,000 UGX",
//         },
//         { status: 400 }
//       );

//     const MARZ_API_URL =
//       process.env.MARZ_API_BASE_URL ||
//       "https://wallet.wearemarz.com/api/v1/collect-money";
//     const AUTH =
//       process.env.MARZ_BASE64_AUTH ||
//       "bWFyel80VEx3b05XUWVnY3hPRmVBOjdtSzZzUmdoNTJERkxaYmh6VDFNeFVteERFVEhuOW1q";

//     const formData = new URLSearchParams({
//       phone_number: formattedPhone,
//       amount: amount.toString(),
//       country: "UG",
//       reference,
//       description: `Voucher payment ${amount}`,
//     });

//     console.log("Calling Marz Pay API once...");
//     const response = await axios.post(MARZ_API_URL, formData, {
//       headers: {
//         Authorization: `Basic ${AUTH}`,
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//     });

//     console.log("Marz response:", response.data);

//     // ✅ Store pending payment for webhook follow-up
//     const transactionId = response.data.data?.transaction?.uuid;
//     storePendingPayment(reference, formattedPhone, amount, transactionId);

//     const status = response.data.data?.transaction?.status;
//     console.log("Transaction status:", status);

//     // ✅ If payment successful → fetch voucher from Firebase
//     if (status === "successful" || status === "success") {
//       const voucher = await getVoucher(amount);

//       if (!voucher)
//         return Response.json({
//           success: false,
//           message:
//             "Payment completed but no voucher available right now. Please contact support with reference.",
//           reference,
//         });

//       return Response.json({
//         success: true,
//         data: {
//           paymentResponse: response.data,
//           voucher,
//         },
//       });
//     }

//     // ✅ If still pending
//     return Response.json({
//       success: true,
//       message: `Payment initiated successfully. Status: ${status}. Please wait for confirmation.`,
//       data: {
//         paymentResponse: response.data,
//         reference,
//       },
//     });
//   } catch (error) {
//     console.error("Payment error:", error.response?.data || error.message);
//     const status = error.response?.status || 500;
//     const message =
//       error.response?.data?.message ||
//       error.message ||
//       "Unexpected payment error";
//     return Response.json({ success: false, message }, { status });
//   }
// }





console.log("API /api/pay started at", new Date().toISOString());

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { storePendingPayment, getVoucher } from "../../lib/storage.js";

export async function POST(request) {
  try {
    console.log("API Route: /api/pay called");
    const { phone, amount } = await request.json();

    if (!phone || !amount)
      return Response.json(
        { success: false, message: "Phone and amount required" },
        { status: 400 }
      );

    const reference = uuidv4();

    // ✅ Format phone
    let formattedPhone = phone.startsWith("+")
      ? phone
      : phone.startsWith("256")
      ? `+${phone}`
      : phone.startsWith("0")
      ? `+256${phone.substring(1)}`
      : `+256${phone}`;

    console.log("Formatted phone:", formattedPhone);


    // ✅ Validate amount range
    if (amount < 500 || amount > 10000000)
      return Response.json(
        {
          success: false,
          message: "Amount must be between 500 and 10,000,000 UGX",
        },
        { status: 400 }
      );

    // Try different Marz API endpoints if the current one has issues
    const MARZ_API_URL =
      process.env.MARZ_API_BASE_URL ||
      "https://wallet.wearemarz.com/api/v1/collect-money";

    // Alternative endpoints to try if current one fails
    const alternativeUrls = [
      "https://wallet.wearemarz.com/api/v1/collect-money",
      "https://wallet.wearemarz.com/api/v1/payments/collect",
      "https://api.wearemarz.com/v1/collect-money"
    ];

    const AUTH =
      process.env.MARZ_BASE64_AUTH ||
      "bWFyel9hMFRBRmlHaHk5M1ZCRmNZOmtXVlRTcnRtVnpsM0lVQU5rd21DVnlzSWJ3dE9BYm1Z";

    // Ensure amount is a valid number and meets Marz minimum requirements
    const numericAmount = parseInt(amount);
    if (numericAmount < 500) {
      console.warn("⚠️ Amount below Marz minimum (500 UGX), adjusting to 500");
      // Don't adjust automatically - let Marz handle it but log the issue
    }

    const formData = new URLSearchParams({
      phone_number: formattedPhone,
      amount: numericAmount.toString(),
      country: "UG",
      reference,
      description: `WiFi Voucher Payment - ${numericAmount} UGX`,
      currency: "UGX", // Explicitly specify currency
    });

    console.log("💰 Payment Details:");
    console.log("   Requested Amount:", numericAmount);
    console.log("   Phone:", formattedPhone);
    console.log("   Reference:", reference);

    console.log("🔥 Calling Marz Pay API with details:");
    console.log("   URL:", MARZ_API_URL);
    console.log("   Phone:", formattedPhone);
    console.log("   Amount:", numericAmount, "(type:", typeof numericAmount, ")");
    console.log("   Reference:", reference);
    console.log("   FormData:", Object.fromEntries(formData));
    console.log("   Headers:", {
      Authorization: `Basic ***HIDDEN***`,
      "Content-Type": "application/x-www-form-urlencoded",
    });

    // Add timeout and retry logic
    let response;
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🔄 Marz API Call Attempt ${attempt}/2`);

        response = await axios.post(MARZ_API_URL, formData, {
          headers: {
            Authorization: `Basic ${AUTH}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 30000, // 30 second timeout
        });

        console.log(`✅ Marz API Call Successful on Attempt ${attempt}`);
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error;
        console.error(`❌ Marz API Call Failed on Attempt ${attempt}:`, error.message);

        if (attempt === 2) {
          // Last attempt failed
          throw new Error(`Marz API failed after ${attempt} attempts: ${error.message}`);
        }

        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log("🔥 Marz API Response:");
    console.log("   Status:", response.status);
    console.log("   Full Response:", JSON.stringify(response.data, null, 2));

    // ✅ Store pending payment for webhook follow-up
    const transactionId = response.data.data?.transaction?.uuid;
    storePendingPayment(reference, formattedPhone, numericAmount, transactionId);

    const status = response.data.data?.transaction?.status;
    const actualAmount = response.data.data?.transaction?.amount;

    console.log("📊 Marz API Response Analysis:");
    console.log("   Transaction Status:", status);
    console.log("   Requested Amount:", numericAmount);
    console.log("   Actual Amount from Marz:", actualAmount);
    console.log("   Transaction ID:", transactionId);

    // Check for amount mismatch
    if (actualAmount && parseInt(actualAmount) !== numericAmount) {
      console.error("🚨 CRITICAL: AMOUNT MISMATCH!");
      console.error("   Expected:", numericAmount, "UGX");
      console.error("   Marz charged:", actualAmount, "UGX");
      console.error("   Difference:", parseInt(actualAmount) - numericAmount, "UGX");
    } else if (!actualAmount) {
      console.warn("⚠️ No amount returned from Marz API");
    } else {
      console.log("✅ Amount matches correctly");
    }

    // Validate transaction status
    if (status !== 'pending' && status !== 'success') {
      console.warn("⚠️ Unexpected transaction status:", status);
    }

    // ✅ Always return reference; voucher will be issued after confirmation via polling/webhooks
    const responseData = {
      success: true,
      message: `Payment initiated successfully. Status: ${status}. Please wait for confirmation.`,
      data: {
        paymentResponse: response.data,
        reference,
        transactionUuid: transactionId,
        requestedAmount: numericAmount,
        actualAmount: actualAmount,
        amountMatch: actualAmount ? (parseInt(actualAmount) === numericAmount) : null,
      },
    };

    // Log final summary
    console.log("💳 Payment Summary:");
    console.log("   Reference:", reference);
    console.log("   Requested:", numericAmount, "UGX");
    console.log("   Marz Amount:", actualAmount, "UGX");
    console.log("   Status:", status);
    console.log("   Amount Match:", responseData.data.amountMatch ? "✅ YES" : "❌ NO");

    return Response.json(responseData);
  } catch (error) {
    console.error("Payment error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Unexpected payment error";
    return Response.json({ success: false, message }, { status });
  }
}
