# ESOP Manager V8 — Setup Guide

## Quick Start

### Prerequisites
- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with Firestore, Auth, Storage, Hosting enabled

### 1. Configure Firebase credentials
Fill in `.env.local` with your Firebase project keys:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### 2. Enable Firebase Auth methods
In Firebase Console → Authentication → Sign-in method:
- Enable **Google**
- Enable **Email/Password**

### 3. Install and build
```bash
npm install
npm run build
```

### 4. Deploy
```bash
firebase login
firebase use --add
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

### 5. First Login
Visit your hosted URL → Sign in → You become superAdmin automatically.

---

## Architecture

Multi-tenant Firestore structure:
```
companies/{companyId}
companies/{companyId}/employees
companies/{companyId}/grants
companies/{companyId}/vestingEvents
companies/{companyId}/exercises
companies/{companyId}/valuations
companies/{companyId}/auditLogs
companies/{companyId}/notifications
companies/{companyId}/tickets

users/{uid}        ← global user profiles
invites/{id}       ← pending invites
contact_requests/  ← public contact form submissions
```

## Roles
superAdmin → companyAdmin → financeAdmin / hrAdmin / editor / employee / auditor / support

## Bug Fixes in V8
1. Grant numbers: G-2026-001 format (no scientific notation)
2. Exercise validation: Cannot exceed vested shares
3. Employee exit: Cannot grant to exited employees
4. True subcollection multi-tenancy
5. Public landing page at /
6. Upload CSV includes exercise_price
7. Grant edit lock until accepted
8. Dual-role user routing (employee + editor sees both views)
