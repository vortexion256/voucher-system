# Multi-Tenant Implementation Guide

## Overview

The voucher app has been transformed into a multi-tenant platform where each user can:
- Have their own embeddable URL (`/embed/[slug]`)
- Use their own Marz Pay API credentials
- Manage their own vouchers independently
- Track their own payments and transactions

## Architecture

### Database Structure

All Firebase collections now support tenant scoping with `userId`:

- **users/{userId}** - User/tenant accounts
  - `email`, `name`, `slug`
  - `marzApiKey`, `marzApiSecret`, `marzBase64Auth`
  - `embedUrl`, `active`, `createdAt`

- **vouchers/{voucherId}** - Vouchers (tenant-scoped)
  - `userId` - Tenant owner
  - `code`, `amount`, `used`, `assignedTo`

- **pendingPayments/{reference}** - Pending payments (tenant-scoped)
  - `userId` - Tenant owner
  - `phone`, `amount`, `status`, `transactionId`

- **completedVouchers/{reference}** - Completed payments (tenant-scoped)
  - `userId` - Tenant owner
  - `voucher`, `phone`, `amount`, `status`

- **paymentJobs/{jobId}** - Background jobs (tenant-scoped)
  - `userId` - Tenant owner
  - `reference`, `phone`, `amount`, `transactionUuid`

## New Files Created

### 1. User Management API
- **`app/api/users/route.js`** - Create and get users
  - `POST /api/users` - Create new user/tenant
  - `GET /api/users?slug=xxx` - Get user by slug
  - `GET /api/users?userId=xxx` - Get user by ID
  - `GET /api/users?email=xxx` - Get user by email

- **`app/api/users/[userId]/credentials/route.js`** - Manage credentials
  - `PUT /api/users/[userId]/credentials` - Update Marz API credentials
  - `GET /api/users/[userId]/credentials` - Get credentials (internal use)

### 2. Embeddable Page
- **`app/embed/[slug]/page.js`** - Public payment page
  - Fetches user by slug
  - Uses user's credentials for payments
  - Tenant-scoped voucher assignment

### 3. User Dashboard
- **`app/dashboard/page.js`** - User management interface
  - Manage Marz API credentials
  - Add/manage vouchers
  - View and copy embed URL

## Updated Files

### Storage Functions (`app/lib/storage.js`)
All functions now support optional `userId` parameter:
- `storePendingPayment(reference, phone, amount, transactionId, userId)`
- `updatePaymentStatus(reference, status, voucher, userId)`
- `getPayment(reference, userId)`
- `getPaymentByPhone(phone, userId)`

### API Routes
- **`app/api/pay/route.js`** - Accepts `userId`, fetches user credentials
- **`app/api/check-payment/route.js`** - Accepts `userId`, tenant-scoped queries
- **`app/api/get-voucher/route.js`** - Accepts `userId`, tenant-scoped voucher lookup
- **`app/api/process-payment-jobs/route.js`** - Tenant-aware voucher generation

### Job Queue (`app/lib/jobQueue.js`)
- `addPaymentJob()` now accepts optional `userId` parameter

## Usage Flow

### 1. User Registration
```javascript
// Create a new user/tenant
POST /api/users
{
  "email": "user@example.com",
  "name": "John Doe",
  "slug": "johndoe",
  "marzApiKey": "your_api_key",
  "marzApiSecret": "your_api_secret"
}
```

### 2. Set Up Credentials
Users can update their Marz API credentials via:
- Dashboard at `/dashboard` (credentials tab)
- API: `PUT /api/users/[userId]/credentials`

### 3. Add Vouchers
Users add vouchers via:
- Dashboard at `/dashboard` (vouchers tab)
- Directly to Firestore with `userId` field

### 4. Share Embed URL
Each user gets a unique embed URL:
- Format: `https://yourdomain.com/embed/[slug]`
- Example: `https://yourdomain.com/embed/johndoe`

### 5. Customer Payment Flow
1. Customer visits `/embed/[slug]`
2. Page fetches user by slug
3. Customer enters phone and amount
4. Payment uses user's Marz API credentials
5. Voucher assigned from user's voucher pool
6. SMS sent to customer

## Environment Variables

No new environment variables required. The system uses:
- Existing `NEXT_PUBLIC_APP_URL` for generating embed URLs
- Existing `MARZ_API_BASE_URL` as fallback (users can override with their own)

## Backward Compatibility

The system maintains backward compatibility:
- If `userId` is not provided, uses default/env Marz credentials
- Existing single-tenant deployments continue to work
- Vouchers without `userId` are treated as global (for migration)

## Migration Notes

### For Existing Data

If you have existing vouchers/payments without `userId`:

1. **Vouchers**: Add `userId` field to existing vouchers in Firestore
2. **Payments**: Existing payments without `userId` will use default credentials
3. **Users**: Create user accounts for existing tenants

### Example Migration Script

```javascript
// Add userId to existing vouchers (run once)
const vouchersRef = collection(db, "vouchers");
const snapshot = await getDocs(vouchersRef);

for (const doc of snapshot.docs) {
  const data = doc.data();
  if (!data.userId) {
    await updateDoc(doc.ref, {
      userId: "default-user-id" // Replace with actual user ID
    });
  }
}
```

## Security Considerations

1. **Credential Storage**: Marz API credentials are stored in Firestore (consider encryption for production)
2. **Tenant Isolation**: All queries filter by `userId` to prevent cross-tenant data access
3. **Slug Validation**: Slugs are validated (alphanumeric + hyphens only)
4. **Access Control**: Dashboard requires Firebase authentication

## Testing

### Test User Creation
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "slug": "testuser",
    "marzApiKey": "test_key",
    "marzApiSecret": "test_secret"
  }'
```

### Test Embed Page
1. Create a user with slug "testuser"
2. Visit: `http://localhost:3000/embed/testuser`
3. Make a test payment

### Test Dashboard
1. Login with Firebase Auth
2. Visit: `http://localhost:3000/dashboard`
3. Manage credentials and vouchers

## Next Steps

1. **Add User Registration UI**: Create a signup page for new users
2. **Enhance Dashboard**: Add analytics, transaction history
3. **Add Webhook Support**: Update webhook routes to be tenant-aware
4. **Add Admin Panel**: Super admin to manage all users
5. **Add Billing**: Track usage per tenant

## Support

For issues or questions, check:
- API routes in `app/api/`
- Storage functions in `app/lib/storage.js`
- Dashboard in `app/dashboard/page.js`
- Embed page in `app/embed/[slug]/page.js`
