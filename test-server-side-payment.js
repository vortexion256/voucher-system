#!/usr/bin/env node

/**
 * Test script for server-side payment processing
 * This script tests the complete payment flow with background jobs
 */

// Using built-in fetch (Node.js 18+)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testServerSidePayment() {
  console.log('🧪 Testing Server-Side Payment Processing\n');

  try {
    // Test 1: Check if background worker is responding
    console.log('1️⃣ Testing background worker endpoint...');
    const workerResponse = await fetch(`${BASE_URL}/api/process-payment-jobs`);
    const workerData = await workerResponse.json();
    console.log('✅ Worker response:', workerData.message || 'OK');

    // Test 2: Check if cron endpoint is responding
    console.log('\n2️⃣ Testing cron endpoint...');
    const cronResponse = await fetch(`${BASE_URL}/api/cron/process-jobs`);
    const cronData = await cronResponse.json();
    console.log('✅ Cron response:', cronData.message || 'OK');

    // Test 3: Test payment initiation (this will create a background job)
    console.log('\n3️⃣ Testing payment initiation...');
    const paymentResponse = await fetch(`${BASE_URL}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+256700000000', // Test phone
        amount: 500
      })
    });

    if (!paymentResponse.ok) {
      throw new Error(`Payment failed: ${paymentResponse.status}`);
    }

    const paymentData = await paymentResponse.json();
    console.log('✅ Payment initiated:', paymentData.message);

    if (paymentData.success) {
      console.log('✅ Background job should be created');
      console.log('📝 Reference:', paymentData.data?.reference);

      // Test 4: Wait a moment then trigger cron job manually
      console.log('\n4️⃣ Testing manual cron trigger...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const manualCronResponse = await fetch(`${BASE_URL}/api/cron/process-jobs`);
      const manualCronData = await manualCronResponse.json();
      console.log('✅ Manual cron result:', manualCronData.jobProcessorResult?.message || 'OK');

      console.log('\n🎉 Server-side payment processing test completed!');
      console.log('\n📋 What happens now:');
      console.log('• Background job is queued in Firestore');
      console.log('• Cron job runs every 5 seconds');
      console.log('• Worker polls MarzPay API for payment status');
      console.log('• When successful: voucher generated, SMS sent, transaction saved');
      console.log('• User receives SMS with voucher code automatically');

    } else {
      console.error('❌ Payment initiation failed:', paymentData.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Make sure your Next.js app is running with: npm run dev');
  }
}

// Run the test
if (require.main === module) {
  testServerSidePayment();
}

module.exports = { testServerSidePayment };
