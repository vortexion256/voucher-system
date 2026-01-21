# 🧪 Server-Side Payment Processing Testing

## 🎯 **Test Goal**
Verify that payment processing continues even when users close their browser!

## 📋 **Test Scripts Created**

### **1. `test-cron.js`** - Background Job Simulator
Simulates a cron job that runs every 5 seconds to process payment jobs.

### **2. `test-payment-flow.js`** - Complete Flow Test
Tests the entire payment flow from initiation to completion.

## 🚀 **How to Test**

### **Step 1: Start the Development Server**
```bash
npm run dev
```

### **Step 2: Start Background Job Processing** (in separate terminal)
```bash
node test-cron.js
```

You should see:
```
🚀 Local Cron Job Simulator Started
📅 Will check for payment jobs every 5 seconds
🔗 Server URL: http://localhost:3000
⏰ Started at: 2026-01-04T21:00:00.000Z
──────────────────────────────────────────────────
```

### **Step 3: Test Payment Flow**
```bash
node test-payment-flow.js
```

This will:
- ✅ Check server connectivity
- ✅ Verify voucher availability
- ✅ Initiate a test payment
- ✅ Confirm background job creation

### **Step 4: Browser Test - The Real Test!**

1. **Open browser** to `http://localhost:3000`
2. **Enter phone number** (use `+256700000000` for testing)
3. **Click "BUY"** on any voucher option (500 UGX recommended)
4. **IMMEDIATELY CLOSE THE BROWSER** tab/window
5. **Watch the cron job terminal** - processing continues!

## 📊 **Expected Results**

### **Cron Job Terminal Output:**
```
🔄 [2026-01-04T21:00:05.000Z] Check #1 - Running background job processor...
✅ [250ms] Job processed: abc-123-def-456
   📊 Status: still_processing
   💬 Message: Payment still processing

🔄 [2026-01-04T21:00:10.000Z] Check #2 - Running background job processor...
✅ [180ms] Job processed: abc-123-def-456
   📊 Status: successful
   🎫 Voucher: V0500-XYZ789
```

### **What This Proves:**
✅ **Browser closed** - User experience unaffected
✅ **Processing continued** - Server-side polling worked
✅ **SMS sent** - Check your phone/test number
✅ **Database updated** - Transaction saved to Firestore

## 🔍 **Monitor Job Queue**

Check active jobs:
```bash
curl http://localhost:3000/api/process-payment-jobs
```

View Firestore collections:
- `paymentJobs` - Active background jobs
- `transactions` - Completed payments
- `vouchers` - Available voucher inventory

## 🐛 **Debugging**

### **If No Jobs Are Created:**
```bash
# Check payment initiation
curl -X POST http://localhost:3000/api/pay \
  -H "Content-Type: application/json" \
  -d '{"phone":"+256700000000","amount":500}'
```

### **If Jobs Aren't Processing:**
```bash
# Manual job trigger
curl http://localhost:3000/api/cron/process-jobs
```

### **Check Server Logs:**
Look for errors in the `npm run dev` terminal.

## 📱 **Real Payment Testing**

For production-like testing:

1. **Use real MarzPay credentials** in `.env`
2. **Use real phone number** for SMS testing
3. **Make small payment** (500 UGX)
4. **Close browser immediately**
5. **Wait for SMS confirmation**

## 🎯 **Success Criteria**

- ✅ Browser can be closed immediately after payment
- ✅ Background processing logs show job activity
- ✅ SMS is received (even with browser closed)
- ✅ No JavaScript errors in browser console
- ✅ Firestore shows completed transactions

## 🚨 **Common Issues & Solutions**

### **"Server not running"**
```bash
npm run dev
```

### **"No vouchers available"**
Add vouchers to Firestore `vouchers` collection:
```javascript
{
  code: "V0500-TEST001",
  amount: 500,
  used: false,
  createdAt: Timestamp.now()
}
```

### **"Connection refused"**
- Check server is running on port 3000
- Verify BASE_URL in test scripts

### **Jobs not processing**
- Check Firestore permissions
- Verify MarzPay API credentials
- Look at server error logs

## 🎉 **Success!**

When you see voucher codes being generated and SMS being sent **even after closing the browser**, you've successfully implemented **server-side payment processing**! 🚀

Your payment system is now **browser-independent** and **highly reliable**. Users can safely close their browsers immediately after purchasing vouchers.

