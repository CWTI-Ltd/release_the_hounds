# LLM Context: Release The Hounds

## Project Overview

**Project Name**: `release-the-hounds`

**Purpose**: Fully automated mobile app publishing pipeline that takes a Gmail account and automatically creates Google Cloud projects, Firebase projects, and publishes apps to Google Play Store and iOS App Store - with **zero manual steps** in Google Cloud Console, Play Console, or App Store Connect.

**Core Principle**: Start with nothing (just a Gmail account), end with published apps. The tool automates the entire lifecycle from authentication to app publication.

## Implementation Status Update (December 2025)

### 🛠️ Unified MCP Server (New)
- **Purpose**: Unified the `release-the-hounds` publishing pipeline with `android-mcp` (ADB automation) into a single Model Context Protocol (MCP) server.
- **Capabilities**:
  - **ADB Automation**: Tap, screenshot, UI dump, and device selection.
  - **Play Store Reviews**:
    - `playStore_listUnrepliedReviews`: Recent (7-day) unreplied reviews.
    - `playStore_searchAllHistory`: Autonomous cross-report search for unreplied feedback (bypasses 7-day limit).
    - `playStore_batchReply`: Automated posting of empathetic responses in bulk.
    - `playStore_checkStorageAccess`: Verification tool for the required account-level permissions.
  - **State Persistence**: Remembers active project and app-specific settings (like `bucketId`) across sessions via `.autopublish/state.json`.

### ✅ Completed (Phase 1, 2 & 3 - Foundation + Firebase + Play Store + MCP)

1. **OAuth2 Authentication via gcloud CLI**
   - Uses `gcloud auth login` and `gcloud auth application-default login` for fully automated authentication
   - **Key Decision**: We use gcloud CLI instead of manual OAuth2 client credentials setup because:
     - No manual Google Cloud Console navigation required
     - No OAuth2 client ID/secret configuration needed
     - True automation - just run `./release-the-hounds.sh auth`
   - Authentication status checking implemented
   - Application Default Credentials (ADC) setup automated

2. **Single Entry Point Script**
   - `./release-the-hounds.sh` - Main entry point for all operations
   - Automatically checks dependencies (Node.js, npm, gcloud CLI)
   - Commands: `check-deps`, `auth`, `status`, `create-project`, `list-projects`, `setup-firebase`, `generate-play-store-config`, `publish-play-store`.

3. **GCP Project Creation Module** (`src/gcp/project.js`)
   - Handles project creation via Cloud Resource Manager API.
   - Saves project state to `.autopublish/state.json`.
   - Supports switching projects: `switchProject()` function.

4. **API Enabling Module** (`src/gcp/apis.js`)
   - Enables required Google APIs: `iam`, `cloudresourcemanager`, `firebase`, `androidpublisher`, `serviceusage`.

5. **Service Account & IAM Module** (`src/gcp/service-account.js`, `src/gcp/iam.js`)
   - Creates service account programmatically.
   - Grants required IAM roles automatically (`roles/editor`, `roles/firebase.admin`).
   - **Important**: Play Console permissions must be granted manually in Play Console.

6. **Firebase Project Setup Module** (`src/firebase/project.js`)
   - Interactive project picker and app registration.
   - Downloads `google-services.json` and `GoogleService-Info.plist` automatically.

7. **Play Store Publishing Module** (`src/play-store/`)
   - **Authentication** (`auth.js`): Service account auth with Android Publisher API.
   - **Reviews** (`reviews.js`): List, get, reply, and autonomous historical search via Cloud Storage CSVs.
   - **Edit Sessions** (`edits.js`): Manage Play Console edit sessions.
   - **Metadata & Graphics**: Set app listing metadata, screenshots, icon, and feature graphics.

## Technology Stack

- **Runtime**: Node.js (ES modules)
- **MCP Framework**: `@modelcontextprotocol/sdk`
- **Google APIs**: `googleapis` npm package
- **ADB**: `@devicefarmer/adbkit`
- **CSV Parsing**: `csv-parse`
- **Authentication**: gcloud CLI (Application Default Credentials)
- **State Management**: JSON files in `.autopublish/` (gitignored)

## Key Design Decisions

### 1. Authentication Strategy
- **Why gcloud CLI?**: Bypasses the need for manual OAuth2 client creation. 
- **Application Default Credentials**: Used by Google API libraries for seamless auth.

### 2. State Management
- Stored in `.autopublish/state.json`.
- `appConfigs` stores package-specific settings like `bucketId` for historical reviews.

### 3. Historical Review Workaround
- **Google Play API Limit**: Standard API only returns reviews from the last 7 days.
- **Solution**: MCP accesses historical monthly CSV reports from the Google Cloud Storage bucket (`pubsite_prod_rev_...`). This requires the "Bulk reports" account-level permission in Play Console.

## Important Commands Reference

```bash
# Check dependencies
./release-the-hounds.sh check-deps

# Authenticate (one-time)
./release-the-hounds.sh auth

# Create Project (full pipeline)
./release-the-hounds.sh create-project --name "My App"

# Setup Firebase
./release-the-hounds.sh setup-firebase

# Publish to Play Store
./release-the-hounds.sh publish-play-store
```

**Last Updated**: December 2025, after unifying MCP server and adding autonomous review search.
