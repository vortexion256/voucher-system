import { getAllJobs } from "../../lib/jobQueue.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    console.log("🔍 Checking all jobs in the queue...");

    const allJobs = await getAllJobs();
    console.log(`📊 Found ${allJobs.length} total jobs in queue`);

    const pendingJobs = allJobs.filter(job => job.status === 'pending');
    const processingJobs = allJobs.filter(job => job.status === 'processing');
    const completedJobs = allJobs.filter(job => job.status === 'completed');
    const failedJobs = allJobs.filter(job => job.status === 'failed');

    console.log(`⏳ Pending jobs: ${pendingJobs.length}`);
    console.log(`🔄 Processing jobs: ${processingJobs.length}`);
    console.log(`✅ Completed jobs: ${completedJobs.length}`);
    console.log(`❌ Failed jobs: ${failedJobs.length}`);

    // Show details of pending jobs
    if (pendingJobs.length > 0) {
      console.log("\n📋 Pending job details:");
      pendingJobs.forEach(job => {
        console.log(`   ID: ${job.id}`);
        console.log(`   Reference: ${job.reference}`);
        console.log(`   Phone: ${job.phone}`);
        console.log(`   Amount: ${job.amount}`);
        console.log(`   Transaction ID: ${job.transactionUuid}`);
        console.log(`   Created: ${job.createdAt?.toDate?.()?.toISOString() || job.createdAt}`);
        console.log(`   Retry Count: ${job.retryCount || 0}`);
        console.log("   ---");
      });
    }

    return Response.json({
      success: true,
      totalJobs: allJobs.length,
      pendingJobs: pendingJobs.length,
      processingJobs: processingJobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      jobs: allJobs.map(job => ({
        id: job.id,
        reference: job.reference,
        status: job.status,
        phone: job.phone,
        amount: job.amount,
        transactionUuid: job.transactionUuid,
        createdAt: job.createdAt?.toDate?.()?.toISOString() || job.createdAt,
        retryCount: job.retryCount || 0
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Debug jobs error:", error);
    return Response.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

