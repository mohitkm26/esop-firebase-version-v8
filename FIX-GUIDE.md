# Critical Configuration — Read Before Deploying

## 1. Firebase Storage Rules (REQUIRED for PDF uploads)

In Firebase Console → Storage → Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 2. Firebase Firestore Rules

In Firebase Console → Firestore → Rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3. Google Auth Domain (REQUIRED)

In Firebase Console → Authentication → Settings → Authorized domains:
Add your production domain (e.g. `esop-manager.web.app` is added automatically, add `app.hamoroni.com` if using custom domain).

## 4. Custom Domain (hamoroni.com)

Firebase Console → Hosting → Add custom domain → Enter `app.hamoroni.com`
Add the TXT and A records shown to your DNS.

## 5. Email (Resend) Setup

- Sign up at resend.com
- Add domain: hamoroni.com
- Create API key
- Add to .env.local: `NEXT_PUBLIC_RESEND_API_KEY=re_xxxx`
- Set HR email in Settings → Company tab

## 6. Plan Upgrade (Admin)

Go to Users page → Plan Management → Click Advanced.
Takes effect immediately on page refresh.

## 7. What Got Fixed in v6

1. **Buffering everywhere** — Fixed broken spinner JSX in all pages
2. **Employee detail buffering** — Switched from fetching ALL vesting events to only employee's events
3. **Grant creation buffering** — Added `!profile` check to loading guard
4. **New employee buffering** — Same fix
5. **Vesting lapse logic** — Exit date correctly marks future vests as lapsed (XIN092 etc.)
6. **ESOP Cost FV locking** — Cost is now locked at grant-date FV, not current FV (IndAS 102 compliant)
7. **ESOP Cost download** — Full year-wise CSV with all FYs
8. **Email letter visibility** — Shows plan upgrade message if not on Pro
9. **User management** — Invite by email, deactivate, role change all working
10. **Invitation-only** — Strict: only invitees + employees with registered email can sign in
11. **Employee portal** — Full grant details, vested/lapsed/pending, next vesting, current value, letters
12. **Onboarding flow** — Company setup + plan selection for new signups
13. **UAT references removed** — Cleaned from package.json, SETUP.md, and settings
14. **PDF letter upload error handling** — Now shows helpful error if Storage rules are wrong
