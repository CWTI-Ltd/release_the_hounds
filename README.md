# Release The Hounds

Automated mobile app publishing pipeline for Google Play Store and iOS App Store.

## Overview

This tool automates the entire process of publishing mobile apps, starting from just a Gmail account. It handles:

- OAuth2 authentication with Google
- Google Cloud project creation
- Firebase project setup
- Android/iOS app registration
- Play Store publishing
- App Store publishing (future)

## Installation

### Local Installation

```bash
npm install
```

### Global Installation (Recommended)

Install globally to use `release-the-hounds` from any directory:

```bash
# Clone the repository
git clone https://github.com/hamen/release-the-hounds.git
cd release-the-hounds

# Install dependencies
npm install

# Link globally (creates symlink, so updates are automatic)
npm link
```

After linking, you can use `release-the-hounds` from any directory:

```bash
# From your app directory
cd /path/to/your/app
release-the-hounds status
release-the-hounds generate-play-store-config
release-the-hounds publish-play-store
```

**Benefits of global installation:**
- ✅ Use from any directory
- ✅ Always uses latest source code (symlinked, not copied)
- ✅ Updates automatically when you change the source
- ✅ No need to `cd` to the release-the-hounds directory

**Note**: If you update the source code, run `npm install` in the release-the-hounds directory if new dependencies are added.

## Quick Start

### Single Command Entry Point

Just run the script:

```bash
./release-the-hounds.sh
```

This will:
- ✅ Check all dependencies (Node.js, npm, gcloud CLI)
- ✅ Show available commands
- ✅ Auto-install npm dependencies if needed

### Complete Workflow: First-Time Setup

Follow these steps **in order** to set up your publishing pipeline:

#### Phase 1: Initial Setup

1. **Check dependencies:**
   ```bash
   ./release-the-hounds.sh check-deps
   ```
   Verifies Node.js, npm, and gcloud CLI are installed.

2. **Authenticate with Google:**
   ```bash
   ./release-the-hounds.sh auth
   ```
   Opens browser for Google sign-in and sets up Application Default Credentials.

3. **Create GCP project:**
   ```bash
   ./release-the-hounds.sh create-project --name "My App"
   ```
   This automatically:
   - Creates Google Cloud project
   - Enables required APIs
   - Creates service account
   - Downloads service account key
   - Grants IAM roles

4. **Setup Firebase:**
   ```bash
   ./release-the-hounds.sh setup-firebase \
     --android-package com.example.app \
     --android-name "My App"
   ```
   Creates/links Firebase project and registers your Android app.

#### Phase 2: CI/CD Setup (Required Before First Build)

**⚠️ Important**: You **must** complete this phase before your first CI/CD build, otherwise uploads will fail.

5. **Export service account for CI/CD:**
   ```bash
   ./release-the-hounds.sh export-service-account
   ```
   This displays the service account JSON key needed for GitHub Actions.

6. **Add service account to GitHub Secrets:**
   - Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
   - Click **"New repository secret"**
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: Paste the **entire JSON** from step 5 (copy everything from `{` to `}`)
   - Click **"Add secret"**

7. **Grant Play Console permissions** (one-time manual step):
   
   **⚠️ Important**: Play Console permissions cannot be granted automatically via API. This is a Google limitation.
   
   However, Release The Hounds can guide you through the process:
   ```bash
   ./release-the-hounds.sh grant-play-console-access --open
   ```
   This will:
   - Display your service account email (ready to copy)
   - Show required permissions
   - **Automatically open Play Console permissions page in your browser**
   - Then you manually add the service account email and grant permissions
   
   **Steps:**
   1. Run the command above (it opens the page for you)
   2. Copy the service account email shown in the terminal
   3. In the opened Play Console page, click **"Invite new users"**
   4. Paste the service account email
   5. Grant permissions: **"View app information"** and **"Manage production releases"** (or **"Admin"** for all permissions)
   6. Click **"Invite"**
   
   **Why manual?**: Google Play Console doesn't provide an API endpoint for granting user permissions. This is a security measure by Google.

#### Phase 3: Create Play Store App (One-Time Manual Step)

8. **Create app in Play Console:**
   - Go to https://play.google.com/console
   - Click "Create app"
   - Enter app name, select language, app type, and pricing
   - Enter package name: `com.example.app` (must match Firebase!)
   - Click "Create app"

   **Note**: This is a one-time manual step. The Play Store API doesn't support creating apps programmatically.

#### Phase 4: First Build Upload (Manual - One-Time)

**⚠️ Important**: The first build upload must be done manually through Play Console UI. This is a Google Play Store API limitation - draft apps aren't "active" for API access until the first build is uploaded via the UI.

9. **Build your app locally:**
   ```bash
   # Flutter
   flutter build appbundle
   
   # Or React Native / Native Android
   cd android && ./gradlew bundleRelease
   ```
   Your AAB will be at: `build/app/outputs/bundle/release/app-release.aab` (Flutter) or `android/app/build/outputs/bundle/release/app-release.aab` (React Native)

10. **Upload first build manually in Play Console:**
    - Go to [Play Console](https://play.google.com/console)
    - Select your app
    - Go to **"Release"** → **"Internal testing"** → **"Create new release"**
    - Upload your AAB file (`app-release.aab`)
    - Click **"Save"** (you don't need to publish yet)
    
    **Why manual?**: The Play Store API doesn't allow creating edit sessions for draft apps. Uploading the first build through the UI "activates" the app for API access. After this one-time step, CI/CD can handle all future uploads automatically.

#### Phase 5: CI/CD Setup (After First Manual Upload)

11. **Update GitHub Actions workflow:**
    In your `.github/workflows/` YAML file:
    ```yaml
    - name: Upload to Google Play - Internal track
      uses: r0adkll/upload-google-play@v1.0.15
      with:
        serviceAccountJsonPlainText: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
        packageName: com.example.app  # Your package name
        releaseFiles: app-release.aab
        track: internal
    ```

12. **Push and let CI/CD upload:**
    ```bash
    git push
    ```
    Your CI/CD will upload all future builds automatically! 🎉

#### Phase 6: Configure Metadata (After First Upload)

13. **Generate Play Store config:**
    ```bash
    ./release-the-hounds.sh generate-play-store-config
    ```
    Creates `play-store-config.json` pre-filled with your Firebase app details.

14. **Edit config file:**
    Edit `play-store-config.json` with:
    - App title and descriptions
    - Category (e.g., `APPLICATION_HEALTH_AND_FITNESS`)
    - Privacy policy URL
    - Content rating answers
    - Screenshots directory path
    - App icon and feature graphic paths

15. **Add screenshots and graphics:**
    - Create `screenshots/android/phone/` directory
    - Add screenshot files
    - Add app icon (512x512px) and feature graphic (1024x500px)

16. **Publish metadata:**
    ```bash
    ./release-the-hounds.sh publish-play-store
    ```
    This updates the app with metadata, screenshots, and graphics that CAN be automated.
    
    **⚠️ Important API Limitations:**
    
    The Google Play Developer API has significant limitations. This tool automates what it CAN, but many fields require manual entry:
    
    **✅ CAN be automated:**
    - App title
    - Short description
    - Full description
    - Screenshots (phone, tablet, etc.)
    - App icon
    - Feature graphic
    - Distribution countries
    
    **❌ CANNOT be automated (must set manually in Play Console):**
    - Privacy policy URL
    - App category
    - Content rating questionnaires
    - Data safety form
    - Pricing (for paid apps)
    
    **Why?** Google's API doesn't support these fields programmatically. This is a known limitation of the Play Store API.
    
    **Note:** This command only updates metadata/configuration. Build uploads are handled by your CI/CD pipeline (GitHub Actions, etc.).

### Quick Reference: Command Order

```bash
# 1. Setup (one-time)
./release-the-hounds.sh auth
./release-the-hounds.sh create-project --name "My App"
./release-the-hounds.sh setup-firebase --android-package com.example.app

# 2. CI/CD Setup (required before first build!)
./release-the-hounds.sh export-service-account
# → Add JSON to GitHub Secrets
./release-the-hounds.sh grant-play-console-access --open
# → Tool opens Play Console page, you manually grant permissions (Google limitation)

# 3. Create app manually in Play Console (one-time)
# → Go to https://play.google.com/console
# → Create app with your package name

# 4. First build (manual - one-time requirement)
# → Build app locally: flutter build appbundle
# → Upload manually in Play Console UI (Google API limitation)
# → After this, CI/CD handles all future uploads automatically

# 5. Configure metadata (after first upload)
./release-the-hounds.sh generate-play-store-config
# → Edit play-store-config.json with descriptions, screenshots, etc.
./release-the-hounds.sh publish-play-store  # Updates metadata only
```

### Available Commands

- `./release-the-hounds.sh check-deps` - Check if all dependencies are installed
- `./release-the-hounds.sh auth` - Authenticate with Google (uses gcloud CLI)
- `./release-the-hounds.sh status` - Check authentication status
- `./release-the-hounds.sh create-project --name "My App"` - Create GCP project (with APIs, service account, IAM roles)
- `./release-the-hounds.sh list-projects` - List all accessible projects
- `./release-the-hounds.sh setup-service-account` - Setup service account for existing project
- `./release-the-hounds.sh export-service-account` - Export service account key for CI/CD (GitHub Actions)
- `./release-the-hounds.sh grant-play-console-access` - Get service account email and instructions for granting Play Console permissions
- `./release-the-hounds.sh grant-play-console-access --open` - Same as above, but opens Play Console permissions page in browser
- `./release-the-hounds.sh enable-apis` - Enable required Google Cloud APIs (use if you get API not enabled errors)
- `./release-the-hounds.sh enable-apis --api androidpublisher.googleapis.com` - Enable specific API
- `./release-the-hounds.sh setup-firebase` - Setup Firebase project and apps (interactive)
- `./release-the-hounds.sh setup-firebase --android-package "com.example.app" --ios-bundle "com.example.app"` - Setup with specific apps
- `./release-the-hounds.sh generate-play-store-config` - Generate Play Store config template (pre-filled with Firebase data)
- `./release-the-hounds.sh publish-play-store` - Update Play Store metadata and configuration (builds are uploaded via CI/CD)

## Authentication

This tool uses **gcloud CLI** for authentication, which means:
- ✅ **No manual OAuth2 setup required** - gcloud handles it automatically
- ✅ **No client credentials needed** - Application Default Credentials are used
- ✅ **Fully automated** - just run `./release-the-hounds.sh auth`

### Requirements

- **gcloud CLI** must be installed:
  - Linux: `sudo snap install google-cloud-cli --classic`
  - macOS: `brew install google-cloud-sdk`
  - Or visit: https://cloud.google.com/sdk/docs/install

The script will check for gcloud automatically and provide installation instructions if missing.

## Project Structure

```
release_the_hounds/
├── src/
│   ├── auth/          # Authentication (gcloud CLI)
│   ├── gcp/           # GCP project, APIs, service accounts, IAM
│   ├── firebase/      # Firebase project and app management
│   ├── play-store/    # Play Store publishing automation
│   ├── utils/         # Utility functions
│   └── cli.js         # CLI entry point
├── .autopublish/      # Secrets and state (gitignored)
│   ├── service-accounts/  # Service account keys
│   └── firebase-config/   # Firebase config files
├── docs/              # Documentation
└── package.json
```

## Development

```bash
# Run CLI
npm start <command>

# Example: Authenticate
npm start auth

# Example: Check status
npm start status
```

## CI/CD Integration

### GitHub Actions Setup

After completing Phase 2 (CI/CD Setup) above, your GitHub Actions workflow can upload to Play Store:

```yaml
- name: Upload to Google Play - Internal track
  uses: r0adkll/upload-google-play@v1.0.15
  with:
    serviceAccountJsonPlainText: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
    packageName: com.example.app
    releaseFiles: app-release.aab
    track: internal
```

### Common CI/CD Issues

**Error: "No service account json key provided!"**
- **Solution**: Ensure you've completed Phase 2 steps 5-6:
  1. Run `./release-the-hounds.sh export-service-account`
  2. Copy the entire JSON output
  3. Add it to GitHub Secrets as `GOOGLE_SERVICE_ACCOUNT_JSON`
  4. Make sure the secret name matches exactly in your workflow

**Error: "Permission denied" or "403 Forbidden"**
- **Solution**: Grant Play Console permissions (Phase 2, step 7):
  1. Go to Play Console → Settings → Users & Permissions
  2. Add the service account email
  3. Grant "View app information" and "Manage production releases" permissions

**Error: "App not found" or "Package not found"**
- **Solution**: The first build must be uploaded manually through Play Console UI:
  1. Build your app locally: `flutter build appbundle`
  2. Go to Play Console → Your app → Release → Internal testing → Create new release
  3. Upload your AAB file manually
  4. After this one-time manual upload, CI/CD can handle all future uploads
  
  **Why?**: Google Play Store API limitation - draft apps aren't "active" until first build is uploaded via UI.

**Error: "Google Play Android Developer API has not been used in project X before or it is disabled"**
- **Solution**: Enable the Android Publisher API:
  ```bash
  # Enable for current project
  ./release-the-hounds.sh enable-apis --api androidpublisher.googleapis.com
  
  # Or enable for specific project (if different)
  ./release-the-hounds.sh enable-apis --project-id YOUR_PROJECT_ID --api androidpublisher.googleapis.com
  ```
  **Note**: API enablement may take 2-3 minutes to propagate. Wait a few minutes after enabling before retrying.

**Error: "Package not found: com.example.app"**
- **Solution**: The app doesn't exist in Play Console yet. You must create it manually:
  1. Go to https://play.google.com/console
  2. Click "Create app"
  3. Enter app details and package name
  4. After creating, CI/CD will be able to upload builds
  **Note**: The Play Store API doesn't support creating apps programmatically. This is a one-time manual step.

## API Limitations & What Can't Be Automated

**⚠️ CRITICAL LIMITATION: First Submission Cannot Be Fully Automated**

Google Play Store has a fundamental catch-22 for first submissions:
- **Metadata edits cannot be committed** until you submit for review
- **You cannot submit for review** without manually filling in the store listing fields in the UI
- Even though metadata IS saved via API, Play Console UI requires manual entry to enable the "Send for review" button

**What this means:**
- ✅ Metadata IS saved via API and WILL be applied when you submit
- ❌ But you still need to manually enter it in Play Console UI to enable submission
- ❌ This is a Google Play API design limitation, not a bug in this tool

**After first submission:** Once your app is reviewed and published, future metadata updates CAN be fully automated.

### What CAN Be Automated ✅

- **App title** - Set via `edits.listings.update()` (saved, but requires manual UI entry for first submission)
- **Short description** - Set via `edits.listings.update()` (saved, but requires manual UI entry for first submission)
- **Full description** - Set via `edits.listings.update()` (saved, but requires manual UI entry for first submission)
- **Screenshots** - Upload via `edits.listings.images.upload()` (saved, but requires manual UI entry for first submission)
- **App icon** - Upload via `edits.listings.images.upload()` (saved, but requires manual UI entry for first submission)
- **Feature graphic** - Upload via `edits.listings.images.upload()` (saved, but requires manual UI entry for first submission)
- **Distribution countries** - Set via `edits.tracks.update()`

### What CANNOT Be Automated ❌

- **Privacy policy URL** - Must be set manually in Play Console → Store presence → Main store listing
- **App category** - Must be set manually in Play Console → Store presence → Main store listing
- **Content rating questionnaires** - Must be completed manually in Play Console → Policy → Content rating
- **Data safety form** - Must be completed manually in Play Console → Policy → Data safety
- **Pricing** - Must be set manually in Play Console → Pricing & distribution
- **First submission** - Requires manual entry in Play Console UI to enable "Send for review" button

**Why?** Google's API doesn't expose these endpoints, or they require complex CSV uploads/form submissions that aren't practical to automate. Additionally, Google Play intentionally requires manual intervention for first submissions.

### What This Means

This tool saves metadata via API (which WILL be applied on submission), but Google Play's UI still requires manual entry for first submissions. This is frustrating but unavoidable due to Google's API design.

**Workflow for first submission:**
1. Run `rth publish-play-store` to save metadata via API ✅
2. Manually enter the same metadata in Play Console UI (to enable "Send for review" button) ❌
3. Complete questionnaires manually ❌
4. Submit for review - your API-saved metadata will be applied ✅

**After first submission:** Future metadata updates can be fully automated without manual UI entry.
2. **Screenshots** can be a pain to upload one-by-one
3. **Graphics** (icon, feature graphic) are automated
4. **The metadata that IS saved** will be applied automatically when you submit for review

But yes, you'll still need to manually enter privacy policy URL, category, and complete questionnaires. This is a Google API limitation, not a limitation of this tool.

## Security

- All credentials are stored in `.autopublish/` directory (gitignored)
- Service account keys are never committed to git
- Use GitHub Secrets for CI/CD credentials (never hardcode!)
- Refresh tokens are stored locally and encrypted at rest (future enhancement)

## License

MIT

