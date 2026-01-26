# Multi-Tenant User Flow Guide

## User Account Scenarios

### Scenario 1: New User (No Account)
**Flow:** Signup → Dashboard
1. User visits `/signup`
2. Creates Firebase Auth account + User profile
3. Redirected to `/dashboard`

### Scenario 2: Existing Firebase Auth, No Profile
**Flow:** Login → Complete Profile → Dashboard
1. User has Firebase Auth account (from previous signup attempt, migration, etc.)
2. User visits `/login` or `/auth/login`
3. Logs in successfully
4. System detects no profile in `users` collection
5. Redirected to `/complete-profile`
6. User fills in name, slug, optional credentials
7. Profile created, redirected to `/dashboard`

### Scenario 3: Existing User with Profile
**Flow:** Login → Dashboard
1. User has both Firebase Auth and profile
2. User logs in
3. Directly redirected to `/dashboard`

## Pages Created

### 1. `/signup` - New User Registration
- Creates Firebase Auth account
- Creates user profile in Firestore
- All in one step

### 2. `/complete-profile` - Profile Completion
- For users with Firebase Auth but no profile
- Only requires: name, slug, optional credentials
- Email is pre-filled (read-only)

### 3. `/auth/login` - Email/Password Login
- Alternative login page for multi-tenant users
- Checks for profile existence
- Redirects to `/complete-profile` if no profile found

### 4. `/dashboard` - User Dashboard
- Automatically redirects to `/complete-profile` if no profile found
- Shows error message before redirect

## How It Works

### Login Detection Logic

```javascript
// After successful Firebase Auth login:
1. Check if user exists in `users` collection
2. If YES → Go to dashboard
3. If NO → Go to complete-profile page
```

### Dashboard Protection

```javascript
// Dashboard checks on load:
1. User authenticated? → Check users collection
2. Profile exists? → Show dashboard
3. No profile? → Redirect to /complete-profile
```

## Use Cases

### Use Case 1: User Created Account But Never Completed Setup
- User signed up but closed browser before completing
- User logs in → Automatically redirected to complete profile
- User fills in missing info → Can use dashboard

### Use Case 2: Migration from Old System
- Existing Firebase Auth users need to be added to new system
- Users log in → Redirected to complete profile
- They add their business details → Ready to use

### Use Case 3: Account Recovery
- User forgot they had an account
- Tries to signup → Gets "email already exists" error
- Goes to login → Logs in → Completes profile if needed

## API Endpoints

### Create User Profile
```
POST /api/users
{
  "email": "user@example.com",
  "name": "John Doe",
  "slug": "johndoe",
  "marzApiKey": "optional",
  "marzApiSecret": "optional"
}
```

### Check User
```
GET /api/users?email=user@example.com
GET /api/users?slug=johndoe
GET /api/users?userId=uuid
```

## Error Handling

### Email Already Exists
- Signup page shows: "Email is already registered. Please login instead."
- User can click login link

### Slug Already Taken
- Shows: "Slug already exists. Please choose another."
- User must pick different slug

### Profile Not Found After Login
- Automatic redirect to `/complete-profile`
- User can complete setup

## Security Notes

1. **Email Verification**: Consider adding email verification before allowing profile completion
2. **Slug Uniqueness**: Enforced at API level
3. **Profile Completion**: Required before accessing dashboard features
4. **Firebase Auth**: Required for all protected routes

## Testing Scenarios

1. **New Signup**: Create account → Should go to dashboard
2. **Login Without Profile**: Login with existing Firebase Auth → Should go to complete-profile
3. **Login With Profile**: Login with complete account → Should go to dashboard
4. **Dashboard Without Profile**: Direct access → Should redirect to complete-profile
