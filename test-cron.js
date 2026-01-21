#!/usr/bin/env node

/**
 * Local cron job simulator for testing server-side payment processing
 * This script simulates a cron job that runs every 5 seconds to check for payment jobs
 * Run this in a separate terminal while testing payments
 */

const BASE_URL = 'http://localhost:3000';

console.log('🚀 Local Cron Job Simulator Started');
console.log('📅 Will check for payment jobs every 5 seconds');
console.log('🔗 Server URL:', BASE_URL);
console.log('⏰ Started at:', new Date().toISOString());
console.log('─'.repeat(50));

// Keep track of stats
let checks = 0;
let jobsProcessed = 0;
let lastActivity = new Date();

setInterval(async () => {
  checks++;
  const timestamp = new Date().toISOString();

  try {
    console.log(`\n🔄 [${timestamp}] Check #${checks} - Running background job processor...`);

    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}/api/cron/process-jobs`, {
      method: 'GET',
      headers: {
        'User-Agent': 'TestCron/1.0',
      },
      // Timeout after 10 seconds
      signal: AbortSignal.timeout(10000),
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success && result.cronExecuted) {
      const jobResult = result.jobProcessorResult;

      if (jobResult && jobResult.processed) {
        // Job was processed
        jobsProcessed++;
        lastActivity = new Date();

        console.log(`✅ [${duration}ms] Job processed: ${jobResult.processed}`);
        console.log(`   📊 Status: ${jobResult.status}`);

        if (jobResult.voucher) {
          console.log(`   🎫 Voucher: ${jobResult.voucher}`);
        }

        if (jobResult.message && jobResult.message !== "No pending jobs to process") {
          console.log(`   💬 Message: ${jobResult.message}`);
        }
      } else if (jobResult && jobResult.message === "No pending jobs to process") {
        // No jobs to process - normal idle state
        console.log(`⏸️  [${duration}ms] No pending jobs (idle)`);
      } else {
        // Cron executed but unexpected result
        console.log(`⚠️  [${duration}ms] Cron executed but unexpected result:`, jobResult?.message || 'Unknown');
      }
    } else {
      throw new Error(result.error || 'Cron execution failed');
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ [${timestamp}] Timeout - Server took too long to respond`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`❌ [${timestamp}] Connection refused - Is the dev server running?`);
      console.log('   💡 Make sure to run: npm run dev');
    } else {
      console.error(`❌ [${timestamp}] Error: ${error.message}`);
    }
  }

  // Print stats every 10 checks
  if (checks % 10 === 0) {
    console.log('\n📊 Stats Summary:');
    console.log(`   🔢 Total checks: ${checks}`);
    console.log(`   ✅ Jobs processed: ${jobsProcessed}`);
    console.log(`   🕐 Last activity: ${lastActivity.toISOString()}`);
    console.log(`   ⏱️  Uptime: ${Math.floor((Date.now() - new Date()) / 1000)}s`);
    console.log('─'.repeat(50));
  }

}, 5000); // Check every 5 seconds

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Cron job simulator stopped');
  console.log(`📊 Final stats: ${checks} checks, ${jobsProcessed} jobs processed`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Cron job simulator terminated');
  console.log(`📊 Final stats: ${checks} checks, ${jobsProcessed} jobs processed`);
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

