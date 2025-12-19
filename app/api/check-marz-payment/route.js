import axios from "axios";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Check payment status using MarzPay API polling
 * GET /api/v1/collect-money/{uuid}
 */
export async function POST(request) {
  try {
    const { reference, transactionUuid } = await request.json();
    
    if (!reference) {
      return Response.json(
        { success: false, message: "Reference required" },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking MarzPay payment status for reference: ${reference}`);
    
    // If no transaction UUID provided, we can't check with MarzPay API
    if (!transactionUuid) {
      console.log("No transaction UUID provided, cannot check with MarzPay API");
      return Response.json(
        { success: false, message: "Transaction UUID required for MarzPay API check" },
        { status: 400 }
      );
    }

    // MarzPay API configuration
    const apiUrl = process.env.MARZ_API_BASE_URL || "https://wallet.wearemarz.com/api/v1";
    const base64Auth = process.env.MARZ_BASE64_AUTH || "bWFyel9hMFRBRmlHaHk5M1ZCRmNZOmtXVlRTcnRtVnpsM0lVQU5rd21DVnlzSWJ3dE9BYm1Z";
    
    console.log(`🌐 Checking MarzPay API: ${apiUrl}/collect-money/${transactionUuid}`);
    
    try {
      const response = await axios.get(
        `${apiUrl}/collect-money/${transactionUuid}`,
        {
          headers: {
            Authorization: `Basic ${base64Auth}`,
          },
        }
      );
      
      console.log("MarzPay API response:", response.data);
      
      const transaction = response.data.data?.transaction;
      const collection = response.data.data?.collection;
      
      if (!transaction) {
        console.log("No transaction data in MarzPay response");
        return Response.json(
          { success: false, message: "No transaction data found" },
          { status: 404 }
        );
      }
      
      const status = transaction.status;
      console.log(`📊 MarzPay status: ${status}`);
      
      // Map MarzPay status to our internal status
      let internalStatus;
      let isComplete = false;
      let shouldGenerateVoucher = false;
      
      switch (status) {
        case "successful":
        case "completed":
          internalStatus = "successful";
          isComplete = true;
          shouldGenerateVoucher = true;
          break;
        case "failed":
        case "rejected":
          internalStatus = "failed";
          isComplete = true;
          break;
        case "processing":
        case "pending":
        case "timeout":
          internalStatus = "processing";
          isComplete = false;
          break;
        default:
          internalStatus = "processing";
          isComplete = false;
      }
      
      console.log(`🔄 Mapped status: ${status} -> ${internalStatus}`);
      console.log(`✅ Is complete: ${isComplete}`);
      console.log(`🎫 Should generate voucher: ${shouldGenerateVoucher}`);
      
      return Response.json({
        success: true,
        data: {
          reference: reference,
          transactionUuid: transactionUuid,
          marzPayStatus: status,
          internalStatus: internalStatus,
          isComplete: isComplete,
          shouldGenerateVoucher: shouldGenerateVoucher,
          amount: collection?.amount || null,
          phone: collection?.phone_number || null,
          providerReference: transaction.provider_reference || null,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("MarzPay API error:", error.response?.data || error.message);
      
      return Response.json(
        { 
          success: false, 
          message: "Failed to check payment status with MarzPay API",
          error: error.response?.data || error.message 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error("Check MarzPay payment error:", error);
    return Response.json(
      { success: false, message: "Failed to check payment status" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    message: "MarzPay payment status checker",
    usage: "POST with { reference: 'your-reference', transactionUuid: 'marz-uuid' }",
    endpoint: "GET /api/v1/collect-money/{uuid}",
    timestamp: new Date().toISOString()
  });
}

















