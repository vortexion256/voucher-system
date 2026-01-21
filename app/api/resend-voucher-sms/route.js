import { getLastCompletedWithVoucherByPhone } from "../../lib/storage.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return Response.json(
        { success: false, message: "Phone number required" },
        { status: 400 }
      );
    }

    const data = await getLastCompletedWithVoucherByPhone(phone.trim());

    if (!data || !data.voucher) {
      return Response.json({
        success: false,
        message: "No completed voucher found for this number. Make a payment first.",
      });
    }

    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host");
    const baseUrl = `${proto}://${host}`;
    const message = `Your wifi code ${data.voucher}. Ref: ${data.reference}. (Resent)`;

    const smsRes = await fetch(`${baseUrl}/api/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: data.phone, message }),
    });
    const smsJson = await smsRes.json();

    if (!smsRes.ok || !smsJson.success) {
      return Response.json({
        success: false,
        message: smsJson.message || "Failed to send SMS. Please try again.",
      });
    }

    return Response.json({
      success: true,
      message: "Voucher sent to your phone by SMS.",
    });
  } catch (error) {
    console.error("Resend voucher SMS error:", error);
    return Response.json(
      { success: false, message: "Failed to resend voucher. Please try again." },
      { status: 500 }
    );
  }
}
