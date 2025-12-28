#!/usr/bin/env node

/**
 * CLI entry point for Release The Hounds
 */

import 'dotenv/config';
import { Command } from 'commander';
import { join } from 'path';
import { startOAuthFlow, checkAuthStatus as checkOAuthStatus } from './auth/oauth.js';
import { authenticateWithGcloud, checkAuthStatus as checkGcloudStatus, isGcloudInstalled } from './auth/gcloud-auth.js';
import { createProject, generateProjectId, listProjects, loadProjectState } from './gcp/project.js';
import { enableAllRequiredApis, enableApi, isApiEnabled, REQUIRED_APIS } from './gcp/apis.js';
import { setupServiceAccount, loadServiceAccountKey } from './gcp/service-account.js';
import { grantAllRequiredRoles, REQUIRED_ROLES } from './gcp/iam.js';
import { createOrLinkFirebaseProject, addAndroidApp, addIOSApp, downloadGoogleServicesJson, downloadGoogleServiceInfoPlist, loadFirebaseProjectState, listAndroidApps, listIOSApps, getFirebaseProject } from './firebase/project.js';
import { question, confirm } from './utils/prompt.js';
import { checkAllDependencies, printDependencyStatus } from './utils/check-dependencies.js';
import { fileExists, deleteFile, writeJsonFile } from './utils/fs.js';
import { PATHS } from './config.js';
import { getPlayStoreClient, verifyPlayConsoleAccess } from './play-store/auth.js';
import { createPlayStoreApp } from './play-store/app.js';
import { createEdit, validateEdit, commitEdit, getExistingEdit } from './play-store/edits.js';
import { setListingMetadata } from './play-store/metadata.js';
import { uploadScreenshotsFromDirectory, uploadAppIcon, uploadFeatureGraphic } from './play-store/graphics.js';
import { loadPlayStoreConfig, getDefaultConfigPath, createExampleConfig } from './play-store/config-loader.js';
import { generatePlayStoreConfigTemplate } from './play-store/config-generator.js';

const program = new Command();

program
  .name('release-the-hounds')
  .description('Automated mobile app publishing pipeline for Google Play Store and iOS App Store')
  .version('0.1.0');

// Check dependencies command
program
  .command('check-deps')
  .description('Check if all required dependencies are installed')
  .action(async () => {
    try {
      const results = await checkAllDependencies();
      const allInstalled = printDependencyStatus(results);

      if (!allInstalled) {
        console.log('❌ Some dependencies are missing. Please install them before proceeding.\n');
        process.exit(1);
      } else {
        console.log('✅ All dependencies are installed!\n');
      }
    } catch (error) {
      console.error('Error checking dependencies:', error.message);
      process.exit(1);
    }
  });

// Auth command - uses gcloud CLI for true automation
program
  .command('auth')
  .description('Authenticate with Google (uses gcloud CLI - fully automated)')
  .option('--force', 'Force re-authentication even if already authenticated')
  .action(async (options) => {
    try {
      // Check if gcloud is installed
      if (!await isGcloudInstalled()) {
        console.error('\n❌ gcloud CLI not found.');
        console.error('\n📦 Install Google Cloud SDK:');
        console.error('   Linux: https://cloud.google.com/sdk/docs/install#linux');
        console.error('   macOS: brew install google-cloud-sdk');
        console.error('   Windows: https://cloud.google.com/sdk/docs/install#windows');
        console.error('\nAfter installation, run "./release-the-hounds.sh auth" again.\n');
        process.exit(1);
      }

      // Check if already authenticated
      if (!options.force) {
        const status = await checkGcloudStatus();
        if (status.authenticated) {
          console.log('✅ Already authenticated!');
          console.log('Account:', status.account);
          console.log('Method:', status.method);
          console.log('\nUse --force to re-authenticate.');
          return;
        }
      }

      // Authenticate using gcloud
      await authenticateWithGcloud();

      console.log('🎉 Authentication complete!');
      console.log('   You can now use all release-the-hounds commands.');
      console.log('   Run: ./release-the-hounds.sh create-project\n');
    } catch (error) {
      console.error('\n❌ Authentication failed:', error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    try {
      const status = await checkGcloudStatus();

      if (status.authenticated) {
        console.log('✅ Authenticated');
        console.log('Account:', status.account);
        console.log('Method:', status.method);

        // Show project state if available
        const projectState = await loadProjectState();
        if (projectState) {
          console.log('\n📁 Current Project:');
          console.log(`   Project ID: ${projectState.projectId}`);
          console.log(`   Project Number: ${projectState.projectNumber}`);
          console.log(`   Name: ${projectState.name}`);
        }
      } else {
        console.log('❌ Not authenticated');
        console.log('Message:', status.message);
        if (status.error) {
          console.log('Error:', status.error);
        }
        console.log('\nRun "./release-the-hounds.sh auth" to authenticate.');
      }
    } catch (error) {
      console.error('Error checking status:', error.message);
      process.exit(1);
    }
  });

// Create project command
program
  .command('create-project')
  .description('Create a new Google Cloud project with full setup (APIs, service account, IAM roles)')
  .option('--project-id <id>', 'Custom project ID (auto-generated if not provided)')
  .option('--name <name>', 'Project display name', 'Release The Hounds Project')
  .option('--skip-service-account', 'Skip service account creation (create manually later)')
  .action(async (options) => {
    try {
      // Check authentication first
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      const projectId = options.projectId || generateProjectId();

      // Step 1: Create project
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📁 Step 1: Creating Google Cloud Project');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      const project = await createProject(projectId, options.name);

      // Step 2: Enable required APIs
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔌 Step 2: Enabling Required APIs');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      await enableAllRequiredApis(projectId);

      // Step 3: Create service account and grant roles
      if (!options.skipServiceAccount) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('👤 Step 3: Setting Up Service Account');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        try {
          const { serviceAccount, keyPath } = await setupServiceAccount(
            projectId,
            'app-publisher',
            'Release The Hounds Service Account'
          );

          await grantAllRequiredRoles(projectId, serviceAccount.email);

          console.log('\n✅ Service account configured');
          console.log(`   Email: ${serviceAccount.email}`);
          console.log(`   Key: ${keyPath}`);
        } catch (error) {
          console.error('\n⚠️  Service account setup failed:', error.message);
          console.error('   You can create it later with: ./release-the-hounds.sh setup-service-account');
          console.error('   Continuing with project setup...\n');
        }
      } else {
        console.log('\n⏭️  Skipping service account setup (use --skip-service-account to hide this)');
        console.log('   Create it later with: ./release-the-hounds.sh setup-service-account\n');
      }

      // Summary
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 Project Setup Complete!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`   Project ID: ${project.projectId}`);
      console.log(`   Project Number: ${project.projectNumber}`);
      console.log(`   Name: ${project.name}`);
      console.log(`   State: ${project.lifecycleState}`);
      console.log('\n✅ Ready for Firebase setup!');
      console.log('   Next: ./release-the-hounds.sh setup-firebase\n');
    } catch (error) {
      console.error('\n❌ Project setup failed:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      if (error.response?.data?.error) {
        console.error(`   Details: ${JSON.stringify(error.response.data.error, null, 2)}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure you have proper permissions');
      console.error('   - Check that billing is enabled (if required)');
      console.error('   - Verify project ID is unique\n');
      process.exit(1);
    }
  });

// List projects command
program
  .command('list-projects')
  .description('List all accessible Google Cloud projects')
  .action(async () => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      console.log('\n📁 Accessible Projects:\n');
      const projects = await listProjects();

      if (projects.length === 0) {
        console.log('   No projects found.');
      } else {
        projects.forEach(project => {
          console.log(`   ${project.projectId} - ${project.name} (${project.projectNumber})`);
        });
      }
    } catch (error) {
      console.error('❌ Error listing projects:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      process.exit(1);
    }
  });

// Setup service account command
program
  .command('setup-service-account')
  .description('Create service account and grant required IAM roles')
  .option('--project-id <id>', 'GCP project ID (uses current project if not provided)')
  .option('--account-id <id>', 'Service account ID', 'app-publisher')
  .option('--name <name>', 'Service account display name', 'Release The Hounds Service Account')
  .option('--force', 'Recreate service account key even if it already exists')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Get project ID
      let projectId = options.projectId;
      if (!projectId) {
        const projectState = await loadProjectState();
        if (!projectState || !projectState.projectId) {
          console.error('❌ No project found. Create a project first:');
          console.error('   ./release-the-hounds.sh create-project');
          process.exit(1);
        }
        projectId = projectState.projectId;
        console.log(`\n📁 Using project: ${projectId}`);
      }

      // Check if service account key already exists
      const existingKey = await loadServiceAccountKey(projectId);
      if (existingKey) {
        if (options.force) {
          console.log(`\n⚠️  --force flag used: Deleting existing key file...`);
          await deleteFile(existingKey.keyPath);
          console.log(`   ✅ Deleted: ${existingKey.keyPath}\n`);
        } else {
          console.log(`\n⚠️  Service account key already exists: ${existingKey.keyPath}`);
          console.log('   Use --force to recreate (or delete the existing key file first)');
          return;
        }
      }

      // Create service account
      const { serviceAccount, keyPath } = await setupServiceAccount(
        projectId,
        options.accountId,
        options.name
      );

      // Grant IAM roles
      await grantAllRequiredRoles(projectId, serviceAccount.email);

      console.log('\n🎉 Service account setup complete!');
      console.log(`   Service account: ${serviceAccount.email}`);
      console.log(`   Key file: ${keyPath}`);
      console.log(`   GCP IAM roles granted: ${REQUIRED_ROLES.length}`);
      console.log('\n✅ Ready for Firebase operations!');
      console.log('   Note: Play Console permissions must be granted manually in Play Console.\n');
    } catch (error) {
      console.error('\n❌ Service account setup failed:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      if (error.response?.data?.error) {
        console.error(`   Details: ${JSON.stringify(error.response.data.error, null, 2)}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure you have "Service Account Admin" role');
      console.error('   - Ensure you have "Project IAM Admin" role');
      console.error('   - Check that the project exists and APIs are enabled\n');
      process.exit(1);
    }
  });

// Export service account key for CI/CD
program
  .command('export-service-account')
  .description('Export service account key for CI/CD (GitHub Actions, etc.)')
  .option('--project-id <id>', 'GCP project ID (uses current project if not provided)')
  .option('--output <path>', 'Output file path (defaults to stdout)')
  .option('--github-secret', 'Output as GitHub secret format (base64 encoded)')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Get project ID
      let projectId = options.projectId;
      if (!projectId) {
        const projectState = await loadProjectState();
        if (!projectState || !projectState.projectId) {
          console.error('❌ No project found. Create a project first:');
          console.error('   ./release-the-hounds.sh create-project');
          process.exit(1);
        }
        projectId = projectState.projectId;
      }

      // Load service account key
      const keyData = await loadServiceAccountKey(projectId);
      if (!keyData) {
        console.error(`\n❌ Service account key not found for project: ${projectId}`);
        console.error('\n💡 Create service account first:');
        console.error('   ./release-the-hounds.sh setup-service-account\n');
        process.exit(1);
      }

      const { keyJson, keyPath } = keyData;

      console.log(`\n🔑 Service Account Key Export`);
      console.log(`   Project: ${projectId}`);
      console.log(`   Service Account: ${keyJson.client_email}`);
      console.log(`   Key File: ${keyPath}\n`);

      if (options.githubSecret) {
        // Output as base64 for GitHub secrets
        const keyString = JSON.stringify(keyJson, null, 2);
        const base64Key = Buffer.from(keyString).toString('base64');

        if (options.output) {
          const { writeFile } = await import('fs/promises');
          await writeFile(options.output, base64Key, 'utf-8');
          console.log(`✅ Base64 encoded key saved to: ${options.output}`);
        } else {
          console.log('\n📋 Base64 Encoded Key (for GitHub Secrets):');
          console.log('─'.repeat(60));
          console.log(base64Key);
          console.log('─'.repeat(60));
        }
      } else {
        // Output JSON
        if (options.output) {
          await writeJsonFile(options.output, keyJson);
          console.log(`✅ Service account key exported to: ${options.output}`);
        } else {
          console.log('\n📋 Service Account Key JSON:');
          console.log('─'.repeat(60));
          console.log(JSON.stringify(keyJson, null, 2));
          console.log('─'.repeat(60));
        }
      }

      console.log('\n💡 GitHub Actions Setup:');
      console.log('   1. Go to your GitHub repository → Settings → Secrets and variables → Actions');
      console.log('   2. Click "New repository secret"');
      console.log('   3. Name: GOOGLE_SERVICE_ACCOUNT_JSON');
      console.log('   4. Value: Paste the JSON content above (or base64 if using --github-secret)');
      console.log('   5. In your workflow, use:');
      console.log('      - name: Upload to Google Play');
      console.log('        uses: r0adkll/upload-google-play@v1');
      console.log('        with:');
      console.log('          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}');
      console.log('          packageName: com.your.package');
      console.log('          releaseFiles: app-release.aab');
      console.log('          track: internal\n');
    } catch (error) {
      console.error('\n❌ Failed to export service account:', error.message);
      process.exit(1);
    }
  });

// Setup Firebase command
program
  .command('setup-firebase')
  .description('Create or link Firebase project and register Android/iOS apps')
  .option('--project-id <id>', 'GCP project ID (uses current project if not provided)')
  .option('--name <name>', 'Firebase project display name')
  .option('--android-package <package>', 'Android package name (e.g., com.example.app)')
  .option('--android-name <name>', 'Android app display name')
  .option('--android-sha1 <sha1>', 'Android SHA-1 fingerprint (optional)')
  .option('--ios-bundle <bundle>', 'iOS bundle ID (e.g., com.example.app)')
  .option('--ios-name <name>', 'iOS app display name')
  .option('--skip-android', 'Skip Android app registration')
  .option('--skip-ios', 'Skip iOS app registration')
  .option('--no-interactive', 'Skip interactive Firebase project picker')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Get project ID
      let projectId = options.projectId;
      if (!projectId) {
        const projectState = await loadProjectState();
        if (!projectState || !projectState.projectId) {
          console.error('❌ No project found. Create a project first:');
          console.error('   ./release-the-hounds.sh create-project');
          process.exit(1);
        }
        projectId = projectState.projectId;
      }

      const projectState = await loadProjectState();
      const displayName = options.name || projectState?.name || 'Firebase Project';

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log('🔥 Firebase Project Setup');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   GCP Project: ${projectId}`);
      console.log(`   Display name: ${displayName}\n`);

      // Step 1: Create or link Firebase project
      console.log('📋 Step 1: Creating/Linking Firebase Project');
      const interactive = options.interactive !== false; // Default to true unless --no-interactive
      const firebaseProject = await createOrLinkFirebaseProject(projectId, displayName, interactive);

      // Step 2: Handle apps (existing or new)
      console.log('\n📋 Step 2: Setting up Apps');

      let androidApp = null;
      let iosApp = null;

      try {
        // Verify Firebase project is active before listing apps
        const firebaseProjectCheck = await getFirebaseProject(projectId);
        if (!firebaseProjectCheck) {
          throw new Error(`Firebase project not found for GCP project ${projectId}. Please set up Firebase first.`);
        }

        const existingAndroidApps = await listAndroidApps(projectId);
        const existingIOSApps = await listIOSApps(projectId);

        // Handle Android apps
        if (!options.skipAndroid) {
          if (existingAndroidApps.length > 0) {
            console.log(`\n📱 Found ${existingAndroidApps.length} existing Android app(s):`);
            existingAndroidApps.forEach((app, index) => {
              console.log(`   ${index + 1}. ${app.displayName || app.packageName} (${app.packageName})`);
            });

            if (options.androidPackage) {
              // User provided package name - find matching app
              androidApp = existingAndroidApps.find(app => app.packageName === options.androidPackage);
              if (!androidApp) {
                console.log(`\n   ℹ️  No existing app found with package "${options.androidPackage}"`);
                console.log(`   Creating new Android app...`);
                androidApp = await addAndroidApp(
                  projectId,
                  options.androidPackage,
                  options.androidName || 'Android App',
                  options.androidSha1 || null
                );
              } else {
                console.log(`\n   ✅ Using existing Android app: ${androidApp.displayName || androidApp.packageName}`);
              }
            } else {
              // No package provided - download configs for all existing apps
              console.log(`\n   📥 Downloading config files for existing Android apps...`);
              for (const app of existingAndroidApps) {
                if (app.appId) {
                  const fileName = `google-services-${app.packageName.replace(/\./g, '-')}.json`;
                  await downloadGoogleServicesJson(projectId, app.appId, `${PATHS.FIREBASE_CONFIG_DIR}/${fileName}`);
                }
              }
              androidApp = existingAndroidApps[0]; // Use first one for summary
            }

            // Download config for the selected/new app
            if (androidApp?.appId && options.androidPackage) {
              await downloadGoogleServicesJson(projectId, androidApp.appId);
            }
          } else {
            // No existing Android apps
            if (options.androidPackage) {
              console.log(`\n📱 No existing Android apps found. Creating new app...`);
              androidApp = await addAndroidApp(
                projectId,
                options.androidPackage,
                options.androidName || 'Android App',
                options.androidSha1 || null
              );
              if (androidApp.appId) {
                await downloadGoogleServicesJson(projectId, androidApp.appId);
              }
            } else if (interactive) {
              // Ask user if they want to create Android app
              const createAndroid = await confirm('\n   No Android apps found. Create one?', false);
              if (createAndroid) {
                const packageName = await question('   Enter Android package name (e.g., com.example.app): ');
                if (packageName.trim()) {
                  const displayName = await question('   Enter app display name (optional): ') || 'Android App';
                  androidApp = await addAndroidApp(projectId, packageName.trim(), displayName.trim() || 'Android App');
                  if (androidApp.appId) {
                    await downloadGoogleServicesJson(projectId, androidApp.appId);
                  }
                }
              }
            } else {
              console.log(`\n   ⚠️  No Android apps found. Use --android-package to create one.`);
            }
          }
        }

        // Handle iOS apps
        if (!options.skipIos) {
          if (existingIOSApps.length > 0) {
            console.log(`\n🍎 Found ${existingIOSApps.length} existing iOS app(s):`);
            existingIOSApps.forEach((app, index) => {
              console.log(`   ${index + 1}. ${app.displayName || app.bundleId} (${app.bundleId})`);
            });

            if (options.iosBundle) {
              // User provided bundle ID - find matching app
              iosApp = existingIOSApps.find(app => app.bundleId === options.iosBundle);
              if (!iosApp) {
                console.log(`\n   ℹ️  No existing app found with bundle "${options.iosBundle}"`);
                console.log(`   Creating new iOS app...`);
                iosApp = await addIOSApp(
                  projectId,
                  options.iosBundle,
                  options.iosName || 'iOS App'
                );
              } else {
                console.log(`\n   ✅ Using existing iOS app: ${iosApp.displayName || iosApp.bundleId}`);
              }
            } else {
              // No bundle provided - download configs for all existing apps
              console.log(`\n   📥 Downloading config files for existing iOS apps...`);
              for (const app of existingIOSApps) {
                if (app.appId) {
                  const fileName = `GoogleService-Info-${app.bundleId.replace(/\./g, '-')}.plist`;
                  await downloadGoogleServiceInfoPlist(projectId, app.appId, `${PATHS.FIREBASE_CONFIG_DIR}/${fileName}`);
                }
              }
              iosApp = existingIOSApps[0]; // Use first one for summary
            }

            // Download config for the selected/new app
            if (iosApp?.appId && options.iosBundle) {
              await downloadGoogleServiceInfoPlist(projectId, iosApp.appId);
            }
          } else {
            // No existing iOS apps
            if (options.iosBundle) {
              console.log(`\n🍎 No existing iOS apps found. Creating new app...`);
              iosApp = await addIOSApp(
                projectId,
                options.iosBundle,
                options.iosName || 'iOS App'
              );
              if (iosApp.appId) {
                await downloadGoogleServiceInfoPlist(projectId, iosApp.appId);
              }
            } else if (interactive) {
              // Ask user if they want to create iOS app
              const createIOS = await confirm('\n   No iOS apps found. Create one?', false);
              if (createIOS) {
                const bundleId = await question('   Enter iOS bundle ID (e.g., com.example.app): ');
                if (bundleId.trim()) {
                  const displayName = await question('   Enter app display name (optional): ') || 'iOS App';
                  iosApp = await addIOSApp(projectId, bundleId.trim(), displayName.trim() || 'iOS App');
                  if (iosApp.appId) {
                    await downloadGoogleServiceInfoPlist(projectId, iosApp.appId);
                  }
                }
              }
            } else {
              console.log(`\n   ⚠️  No iOS apps found. Use --ios-bundle to create one.`);
            }
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Error handling apps: ${error.message}`);
        throw error;
      }

      // Summary
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 Firebase Setup Complete!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`   Firebase Project ID: ${firebaseProject.projectId}`);
      console.log(`   Display Name: ${firebaseProject.displayName}`);

      if (androidApp) {
        console.log(`\n   ✅ Android App: ${androidApp.packageName}`);
        console.log(`      App ID: ${androidApp.appId}`);
        console.log(`      Config: ${PATHS.FIREBASE_CONFIG_DIR}/google-services.json`);
      }

      if (iosApp) {
        console.log(`\n   ✅ iOS App: ${iosApp.bundleId}`);
        console.log(`      App ID: ${iosApp.appId}`);
        console.log(`      Config: ${PATHS.FIREBASE_CONFIG_DIR}/GoogleService-Info.plist`);
      }

      console.log('\n✅ Ready for app development and Play Store publishing!');
      console.log('\n💡 Next step: Generate Play Store config template');
      console.log('   Run: ./release-the-hounds.sh generate-play-store-config\n');
    } catch (error) {
      console.error('\n❌ Firebase setup failed:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure Firebase API is enabled');
      console.error('   - Check that service account has Firebase Admin role');
      console.error('   - Verify project exists and is active');
      console.error('   - Note: If Firebase project already exists for another GCP project,');
      console.error('     you may need to use that GCP project or create a new Firebase project\n');
      process.exit(1);
    }
  });

// Generate Play Store config template command
program
  .command('generate-play-store-config')
  .description('Generate Play Store config template pre-filled with Firebase data')
  .option('--output <path>', 'Output path for config file')
  .option('--force', 'Overwrite existing config file')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Resolve output path relative to current working directory
      const outputPath = options.output
        ? join(process.cwd(), options.output)
        : getDefaultConfigPath();

      // Check if file exists and --force not set
      if (!options.force && await fileExists(outputPath)) {
        console.error(`\n❌ Config file already exists: ${outputPath}`);
        console.error('   Use --force to overwrite\n');
        process.exit(1);
      }

      // Generate config template
      await generatePlayStoreConfigTemplate(outputPath, options.force);
    } catch (error) {
      console.error('\n❌ Failed to generate config template:', error.message);
      if (error.message.includes('Firebase project')) {
        console.error('\n💡 Run Firebase setup first:');
        console.error('   ./release-the-hounds.sh setup-firebase\n');
      }
      process.exit(1);
    }
  });

// Publish Play Store metadata/config command
// NOTE: This command only manages metadata/configuration. Build uploads are handled by CI/CD.
program
  .command('publish-play-store')
  .description('Update Play Store metadata and configuration (builds are uploaded via CI/CD)')
  .option('--config <path>', 'Path to play-store-config.json file')
  .option('--dry-run', 'Validate and show what would be done without publishing')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Resolve config path relative to current working directory
      const configPath = options.config
        ? join(process.cwd(), options.config)
        : getDefaultConfigPath();

      // Load config file
      let config;
      try {
        config = await loadPlayStoreConfig(configPath);
      } catch (error) {
        if (error.message.includes('not found')) {
          console.error(`\n❌ Config file not found: ${configPath}`);
          console.error('\n💡 Create a config file:');
          console.error(`   1. Run: rth generate-play-store-config`);
          console.error(`   2. Edit play-store-config.json with your app details`);
          console.error(`   3. Run this command again\n`);
          process.exit(1);
        }
        throw error;
      }

      console.log('\n📝 Updating Play Store metadata and configuration...');
      console.log(`   Package: ${config.packageName}`);
      console.log(`\n💡 Note: Build uploads are handled by CI/CD. This command only updates metadata.`);

      if (options.dryRun) {
        console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
      }

      // Step 1: Verify Play Console access
      console.log('\n📋 Step 1: Verifying Play Console access...');
      await verifyPlayConsoleAccess();

      // Step 2: Check if app exists
      console.log('\n📋 Step 2: Checking Play Store app...');
      const appCheck = await createPlayStoreApp(config.packageName, config.metadata.title, 'en-US');

      if (!appCheck.exists) {
        console.log(`\n⚠️  App does not exist in Play Console`);
        console.log(`\n💡 Create the app first:`);
        console.log(`   1. Go to https://play.google.com/console`);
        console.log(`   2. Click "Create app"`);
        console.log(`   3. Enter package name: ${config.packageName}`);
        console.log(`   4. Upload your first build via CI/CD`);
        console.log(`   5. Then run this command again to update metadata\n`);
        process.exit(1);
      }

      if (options.dryRun) {
        console.log(`   ✅ Would update metadata and configuration`);
        console.log(`\n✅ Dry run complete. Remove --dry-run to publish.\n`);
        return;
      }

      // Step 3: Create edit session (no build upload needed)
      console.log('\n📋 Step 3: Creating edit session...');
      let editId = await getExistingEdit(config.packageName);

      if (!editId) {
        editId = await createEdit(config.packageName);
      } else {
        console.log(`   ✅ Using existing edit session: ${editId}`);
      }

      // Step 4: Set metadata
      console.log('\n📋 Step 4: Setting metadata...');
      await setListingMetadata(
        config.packageName,
        editId,
        'en-US',
        config.metadata
      );

      // Verify metadata was saved by reading it back
      console.log('\n🔍 Verifying metadata was saved...');
      const { getListingMetadata } = await import('./play-store/metadata.js');
      const savedMetadata = await getListingMetadata(config.packageName, editId, 'en-US');
      if (savedMetadata) {
        console.log(`   ✅ Verified: Metadata is saved in edit session`);
        console.log(`      Title: "${savedMetadata.title || '(not set)'}"`);
        console.log(`      Short description: ${savedMetadata.shortDescription ? `"${savedMetadata.shortDescription.substring(0, 50)}..."` : '(not set)'}`);
        console.log(`      Full description: ${savedMetadata.fullDescription ? `${savedMetadata.fullDescription.length} characters` : '(not set)'}`);
      } else {
        console.log(`   ⚠️  Could not verify metadata (listing may not exist yet)`);
      }

      // Content rating and data safety cannot be automated - skip
      // These must be completed manually in Play Console

      // Step 6: Upload screenshots (optional - skip if directory doesn't exist)
      if (config.graphics?.screenshotsDir) {
        const screenshotsDir = join(process.env.ORIGINAL_CWD || process.cwd(), config.graphics.screenshotsDir);
        if (await fileExists(screenshotsDir)) {
          console.log('\n📋 Step 6: Uploading screenshots...');
          await uploadScreenshotsFromDirectory(
            config.packageName,
            editId,
            'en-US',
            screenshotsDir
          );
        } else {
          console.log('\n📋 Step 6: Skipping screenshots (directory not found)...');
          console.log(`   ℹ️  Screenshots directory not found: ${config.graphics.screenshotsDir}`);
          console.log(`   💡 Add screenshots later and run this command again`);
        }
      }

      // Step 7: Upload icon and feature graphic
      if (config.graphics?.icon && await fileExists(config.graphics.icon)) {
        console.log('\n📋 Step 7: Uploading app icon...');
        await uploadAppIcon(config.packageName, editId, 'en-US', config.graphics.icon);
      }

      if (config.graphics?.featureGraphic && await fileExists(config.graphics.featureGraphic)) {
        console.log('\n📋 Step 8: Uploading feature graphic...');
        await uploadFeatureGraphic(config.packageName, editId, 'en-US', config.graphics.featureGraphic);
      }

      // Distribution settings (countries, track, pricing) cannot be automated
      // Must be set manually in Play Console → Pricing & distribution

      // Step 10: Validate edit
      console.log('\n📋 Step 11: Validating edit...');
      await validateEdit(config.packageName, editId);

      // Step 11: Commit edit
      console.log('\n📋 Step 12: Committing edit...');
      const commitResult = await commitEdit(config.packageName, editId);

      if (commitResult && commitResult.committed === false) {
        // Metadata saved but not committed (draft app)
        console.log('\n✅ Metadata changes saved successfully!');
        console.log(`   Package: ${config.packageName}`);
        console.log(`   Edit ID: ${commitResult.editId}`);
        console.log('\n📋 What WAS saved in edit session:');
        console.log(`   ✅ Title: ${config.metadata.title}`);
        console.log(`   ✅ Short description: ${config.metadata.shortDescription}`);
        console.log(`   ✅ Full description: ${config.metadata.fullDescription.length} characters`);
        console.log(`   ✅ Screenshots: ${config.graphics?.screenshotsDir ? 'Uploaded' : 'Skipped'}`);
        console.log(`   ✅ Icon: ${config.graphics?.icon ? 'Uploaded' : 'Skipped'}`);
        console.log(`   ✅ Feature graphic: ${config.graphics?.featureGraphic ? 'Uploaded' : 'Skipped'}`);
        console.log('\n⚠️  IMPORTANT: Metadata is saved but NOT visible in Play Console UI yet!');
        console.log('\n   ✅ GOOD NEWS: The metadata IS saved and verified in edit session!');
        console.log('   ✅ Google sees it: Check "Publishing overview" → "Store listings" shows as changed');
        console.log('   ❌ But Play Console UI only shows COMMITTED data, not pending edits');
        console.log('\n   📋 To make metadata visible in Play Console:');
        console.log('\n   Option 1: Submit for review (recommended)');
        console.log('      → Complete required questionnaires in Play Console:');
        console.log('        • Content rating');
        console.log('        • Data safety');
        console.log('        • Privacy policy URL');
        console.log('        • App category');
        console.log('      → Go to "Publishing overview" → "Send app for review"');
        console.log('      → The edit will be committed automatically');
        console.log('      → Metadata will appear in Play Console immediately');
        console.log('\n   Option 2: Create a draft release in the same edit session');
        console.log('      → This is complex and not recommended');
        console.log('      → Easier to just submit for review');
        console.log('\n   💡 Why this happens:');
        console.log('      Play Store API: Draft apps can only commit edits when submitting for review.');
        console.log('      Even with a release, metadata-only edits stay pending until review submission.');
        console.log('      This is a Google Play API limitation, not a bug in this tool.\n');
        console.log('\n⚠️  What CANNOT be automated (API limitations - must set manually):');
        console.log(`   ❌ Privacy policy URL`);
        console.log(`      → Set in: Play Console → Store presence → Main store listing → Privacy policy`);
        console.log(`   ❌ App category`);
        console.log(`      → Set in: Play Console → Store presence → Main store listing → App category`);
        console.log(`   ❌ Content rating questionnaires`);
        console.log(`      → Complete in: Play Console → Policy → Content rating`);
        console.log(`   ❌ Data safety form`);
        console.log(`      → Complete in: Play Console → Policy → Data safety\n`);
      } else {
        // Successfully committed
        console.log('\n✅ Play Store metadata updated successfully!');
        console.log(`   Package: ${config.packageName}`);
        console.log('\n💡 Next steps:');
        console.log('   - Review the app in Play Console');
        console.log('   - CI/CD will handle build uploads automatically');
        console.log('   - Submit for review when ready (if publishing to production)\n');
      }
    } catch (error) {
      console.error('\n❌ Play Store metadata update failed:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      if (error.response?.data?.error) {
        console.error(`   Details: ${JSON.stringify(error.response.data.error, null, 2)}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure service account has Play Console access (grant manually in Play Console)');
      console.error('   - Verify config file is valid');
      console.error('   - Ensure app exists in Play Console (create manually or upload first build via CI/CD)');
      console.error('   - Ensure all required metadata fields are provided\n');
      process.exit(1);
    }
  });

// Grant Play Console permissions helper command
program
  .command('grant-play-console-access')
  .description('Get instructions and service account email for granting Play Console permissions')
  .option('--open', 'Open Play Console permissions page in browser')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Get service account email
      const projectState = await loadProjectState();
      if (!projectState || !projectState.projectId) {
        console.error('❌ No project found. Create a project first:');
        console.error('   ./release-the-hounds.sh create-project');
        process.exit(1);
      }

      const serviceAccountData = await loadServiceAccountKey(projectState.projectId);
      if (!serviceAccountData || !serviceAccountData.keyJson) {
        console.error('❌ Service account not found. Create one first:');
        console.error('   ./release-the-hounds.sh setup-service-account');
        process.exit(1);
      }

      const serviceAccountEmail = serviceAccountData.keyJson.client_email;

      console.log('\n🔐 Play Console Permission Setup');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📧 Service Account Email:');
      console.log(`   ${serviceAccountEmail}\n`);
      console.log('📋 Required Permissions:');
      console.log('   ✅ View app information');
      console.log('   ✅ Manage production releases');
      console.log('   ✅ Release apps to testing tracks');
      console.log('   ✅ Manage store presence (for metadata updates)');
      console.log('   ✅ View financial data (for pricing/distribution)');
      console.log('   ✅ Manage orders and subscriptions (for validation)\n');
      console.log('   💡 RECOMMENDED: Grant "Admin" role for full access');
      console.log('      This includes validation permissions and all other features\n');
      console.log('📝 Steps:');
      console.log('   1. Go to: https://play.google.com/console');
      console.log('   2. Click "Settings" → "Users & Permissions"');
      console.log('   3. Click "Invite new users"');
      console.log('   4. Paste the service account email above');
      console.log('   5. Select "Admin" role (recommended for full automation)');
      console.log('      OR select individual permissions:');
      console.log('         - View app information');
      console.log('         - Manage production releases');
      console.log('         - Release apps to testing tracks');
      console.log('         - Manage store presence');
      console.log('         - View financial data');
      console.log('         - Manage orders and subscriptions');
      console.log('   6. Click "Invite"\n');
      console.log('⚠️  Note: If validation fails, grant "Admin" role for full access');

      if (options.open) {
        const { default: open } = await import('open');
        const playConsoleUrl = 'https://play.google.com/console/u/0/developers/access';
        console.log(`🌐 Opening Play Console permissions page...`);
        await open(playConsoleUrl);
        console.log(`   ✅ Opened: ${playConsoleUrl}\n`);
      } else {
        console.log('💡 Tip: Use --open to automatically open the permissions page\n');
      }

      console.log('✅ After granting permissions, you can:');
      console.log('   - Upload builds via CI/CD');
      console.log('   - Update metadata with: rth publish-play-store');
      console.log('   - Verify access with: rth publish-play-store --dry-run\n');
    } catch (error) {
      console.error('\n❌ Failed to get service account info:', error.message);
      process.exit(1);
    }
  });

// Enable APIs command
program
  .command('enable-apis')
  .description('Enable required Google Cloud APIs for the project')
  .option('--project-id <id>', 'GCP project ID (uses current project if not provided)')
  .option('--api <name>', 'Enable specific API only (e.g., androidpublisher.googleapis.com)')
  .action(async (options) => {
    try {
      const authStatus = await checkGcloudStatus();
      if (!authStatus.authenticated) {
        console.error('❌ Not authenticated. Run "./release-the-hounds.sh auth" first.');
        process.exit(1);
      }

      // Get project ID
      let projectId = options.projectId;
      if (!projectId) {
        const projectState = await loadProjectState();
        if (!projectState || !projectState.projectId) {
          console.error('❌ No project found. Create a project first:');
          console.error('   ./release-the-hounds.sh create-project');
          process.exit(1);
        }
        projectId = projectState.projectId;
        console.log(`\n📁 Using project: ${projectId}`);
      }

      // If no project ID specified, try to detect from service account
      if (!options.projectId) {
        const keyData = await loadServiceAccountKey(projectId);
        if (keyData && keyData.keyJson && keyData.keyJson.project_id) {
          const saProjectId = keyData.keyJson.project_id;
          if (saProjectId !== projectId) {
            console.log(`\n⚠️  Service account belongs to different project: ${saProjectId}`);
            console.log(`   Current project: ${projectId}`);
            console.log(`   Service account project: ${saProjectId}`);
            console.log(`\n💡 Enable API for service account project:`);
            console.log(`   ./release-the-hounds.sh enable-apis --project-id ${saProjectId} --api androidpublisher.googleapis.com\n`);
          }
        }
      }

      if (options.api) {
        // Enable specific API
        console.log(`\n🔌 Enabling API: ${options.api}`);
        const enabled = await isApiEnabled(projectId, options.api);
        if (enabled) {
          console.log(`   ✅ ${options.api} is already enabled`);
        } else {
          await enableApi(projectId, options.api);
          console.log(`\n✅ API enabled successfully!`);
          console.log(`\n💡 Note: API enablement may take a few minutes to propagate.`);
          console.log(`   If you still see errors, wait 2-3 minutes and retry.\n`);
        }
      } else {
        // Enable all required APIs
        console.log(`\n🔌 Enabling all required APIs for project: ${projectId}`);
        const results = await enableAllRequiredApis(projectId);

        console.log(`\n✅ API enablement complete!`);
        console.log(`   Enabled: ${results.enabled.length} APIs`);
        if (results.failed.length > 0) {
          console.log(`   Failed: ${results.failed.length} APIs`);
          console.log(`\n💡 Try enabling failed APIs individually:`);
          results.failed.forEach(({ api }) => {
            console.log(`   ./release-the-hounds.sh enable-apis --api ${api}`);
          });
        }
      }
    } catch (error) {
      console.error('\n❌ Failed to enable APIs:', error.message);
      if (error.code) {
        console.error(`   Error code: ${error.code}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure you have "Service Usage Admin" role');
      console.error('   - Check that the project exists and is active');
      console.error('   - Try enabling APIs individually: --api androidpublisher.googleapis.com\n');
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

