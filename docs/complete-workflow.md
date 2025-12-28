# Complete Workflow: From GCP to Play Store

## Overview

This guide walks you through the **complete workflow** from creating a Google Cloud project to publishing your app to the Play Store.

## Prerequisites

- Gmail account
- Android app code (Flutter, React Native, native Android, etc.)
- Built AAB or APK file

---

## Step-by-Step Workflow

### Phase 1: Google Cloud & Firebase Setup

#### 1. Authenticate
```bash
./release-the-hounds.sh auth
```
**What it does**: Authenticates you with Google Cloud using `gcloud auth login`

**Output**: You'll see a browser window to sign in with your Gmail account

---

#### 2. Create Google Cloud Project
```bash
./release-the-hounds.sh create-project --name "My App Name"
```

**What it does**:
- Creates a new Google Cloud project
- Enables required APIs (IAM, Resource Manager, Firebase, Android Publisher)
- Creates a service account
- Downloads service account key
- Grants IAM roles

**Output**:
- Project ID: `autoapp-1234567890-xxxxx`
- Service account key saved to `.autopublish/service-accounts/`
- State saved to `.autopublish/state.json`

---

#### 3. Setup Firebase
```bash
./release-the-hounds.sh setup-firebase \
  --android-package com.ivanmorgillo.pushuptracker \
  --android-name "Pushup Tracker"
```

**What it does**:
- Creates or links Firebase project
- Registers Android app (and iOS if needed)
- Downloads `google-services.json` to current directory

**Output**:
- Firebase project linked
- `google-services.json` downloaded to `./google-services-com-ivanmorgillo-pushuptracker.json`
- Android app registered in Firebase

**Important**: Note the package name (`com.ivanmorgillo.pushuptracker`) - you'll need it for the Play Store config!

---

### Phase 2: Prepare Your App

#### 4. Add Firebase Config to Your App

Copy the downloaded `google-services.json` to your Android app:

**Flutter:**
```bash
cp google-services-com-ivanmorgillo-pushuptracker.json android/app/google-services.json
```

**React Native:**
```bash
cp google-services-com-ivanmorgillo-pushuptracker.json android/app/google-services.json
```

**Native Android:**
```bash
cp google-services-com-ivanmorgillo-pushuptracker.json app/google-services.json
```

---

#### 5. Build Your App

**Flutter:**
```bash
flutter build appbundle
# Output: build/app/outputs/bundle/release/app-release.aab
```

**React Native:**
```bash
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**Native Android:**
```bash
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

**Note the path** - you'll need it for the config file!

---

### Phase 3: Play Store Configuration

#### 6. Create Play Store Config File

**Location**: Create `play-store-config.json` in your **project root** (same directory as `package.json`)

```bash
cd /home/ivan/code/release_the_hounds  # or your project root
cp play-store-config.example.json play-store-config.json
```

**File structure**:
```
your-project/
├── package.json
├── play-store-config.json          ← HERE (project root)
├── android/
│   └── app/
│       └── build/
│           └── outputs/
│               └── bundle/
│                   └── release/
│                       └── app-release.aab
└── screenshots/
    └── android/
        ├── phone/
        │   ├── screenshot1.png
        │   └── screenshot2.png
        └── tablet/
            └── ...
```

---

#### 7. Fill in the Config File

Edit `play-store-config.json`:

```json
{
  "packageName": "com.ivanmorgillo.pushuptracker",  // ← Must match Firebase!
  "build": {
    "aab": "./android/app/build/outputs/bundle/release/app-release.aab",  // ← Path to your AAB
    "apk": null
  },
  "metadata": {
    "title": "Pushup Tracker",
    "shortDescription": "Track your daily pushups and build strength",
    "fullDescription": "Pushup Tracker helps you build a consistent pushup routine. Track your daily progress, set goals, and watch your strength improve over time.\n\nFeatures:\n- Daily pushup tracking\n- Progress charts\n- Goal setting\n- Reminders",
    "category": "APPLICATION_HEALTH_AND_FITNESS",
    "privacyPolicyUrl": "https://yourwebsite.com/privacy"
  },
  "graphics": {
    "screenshotsDir": "./screenshots/android",  // ← Where your screenshots are
    "icon": "./assets/icon-512.png",  // Optional
    "featureGraphic": "./assets/feature-graphic-1024x500.png"  // Optional
  },
  "contentRating": {
    "isFinancialApp": false,
    "isHealthApp": true,  // ← Your app is a health app!
    "isGamblingApp": false,
    "targetAgeGroup": "EVERYONE",
    "containsViolence": false,
    "containsSexualContent": false,
    "containsDrugs": false,
    "dataSafety": {
      "collectsPersonalData": true,
      "sharesPersonalData": false,
      "collectsLocation": false
    }
  },
  "distribution": {
    "track": "internal",  // Start with internal testing
    "pricing": {
      "free": true
    },
    "countries": "all"
  }
}
```

**Key fields**:
- `packageName`: Must match your Firebase Android app package name
- `build.aab`: Path to your AAB file (relative to project root)
- `metadata.title`: App name (max 50 chars)
- `metadata.shortDescription`: Short description (max 80 chars)
- `metadata.fullDescription`: Full description (max 4000 chars)
- `metadata.category`: See valid categories below
- `graphics.screenshotsDir`: Where screenshots are stored
- `distribution.track`: `internal`, `alpha`, `beta`, or `production`

---

#### 8. Prepare Screenshots

Create screenshot directory structure:

```bash
mkdir -p screenshots/android/phone
mkdir -p screenshots/android/tablet
```

**Screenshot requirements**:
- **Phone**: At least 2 screenshots (up to 8)
- **Tablet (7-inch)**: Optional
- **Tablet (10-inch)**: Optional
- **TV**: Optional
- **Wear**: Optional

**Formats**: PNG or JPG

**Example**:
```
screenshots/
└── android/
    ├── phone/
    │   ├── screenshot1.png
    │   ├── screenshot2.png
    │   └── screenshot3.png
    └── tablet/
        └── screenshot1.png
```

---

### Phase 4: Grant Play Console Access

#### 9. Grant Service Account Access (One-Time Manual Step)

**⚠️ Important**: Play Console permissions cannot be granted automatically via API. This is a Google security limitation. However, Release The Hounds can guide you through the process.

**Get service account email and open Play Console**:
```bash
./release-the-hounds.sh grant-play-console-access --open
```

This will:
- Display your service account email (ready to copy)
- Show required permissions
- **Automatically open Play Console permissions page in your browser**

**Then manually grant access**:
1. In the opened Play Console page, click **"Invite new users"**
2. Paste the service account email from the terminal
3. Select **Admin** or **Release** permissions
4. Click **Invite**

**Why manual?**: Google Play Console doesn't provide an API endpoint for granting user permissions. This is a security measure by Google. Release The Hounds helps by opening the right page and showing you exactly what to do.

---

### Phase 5: First Build Upload (Manual - One-Time)

**⚠️ Important**: The first build upload must be done manually through Play Console UI. This is a Google Play Store API limitation - draft apps aren't "active" for API access until the first build is uploaded via the UI.

#### 10. Build Your App Locally

```bash
# Flutter
flutter build appbundle

# Or React Native / Native Android
cd android && ./gradlew bundleRelease
```

Your AAB will be at: `build/app/outputs/bundle/release/app-release.aab` (Flutter) or `android/app/build/outputs/bundle/release/app-release.aab` (React Native)

#### 11. Upload First Build Manually in Play Console

1. Go to [Play Console](https://play.google.com/console)
2. Select your app
3. Go to **"Release"** → **"Internal testing"** → **"Create new release"**
4. Upload your AAB file (`app-release.aab`)
5. Click **"Save"** (you don't need to publish yet)

**Why manual?**: The Play Store API doesn't allow creating edit sessions for draft apps. Uploading the first build through the UI "activates" the app for API access. After this one-time step, CI/CD can handle all future uploads automatically.

---

### Phase 6: Configure Metadata (After First Upload)

#### 12. Generate Play Store Config

```bash
./release-the-hounds.sh generate-play-store-config
```

#### 13. Edit Config File

Edit `play-store-config.json` with your app details (title, descriptions, screenshots, etc.)

#### 14. Publish Metadata

```bash
./release-the-hounds.sh publish-play-store
```

**What it does** (metadata only - builds are handled by CI/CD):
1. ✅ Verifies Play Console access
2. ✅ Checks if app exists
3. ✅ Sets metadata (title, descriptions, category)
4. ✅ Sets content rating (answers questionnaires)
5. ✅ Uploads screenshots
6. ✅ Uploads icon & feature graphic (if provided)
7. ✅ Sets pricing (free/paid)
8. ✅ Sets distribution countries
9. ✅ Validates edit
10. ✅ Commits edit (publishes metadata!)

**Note**: This command only updates metadata/configuration. Build uploads are handled by your CI/CD pipeline (GitHub Actions, etc.).

**Output**:
```
📝 Updating Play Store metadata and configuration...
   Package: com.ivanmorgillo.pushuptracker

💡 Note: Build uploads are handled by CI/CD. This command only updates metadata.

📋 Step 1: Verifying Play Console access...
   ✅ Access verified

📋 Step 2: Checking Play Store app...
   ✅ App already exists in Play Console

📋 Step 3: Creating edit session...
   ✅ Edit session created: abc123

📋 Step 4: Setting metadata...
   ✅ Listing metadata updated

📋 Step 4: Setting metadata...
   ✅ Listing metadata updated

📋 Step 5: Setting content rating...
   ✅ Content rating set

📋 Step 6: Uploading screenshots...
   ✅ All 3 screenshots uploaded

📋 Step 7: Uploading app icon...
   ✅ App icon uploaded

📋 Step 10: Setting release track...
   ✅ Version 1 added to internal track

📋 Step 12: Validating edit...
   ✅ Edit validated successfully

📋 Step 13: Committing edit...
   ✅ Edit committed successfully

✅ App published successfully to Play Store!
   Track: internal
   Version: 1
   Package: com.ivanmorgillo.pushuptracker

💡 Next steps:
   - Review the app in Play Console
   - Complete any remaining manual steps (if any)
   - Submit for review (if publishing to production)
```

---

## File Locations Summary

```
your-project-root/
├── play-store-config.json          ← CREATE THIS (copy from example)
├── .autopublish/                   ← Auto-generated (gitignored)
│   ├── state.json                  ← Project state
│   └── service-accounts/          ← Service account keys
├── android/app/build/outputs/      ← Your built AAB/APK
│   └── bundle/release/
│       └── app-release.aab
└── screenshots/                    ← CREATE THIS
    └── android/
        ├── phone/
        │   └── screenshot1.png
        └── tablet/
            └── screenshot1.png
```

---

## Valid Categories

Use these exact values for `metadata.category`:

**Apps**:
- `APPLICATION_PRODUCTIVITY`
- `APPLICATION_GAME`
- `APPLICATION_FINANCE`
- `APPLICATION_MEDICAL`
- `APPLICATION_HEALTH_AND_FITNESS`
- `APPLICATION_LIFESTYLE`
- `APPLICATION_MUSIC_AND_AUDIO`
- `APPLICATION_PHOTOGRAPHY`
- `APPLICATION_SOCIAL`
- `APPLICATION_SPORTS`
- `APPLICATION_TOOLS`
- `APPLICATION_TRAVEL_AND_LOCAL`
- `APPLICATION_VIDEO_PLAYERS`
- `APPLICATION_WEATHER`
- `APPLICATION_NEWS_AND_MAGAZINES`
- `APPLICATION_BOOKS_AND_REFERENCE`
- `APPLICATION_BUSINESS`
- `APPLICATION_COMMUNICATION`
- `APPLICATION_EDUCATION`
- `APPLICATION_ENTERTAINMENT`
- `APPLICATION_SHOPPING`

**Games**:
- `GAME_ACTION`
- `GAME_ADVENTURE`
- `GAME_ARCADE`
- `GAME_BOARD`
- `GAME_CARD`
- `GAME_CASINO`
- `GAME_CASUAL`
- `GAME_EDUCATIONAL`
- `GAME_MUSIC`
- `GAME_PUZZLE`
- `GAME_RACING`
- `GAME_ROLE_PLAYING`
- `GAME_SIMULATION`
- `GAME_SPORTS`
- `GAME_STRATEGY`
- `GAME_TRIVIA`
- `GAME_WORD`

---

## Quick Reference

**Config file location**: Project root (`play-store-config.json`)

**When to create**: After Firebase setup, before first publish

**Required fields**:
- `packageName` (must match Firebase)
- `build.aab` or `build.apk`
- `metadata.title`
- `metadata.shortDescription`
- `metadata.fullDescription`
- `metadata.category`
- `metadata.privacyPolicyUrl`

**Optional fields**:
- `graphics.icon`
- `graphics.featureGraphic`
- `graphics.screenshotsDir` (if you have screenshots)

---

## Troubleshooting

### "Config file not found"
**Solution**: Create `play-store-config.json` in project root:
```bash
cp play-store-config.example.json play-store-config.json
```

### "Build file not found"
**Solution**: Check path in config file. Use relative path from project root:
```json
"aab": "./android/app/build/outputs/bundle/release/app-release.aab"
```

### "Package name mismatch"
**Solution**: Ensure package name matches in:
1. Android app code (`build.gradle` / `pubspec.yaml`)
2. Firebase Android app (from `setup-firebase`)
3. Play Store config file

### "Permission denied"
**Solution**: Grant service account access in Play Console → Settings → Users & Permissions

---

## Next Steps After Publishing

1. **Review in Play Console**: Check that everything looks correct
2. **Test Internal Track**: Add testers and test the app
3. **Promote to Alpha/Beta**: When ready, change track in config and republish
4. **Submit for Production**: When ready for public release

---

## Example: Complete First-Time Setup

```bash
# 1. Authenticate
./release-the-hounds.sh auth

# 2. Create GCP project
./release-the-hounds.sh create-project --name "Pushup Tracker"

# 3. Setup Firebase
./release-the-hounds.sh setup-firebase \
  --android-package com.ivanmorgillo.pushuptracker \
  --android-name "Pushup Tracker"

# 4. Copy Firebase config to app
cp google-services-com-ivanmorgillo-pushuptracker.json android/app/google-services.json

# 5. Build app
flutter build appbundle

# 6. Create Play Store config
cp play-store-config.example.json play-store-config.json
# Edit play-store-config.json with your details

# 7. Prepare screenshots
mkdir -p screenshots/android/phone
# Add screenshots to screenshots/android/phone/

# 8. Grant Play Console access (manual step)
# Go to Play Console → Settings → Users & Permissions
# Add service account email

# 9. Publish!
./release-the-hounds.sh publish-play-store
```

That's it! 🎉

