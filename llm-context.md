# LLM Context: Release The Hounds

## Project Overview

**Project Name**: `release-the-hounds`

**Purpose**: Fully automated mobile app publishing pipeline that takes a Gmail account and automatically creates Google Cloud projects, Firebase projects, and publishes apps to Google Play Store and iOS App Store - with **zero manual steps** in Google Cloud Console, Play Console, or App Store Connect.

**Core Principle**: Start with nothing (just a Gmail account), end with published apps. The tool automates the entire lifecycle from authentication to app publication.

## Current Implementation Status

### ✅ Completed (Phase 1 & 2 - Foundation + Firebase)

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
   - Shows helpful error messages with installation instructions
   - Commands:
     - `./release-the-hounds.sh check-deps` - Verify all dependencies
     - `./release-the-hounds.sh auth` - Authenticate with Google
     - `./release-the-hounds.sh status` - Check authentication status
     - `./release-the-hounds.sh create-project` - Create GCP project (full pipeline)
     - `./release-the-hounds.sh list-projects` - List accessible projects
     - `./release-the-hounds.sh setup-service-account` - Setup service account for existing project
     - `./release-the-hounds.sh setup-firebase` - Setup Firebase project and apps
     - `./release-the-hounds.sh generate-play-store-config` - Generate Play Store config template
     - `./release-the-hounds.sh publish-play-store` - Publish app to Google Play Store

3. **GCP Project Creation Module** (`src/gcp/project.js`)
   - Handles project creation via Cloud Resource Manager API
   - Generates unique project IDs: `autoapp-{timestamp}-{random}`
   - Polls for project activation
   - Saves project state to `.autopublish/state.json`
   - Can switch between projects: `switchProject()` function

4. **API Enabling Module** (`src/gcp/apis.js`)
   - Enables required Google APIs programmatically
   - Required APIs:
     - `iam.googleapis.com`
     - `cloudresourcemanager.googleapis.com`
     - `firebase.googleapis.com`
     - `androidpublisher.googleapis.com`
     - `serviceusage.googleapis.com`
   - Handles API enablement polling

5. **Service Account & IAM Module** (`src/gcp/service-account.js`, `src/gcp/iam.js`)
   - Creates service account programmatically (`app-publisher@{projectId}.iam.gserviceaccount.com`)
   - Generates and downloads private key JSON
   - Stores keys in `.autopublish/service-accounts/service-account-{projectId}.json`
   - Grants required IAM roles automatically:
     - `roles/editor` - General project editor role
     - `roles/firebase.admin` - Firebase Admin role
   - **Important**: `roles/androidpublisher` is NOT granted via GCP IAM - Play Console permissions are managed directly in Play Console
   - Integrated into `create-project` command for full pipeline
   - Can also be run separately: `setup-service-account` command

6. **Firebase Project Setup Module** (`src/firebase/project.js`)
   - **Firebase Project Management**:
     - Lists all Firebase projects user has access to
     - Interactive project picker - can select existing Firebase project or create new
     - Handles Firebase ↔ GCP project 1:1 relationship correctly
     - Automatically switches GCP project state when selecting different Firebase project
     - Saves Firebase project state to avoid re-prompting
   - **App Management**:
     - Lists existing Android/iOS apps in Firebase project
     - Detects existing apps and reuses them (no duplicates)
     - Interactive prompts for package/bundle IDs if apps don't exist
     - Downloads config files for all existing apps automatically
   - **Config File Downloads**:
     - `google-services.json` → `.autopublish/firebase-config/google-services.json`
     - `GoogleService-Info.plist` → `.autopublish/firebase-config/GoogleService-Info.plist`
     - Multiple apps get unique filenames in same directory
   - **Key Features**:
     - Gracefully handles 404 errors (returns empty arrays instead of throwing)
     - Verifies Firebase project exists before listing apps
     - Smart app detection - finds existing apps by package/bundle ID

7. **Dependency Checking** (`src/utils/check-dependencies.js`)
   - Verifies all required tools
   - Checks: Node.js, npm, gcloud CLI
   - Provides installation instructions if missing

8. **Interactive Prompts** (`src/utils/prompt.js`)
   - `question()` - Simple text input
   - `selectOption()` - Choose from list of options
   - `confirm()` - Yes/no confirmation

8. **Play Store Config Generator** (`src/play-store/config-generator.js`)
   - Generates `play-store-config.json` template with pre-filled values from Firebase
   - Reads Firebase Android app info (package name, display name)
   - Provides sensible defaults for all required fields
   - Guides user through next steps after generation

9. **Play Store Publishing Module** (`src/play-store/`)
   - **Authentication** (`auth.js`): Service account authentication with Android Publisher API
   - **App Management** (`app.js`): Check/create Play Store apps (apps created on first upload)
   - **Edit Sessions** (`edits.js`): Manage Play Console edit sessions
   - **Releases** (`releases.js`): Upload AAB/APK files
   - **Metadata** (`metadata.js`): Set app listing metadata (title, descriptions, category)
   - **Content Rating** (`content-rating.js`): Automate content rating questionnaires
   - **Graphics** (`graphics.js`): Upload screenshots, icon, feature graphic
   - **Distribution** (`distribution.js`): Set pricing and release tracks
   - **Config Loader** (`config-loader.js`): Load and validate `play-store-config.json`
   - **State Management** (`state.js`): Track Play Store app state

### 🚧 Next Steps (Phase 3+)

- ADB automation for Android screenshot capture (postpone - user provides files for MVP)
- iOS App Store automation (future)

## Technology Stack

- **Runtime**: Node.js (ES modules - `"type": "module"`)
- **CLI Framework**: Commander.js
- **Google APIs**: `googleapis` npm package
- **Authentication**: gcloud CLI (Application Default Credentials)
- **State Management**: JSON files in `.autopublish/` directory (gitignored)
- **Shell Script**: Bash script for single entry point

## Project Structure

```
release_the_hounds/
├── release-the-hounds.sh         # Main entry point script
├── src/
│   ├── cli.js                    # CLI command definitions
│   ├── config.js                 # Configuration constants (PATHS, etc.)
│   ├── auth/
│   │   ├── gcloud-auth.js       # gcloud-based authentication (ACTIVE)
│   │   └── oauth.js             # OAuth2 flow (LEGACY - not used)
│   ├── gcp/
│   │   ├── project.js           # GCP project management
│   │   ├── apis.js              # API enabling
│   │   ├── service-account.js   # Service account creation & keys
│   │   └── iam.js               # IAM role assignment
│   ├── firebase/
│   │   └── project.js           # Firebase project & app management
│   ├── play-store/
│   │   ├── auth.js              # Play Store authentication
│   │   ├── app.js               # App creation/checking
│   │   ├── edits.js             # Edit session management
│   │   ├── releases.js          # AAB/APK upload
│   │   ├── metadata.js          # Metadata management
│   │   ├── content-rating.js    # Content rating questionnaires
│   │   ├── graphics.js          # Screenshots & graphics upload
│   │   ├── distribution.js      # Pricing & distribution
│   │   ├── config-loader.js     # Config file loading
│   │   ├── config-generator.js  # Config template generation
│   │   └── state.js             # State management
│   └── utils/
│       ├── fs.js                # File system utilities
│       ├── check-dependencies.js # Dependency checking
│       └── prompt.js            # Interactive prompts
├── .autopublish/                # Secrets and state (gitignored)
│   ├── state.json               # Current project state
│   ├── service-accounts/        # Service account keys
│   │   └── service-account-{projectId}.json
│   └── firebase-config/         # Firebase config files
│       ├── google-services.json
│       └── GoogleService-Info.plist
├── docs/                        # Documentation
│   ├── overview.md              # 3000-foot overview
│   ├── todo.md                  # Implementation tracking (OUTDATED)
│   ├── oauth-implementation.md  # OAuth details (OUTDATED - we use gcloud now)
│   └── api-breakdown.md         # API documentation
├── QUICK_SETUP.md               # OLD - Manual OAuth setup (OUTDATED)
├── README.md                    # User-facing documentation
└── package.json
```

## Key Design Decisions & Gotchas

### 1. Authentication Strategy
- **Why gcloud CLI?**: Google doesn't provide an API to create OAuth2 client credentials programmatically. Using gcloud CLI bypasses this entirely - it handles OAuth2 automatically.
- **Important**: The `gcloud auth application-default login` command does NOT support `--brief` flag. Use without flags.
- **Application Default Credentials**: This is what the Google APIs client libraries use. Set up via `gcloud auth application-default login`.

### 2. Project Naming
- User-facing: `release-the-hounds` (the command name)
- Package name: `release-the-hounds` (npm package name)
- **Important**: All user-facing messages should reference `release-the-hounds` or `Release The Hounds`

### 3. State Management
- State stored in `.autopublish/` directory (gitignored)
- `state.json` contains current project info and Firebase project info
- No sensitive data in git (all credentials handled by gcloud)
- **File Organization**:
  - Service account keys: `.autopublish/service-accounts/`
  - Firebase configs: `.autopublish/firebase-config/`
  - State: `.autopublish/state.json`

### 4. Firebase Project ↔ GCP Project Relationship
- **Critical**: Firebase projects are 1:1 with GCP projects
- You CANNOT link an existing Firebase project to a different GCP project
- When user selects existing Firebase project linked to different GCP project:
  - Tool automatically switches GCP project state
  - Saves Firebase project state to avoid re-prompting
- Firebase project state is saved and checked first before API calls

### 5. Error Handling
- Always check authentication before API calls
- Provide clear error messages with next steps
- Check dependencies upfront in the shell script
- **404 Handling**: List functions return empty arrays instead of throwing (Firebase might not be initialized yet)

### 6. Google APIs Import Pattern
- Use `import { google } from 'googleapis'` (not named imports)
- Then: `google.cloudresourcemanager({ version: 'v1', auth })`
- This works with ES modules

### 7. IAM Roles
- `roles/editor` - General project editor (NOT `roles/cloudresourcemanager.projectEditor` - that doesn't exist)
- `roles/firebase.admin` - Firebase Admin role
- `roles/androidpublisher` - **NOT granted via GCP IAM** - Play Console permissions are managed separately

### 8. Firebase API Endpoints
- Base URL: `https://firebase.googleapis.com/v1beta1`
- List projects: `GET /projects`
- Get project: `GET /projects/{projectId}`
- List Android apps: `GET /projects/{projectId}/androidApps` (returns 404 if no apps)
- List iOS apps: `GET /projects/{projectId}/iosApps` (returns 404 if no apps)
- Download config: `GET /projects/{projectId}/androidApps/{appId}/config`

## Important Commands Reference

```bash
# Check dependencies
./release-the-hounds.sh check-deps

# Authenticate (opens browser automatically)
./release-the-hounds.sh auth

# Check status
./release-the-hounds.sh status

# Create GCP project (full pipeline: project + APIs + service account + IAM roles)
./release-the-hounds.sh create-project --name "My App"

# List projects
./release-the-hounds.sh list-projects

# Setup service account (for existing projects or if skipped during create-project)
./release-the-hounds.sh setup-service-account [--force]

# Setup Firebase (interactive - shows project picker if needed)
./release-the-hounds.sh setup-firebase

# Setup Firebase with specific apps
./release-the-hounds.sh setup-firebase \
  --android-package "com.example.app" \
  --android-name "My App" \
  --ios-bundle "com.example.app" \
  --ios-name "My App"

# Non-interactive Firebase setup
./release-the-hounds.sh setup-firebase --no-interactive

# Generate Play Store config template (pre-filled with Firebase data)
./release-the-hounds.sh generate-play-store-config [--output <path>] [--force]

# Publish to Play Store (requires play-store-config.json)
./release-the-hounds.sh publish-play-store
```

## Streamlined Workflow

1. **Authenticate** (one-time): `./release-the-hounds.sh auth`
2. **Create Project** (everything): `./release-the-hounds.sh create-project --name "My App"`
   - Creates project
   - Enables APIs
   - Creates service account
   - Grants IAM roles
3. **Firebase Setup**: `./release-the-hounds.sh setup-firebase`
   - Shows project picker if no Firebase project exists
   - Lists existing apps
   - Downloads config files automatically
   - Or prompts to create new apps interactively
4. **Generate Play Store Config**: `./release-the-hounds.sh generate-play-store-config`
   - Pre-fills package name and app title from Firebase
   - Creates `play-store-config.json` template
   - User edits config file with app details
5. **Publish to Play Store**: `./release-the-hounds.sh publish-play-store`
   - Reads `play-store-config.json`
   - Uploads AAB/APK
   - Sets all metadata, content rating, graphics
   - Publishes to specified track

## Testing Notes

- Authentication works: Successfully authenticated via gcloud CLI
- All dependencies verified working
- Firebase project picker tested with multiple existing projects
- Existing apps detected and config files downloaded successfully

## Common Issues & Solutions

### Issue: "Could not load the default credentials"
- **Solution**: Run `./release-the-hounds.sh auth` to set up Application Default Credentials

### Issue: "gcloud CLI not found"
- **Solution**: Install via `sudo snap install google-cloud-cli --classic` (Linux) or `brew install google-cloud-sdk` (macOS)

### Issue: API import errors with googleapis
- **Solution**: Use `import { google } from 'googleapis'` then `google.serviceName({ version: 'v1', auth })`

### Issue: "Not Found" when listing Firebase apps
- **Solution**: This is normal if Firebase isn't initialized or no apps exist. The tool handles this gracefully by returning empty arrays.

### Issue: Firebase project picker keeps asking
- **Solution**: Firebase project state is saved. If it keeps asking, check `.autopublish/state.json` has `firebaseProject` field.

## Development Workflow

1. Make changes to source files in `src/`
2. Test via `./release-the-hounds.sh <command>`
3. The script automatically checks dependencies and installs npm packages if needed
4. No build step required - runs directly with Node.js

## Important Files to Know

- `release-the-hounds.sh` - Main entry point, always check this first
- `src/cli.js` - Command definitions
- `src/auth/gcloud-auth.js` - Authentication logic
- `src/gcp/project.js` - GCP project operations
- `src/firebase/project.js` - Firebase operations
- `src/config.js` - Configuration constants (PATHS, etc.)
- `.autopublish/` - State directory (gitignored, don't commit)

## Next Major Features to Implement

1. **ADB Automation** (`src/android/adb.js` - to be created, postponed for MVP)
   - Detect connected devices
   - Install and launch apps
   - Navigate UI programmatically
   - Capture screenshots
   - **Status**: Postponed - user provides screenshot files for MVP

2. **iOS App Store Automation** (Future)
   - Fastlane integration
   - Simulator automation
   - Screenshot capture
   - App Store Connect API integration

## Files That Need Cleanup

- `QUICK_SETUP.md` - **OUTDATED** - Documents manual OAuth2 setup which we don't use anymore (we use gcloud CLI)
- `docs/todo.md` - **OUTDATED** - Implementation tracking is stale, needs update
- `docs/oauth-implementation.md` - **OUTDATED** - Documents old OAuth flow, we use gcloud now
- `src/auth/oauth.js` - **LEGACY** - Old OAuth implementation, kept for reference but not used
- `src/setup/oauth-setup.js` - **UNUSED** - May not be needed

## Documentation Status

- ✅ `README.md` - **ACCURATE** - User-facing docs are up to date
- ✅ `docs/overview.md` - **ACCURATE** - High-level overview still relevant
- ✅ `docs/api-breakdown.md` - **ACCURATE** - API documentation is current
- ⚠️ `QUICK_SETUP.md` - **OUTDATED** - Should be removed or updated
- ⚠️ `docs/todo.md` - **OUTDATED** - Needs refresh
- ⚠️ `docs/oauth-implementation.md` - **OUTDATED** - Can be archived

---

**Last Updated**: After implementing Play Store config template generator.

**Key Achievements**:
- ✅ Eliminated manual OAuth2 setup by using gcloud CLI
- ✅ Full GCP project creation pipeline (project + APIs + service account + IAM)
- ✅ Firebase project picker with multiple projects support
- ✅ Smart app detection and config file downloads
- ✅ Organized file structure (service-accounts/, firebase-config/)
- ✅ Complete Play Store publishing automation (upload, metadata, content rating, graphics)
- ✅ Play Store config template generator with Firebase pre-filling
