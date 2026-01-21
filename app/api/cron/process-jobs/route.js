import { cleanupOldJobs } from "../../../lib/jobQueue.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron job endpoint that triggers payment job processing
 * This should be called every 5-10 seconds by a cron job or scheduled task
 */
export async function GET() {
  const startTime = Date.now();

  try {
    console.log("⏰ Cron job triggered - processing payment jobs...");

    // Get the base URL for internal API calls
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || 'localhost:3000';
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `https://${host}`
      : `${protocol}://${host}`;

    // Call the job processor
    const jobProcessorUrl = `${baseUrl}/api/process-payment-jobs`;
    console.log(`🔗 Calling job processor: ${jobProcessorUrl}`);

    const response = await fetch(jobProcessorUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PaymentCron/1.0',
      },
      // Short timeout to avoid hanging
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    const result = await response.json();
    const processingTime = Date.now() - startTime;

    if (response.ok && result.success) {
      console.log(`✅ Cron job completed successfully in ${processingTime}ms`);

      // If no jobs were processed, also run cleanup (less frequently)
      if (result.message === "No pending jobs to process") {
        console.log("🧹 Running job cleanup...");
        await cleanupOldJobs();
      }

      return Response.json({
        success: true,
        cronExecuted: true,
        executionTime: processingTime,
        jobProcessorResult: result,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Cron job failed: ${result.message || 'Unknown error'}`);

      return Response.json({
        success: false,
        cronExecuted: true,
        executionTime: processingTime,
        jobProcessorResult: result,
        error: result.message || 'Job processor failed',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;

    if (error.name === 'AbortError') {
      console.error("⏰ Cron job timed out after 15 seconds");
      return Response.json({
        success: false,
        cronExecuted: false,
        executionTime: processingTime,
        error: "Timeout - job processor took too long",
        timestamp: new Date().toISOString()
      }, { status: 408 });
    }

    console.error("❌ Cron job error:", error);
    return Response.json({
      success: false,
      cronExecuted: false,
      executionTime: processingTime,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST() {
  // Same as GET for flexibility
  return GET();
}

