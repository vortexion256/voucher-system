// /app/api/check-voucher-availability/route.js

import { db } from "../../lib/firebase.js";
import { collection, query, where, getDocs } from "firebase/firestore";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { amount } = await request.json();

    console.log(`🔍 Checking voucher availability for ${amount} UGX`);

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "Valid amount required"
      }), { status: 400 });
    }

    // Check if vouchers are available for this amount
    const vouchersRef = collection(db, "vouchers");
    const q = query(
      vouchersRef,
      where("amount", "==", Number(amount)),
      where("used", "==", false)
    );

    const snapshot = await getDocs(q);

    console.log(`🔍 Found ${snapshot.size} available vouchers for ${amount} UGX`);

    return new Response(JSON.stringify({
      success: true,
      available: snapshot.size > 0,
      count: snapshot.size,
      amount: amount
    }), { status: 200 });

  } catch (err) {
    console.error("Error checking voucher availability:", err);
    return new Response(JSON.stringify({
      success: false,
      message: "Internal Server Error"
    }), { status: 500 });
  }
}


