// Simple job queue system using Firestore for server-side payment processing
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp
} from "firebase/firestore";

const jobsCollection = collection(db, "paymentJobs");

/**
 * Add a payment job to the queue for background processing
 * @param {string} reference - Payment reference
 * @param {string} phone - Customer phone number
 * @param {number} amount - Payment amount
 * @param {string} transactionUuid - MarzPay transaction UUID
 */
export async function addPaymentJob(reference, phone, amount, transactionUuid) {
  try {
    await addDoc(jobsCollection, {
      reference,
      phone,
      amount,
      transactionUuid,
      status: "pending", // pending, processing, completed, failed
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      retryCount: 0,
      maxRetries: 60, // 5 minutes at 5-second intervals
      lastCheckedAt: null,
    });
    console.log(`✅ Payment job added to queue: ${reference}`);
  } catch (error) {
    console.error(`❌ Failed to add job to queue: ${reference}`, error);
    throw error;
  }
}

/**
 * Get the next pending job from the queue (oldest first)
 * @returns {Object|null} Next pending job or null if none available
 */
export async function getNextPendingJob() {
  try {
    console.log("🔍 Querying for pending jobs...");

    // First, try to get all pending jobs and sort them manually
    // This avoids the composite index requirement
    const q = query(jobsCollection, where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    console.log(`📊 Found ${snapshot.size} pending jobs`);

    if (!snapshot.empty) {
      // Sort by createdAt manually and take the oldest
      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by createdAt (oldest first)
      jobs.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return aTime - bTime;
      });

      const oldestJob = jobs[0];
      console.log(`✅ Found oldest pending job: ${oldestJob.id} - ${oldestJob.reference}`);
      return oldestJob;
    }

    console.log("⏸️ No pending jobs found");
    return null;
  } catch (error) {
    console.error("❌ Failed to get next pending job:", error);
    console.error("Error details:", error.message);
    return null;
  }
}

/**
 * Update job status and metadata
 * @param {string} jobId - Job document ID
 * @param {string} status - New status
 * @param {Object} updates - Additional updates
 */
export async function updateJobStatus(jobId, status, updates = {}) {
  try {
    const jobRef = doc(db, "paymentJobs", jobId);
    await updateDoc(jobRef, {
      status,
      updatedAt: Timestamp.now(),
      lastCheckedAt: Timestamp.now(),
      ...updates
    });
    console.log(`📊 Job ${jobId} status updated to: ${status}`);
  } catch (error) {
    console.error(`❌ Failed to update job ${jobId} status:`, error);
  }
}

/**
 * Mark job as completed and remove it from the queue
 * @param {string} jobId - Job document ID
 */
export async function completeJob(jobId) {
  try {
    const jobRef = doc(db, "paymentJobs", jobId);
    await deleteDoc(jobRef);
    console.log(`✅ Job ${jobId} completed and removed from queue`);
  } catch (error) {
    console.error(`❌ Failed to complete job ${jobId}:`, error);
  }
}

/**
 * Get all jobs (for debugging/admin purposes)
 * @param {string} status - Filter by status (optional)
 * @returns {Array} Array of jobs
 */
export async function getAllJobs(status = null) {
  try {
    let q;
    if (status) {
      q = query(jobsCollection, where("status", "==", status));
    } else {
      q = query(jobsCollection, orderBy("createdAt", "desc"));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("❌ Failed to get jobs:", error);
    return [];
  }
}

/**
 * Clean up old completed/failed jobs (older than 24 hours)
 */
export async function cleanupOldJobs() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all completed and failed jobs
    const q = query(jobsCollection, where("status", "in", ["completed", "failed"]));
    const snapshot = await getDocs(q);

    let cleanedCount = 0;
    for (const jobDoc of snapshot.docs) {
      const jobData = jobDoc.data();
      if (jobData.updatedAt.toDate() < oneDayAgo) {
        await deleteDoc(jobDoc.ref);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old jobs`);
    }
  } catch (error) {
    console.error("❌ Failed to cleanup old jobs:", error);
  }
}
