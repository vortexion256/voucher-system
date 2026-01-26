import { db } from "../../lib/firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";

/**
 * Get analytics data for the dashboard
 * Returns:
 * - Voucher statistics by category (used/unused)
 * - Daily sales (last 7 days)
 * - Weekly sales (last 4 weeks)
 * - Failed payments count
 */
export async function GET(request) {
  try {
    // Get all vouchers
    const vouchersRef = collection(db, "vouchers");
    const vouchersSnapshot = await getDocs(vouchersRef);

    // Get all transactions
    const transactionsRef = collection(db, "transactions");
    const transactionsSnapshot = await getDocs(transactionsRef);

    // Get all pending payments (for failed payments)
    const pendingPaymentsRef = collection(db, "pendingPayments");
    const pendingPaymentsSnapshot = await getDocs(pendingPaymentsRef);

    // Get all completed vouchers (for additional transaction data)
    const completedVouchersRef = collection(db, "completedVouchers");
    const completedVouchersSnapshot = await getDocs(completedVouchersRef);

    // Process vouchers by category
    const voucherStats = {
      500: { used: 0, unused: 0, total: 0 },
      1000: { used: 0, unused: 0, total: 0 },
      2500: { used: 0, unused: 0, total: 0 },
    };

    vouchersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const amount = Number(data.amount);
      if (voucherStats[amount]) {
        voucherStats[amount].total++;
        if (data.used) {
          voucherStats[amount].used++;
        } else {
          voucherStats[amount].unused++;
        }
      }
    });

    // Process daily sales (last 7 days)
    const now = new Date();
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayKey = date.toISOString().split("T")[0];
      let totalAmount = 0;
      let count = 0;

      // Check transactions collection
      transactionsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "successful" && data.voucher) {
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : new Date(data.createdAt);
          if (createdAt >= date && createdAt < nextDay) {
            totalAmount += Number(data.amount) || 0;
            count++;
          }
        }
      });

      // Check completedVouchers collection
      completedVouchersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "successful" && data.voucher) {
          const updatedAt = data.updatedAt?.toDate
            ? data.updatedAt.toDate()
            : new Date(data.updatedAt);
          if (updatedAt >= date && updatedAt < nextDay) {
            totalAmount += Number(data.amount) || 0;
            count++;
          }
        }
      });

      dailySales.push({
        date: dayKey,
        amount: totalAmount,
        count: count,
      });
    }

    // Process weekly sales (last 4 weeks)
    const weeklySales = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 7 * i); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekKey = `Week ${i + 1}`;
      let totalAmount = 0;
      let count = 0;

      // Check transactions collection
      transactionsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "successful" && data.voucher) {
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : new Date(data.createdAt);
          if (createdAt >= weekStart && createdAt < weekEnd) {
            totalAmount += Number(data.amount) || 0;
            count++;
          }
        }
      });

      // Check completedVouchers collection
      completedVouchersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === "successful" && data.voucher) {
          const updatedAt = data.updatedAt?.toDate
            ? data.updatedAt.toDate()
            : new Date(data.updatedAt);
          if (updatedAt >= weekStart && updatedAt < weekEnd) {
            totalAmount += Number(data.amount) || 0;
            count++;
          }
        }
      });

      weeklySales.push({
        week: weekKey,
        startDate: weekStart.toISOString().split("T")[0],
        endDate: new Date(weekEnd.getTime() - 1)
          .toISOString()
          .split("T")[0],
        amount: totalAmount,
        count: count,
      });
    }

    // Count failed payments
    let failedCount = 0;
    let failedAmount = 0;

    // Check transactions with failed status
    transactionsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.status === "failed") {
        failedCount++;
        failedAmount += Number(data.amount) || 0;
      }
    });

    // Check pendingPayments with failed status
    pendingPaymentsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.status === "failed") {
        failedCount++;
        failedAmount += Number(data.amount) || 0;
      }
    });

    return Response.json({
      success: true,
      data: {
        vouchers: voucherStats,
        dailySales: dailySales,
        weeklySales: weeklySales,
        failedPayments: {
          count: failedCount,
          amount: failedAmount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return Response.json(
      {
        success: false,
        message: "Failed to fetch analytics data",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
