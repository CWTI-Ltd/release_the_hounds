import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AdbService } from './adb-service.js';
import * as projectModule from '../gcp/project.js';
import * as firebaseModule from '../firebase/project.js';
import * as reviewModule from '../play-store/reviews.js';
import * as saModule from '../gcp/service-account.js';
import * as iamModule from '../gcp/iam.js';
import * as configGenModule from '../play-store/config-generator.js';
import * as configLoaderModule from '../play-store/config-loader.js';
import * as psAppModule from '../play-store/app.js';
import * as psAuthModule from '../play-store/auth.js';
import * as metadataModule from '../play-store/metadata.js';
import * as graphicsModule from '../play-store/graphics.js';
import * as editsModule from '../play-store/edits.js';
import { checkAuthStatus as checkGcloudStatus } from '../auth/gcloud-auth.js';
import { checkAllDependencies } from '../utils/check-dependencies.js';

// Redirect console.log to console.error to prevent stdout corruption in MCP stdio mode
const originalLog = console.log;
console.log = (...args) => console.error(...args);

const adbService = new AdbService();
const DEFAULT_TIMEOUT_MS = 15000;

function log(msg, extra) {
  const time = new Date().toISOString();
  if (extra !== undefined) {
    console.error(`[rth-mcp] ${time} ${msg}`, extra);
  } else {
    console.error(`[rth-mcp] ${time} ${msg}`);
  }
}

async function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function parseBounds(bounds) {
  if (!bounds) return null;
  const match = bounds.match(/\[(\d+),(\d+)]\[(\d+),(\d+)]/);
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
}

function findNode(node, text, contentDesc) {
  const matchesText = text && node.text?.toLowerCase() === text.toLowerCase();
  const matchesDesc =
    contentDesc && node.contentDesc?.toLowerCase() === contentDesc.toLowerCase();
  if (matchesText || matchesDesc) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, text, contentDesc);
    if (found) return found;
  }
  return null;
}

const server = new McpServer({
  name: 'release-the-hounds',
  version: '1.0.0',
});

const optionalSerial = z.string().optional();

// --- System Tools ---

server.registerTool(
  'system_checkDeps',
  {
    description: 'Check if all required dependencies are installed',
    inputSchema: z.object({}),
  },
  async () => {
    const results = await checkAllDependencies();
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  },
);

server.registerTool(
  'gcloud_status',
  {
    description: 'Check Google Cloud authentication status',
    inputSchema: z.object({}),
  },
  async () => {
    const status = await checkGcloudStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  },
);

// --- ADB Tools ---

server.registerTool(
  'adb_selectDevice',
  {
    description: 'Set default Android device by serial',
    inputSchema: z.object({ serial: z.string() }),
  },
  async ({ serial }) => {
    adbService.setDefaultDevice(serial);
    return { content: [{ type: 'text', text: `selected=${serial ?? 'none'}` }] };
  },
);

server.registerTool(
  'adb_tap',
  {
    description: 'Tap coordinates on Android device',
    inputSchema: z.object({ x: z.number(), y: z.number(), serial: optionalSerial }),
  },
  async ({ x, y, serial }) => {
    await withTimeout(adbService.tap(Number(x), Number(y), serial));
    return { content: [{ type: 'text', text: 'ok' }] };
  },
);

server.registerTool(
  'adb_screenshot',
  {
    description: 'Capture PNG screenshot from Android device',
    inputSchema: z.object({ serial: optionalSerial }),
  },
  async ({ serial }) => {
    const png = await adbService.takeScreenshot(serial);
    return {
      content: [
        {
          type: 'image',
          data: png.toString('base64'),
          mimeType: 'image/png',
        },
      ],
    };
  },
);

server.registerTool(
  'adb_uiDump',
  {
    description: 'Dump UI tree from Android device via uiautomator',
    inputSchema: z.object({ serial: optionalSerial }),
  },
  async ({ serial }) => {
    const tree = await withTimeout(adbService.uiDump(serial));
    return { content: [{ type: 'text', text: JSON.stringify(tree) }] };
  },
);

// --- GCP / Project Tools ---

server.registerTool(
  'gcp_listProjects',
  {
    description: 'List accessible Google Cloud projects',
    inputSchema: z.object({}),
  },
  async () => {
    const projects = await projectModule.listProjects();
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  },
);

server.registerTool(
  'gcp_getCurrentProject',
  {
    description: 'Get currently selected project from state',
    inputSchema: z.object({}),
  },
  async () => {
    const project = await projectModule.loadProjectState();
    return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
  },
);

server.registerTool(
  'gcp_switchProject',
  {
    description: 'Switch the active GCP project in state',
    inputSchema: z.object({
      projectId: z.string().describe('The GCP project ID to switch to')
    }),
  },
  async ({ projectId }) => {
    await projectModule.switchProject(projectId);
    return { content: [{ type: 'text', text: `Switched current project to: ${projectId}` }] };
  },
);

server.registerTool(
  'gcp_createProject',
  {
    description: 'Create a new GCP project (full pipeline)',
    inputSchema: z.object({
      projectId: z.string().describe('Unique project ID'),
      name: z.string().describe('Project display name')
    }),
  },
  async ({ projectId, name }) => {
    const project = await projectModule.createProject(projectId, name);
    return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
  },
);

server.registerTool(
  'gcp_enableApis',
  {
    description: 'Enable required APIs for a project',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID')
    }),
  },
  async ({ projectId }) => {
    const result = await projectModule.enableAllRequiredApis(projectId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'gcp_setupServiceAccount',
  {
    description: 'Create a service account and download its key',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID'),
      accountId: z.string().default('app-publisher'),
      displayName: z.string().default('Release The Hounds Service Account')
    }),
  },
  async ({ projectId, accountId, displayName }) => {
    const result = await saModule.setupServiceAccount(projectId, accountId, displayName);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'gcp_grantRoles',
  {
    description: 'Grant required IAM roles to a service account',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID'),
      serviceAccountEmail: z.string().describe('Service account email')
    }),
  },
  async ({ projectId, serviceAccountEmail }) => {
    const result = await iamModule.grantAllRequiredRoles(projectId, serviceAccountEmail);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'gcp_getServiceAccountKey',
  {
    description: 'Load existing service account key for a project',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID')
    }),
  },
  async ({ projectId }) => {
    const keyData = await saModule.loadServiceAccountKey(projectId);
    return { content: [{ type: 'text', text: JSON.stringify(keyData, null, 2) }] };
  },
);

// --- Firebase Tools ---

server.registerTool(
  'firebase_setup',
  {
    description: 'Setup Firebase for a project',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID'),
      displayName: z.string().describe('Firebase project display name')
    }),
  },
  async ({ projectId, displayName }) => {
    const project = await firebaseModule.createOrLinkFirebaseProject(projectId, displayName, false);
    return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
  },
);

server.registerTool(
  'firebase_addAndroidApp',
  {
    description: 'Register an Android app in Firebase',
    inputSchema: z.object({
      projectId: z.string().describe('GCP project ID'),
      packageName: z.string().describe('Android package name'),
      displayName: z.string().describe('App display name')
    }),
  },
  async ({ projectId, packageName, displayName }) => {
    const app = await firebaseModule.addAndroidApp(projectId, packageName, displayName);
    return { content: [{ type: 'text', text: JSON.stringify(app, null, 2) }] };
  },
);

// --- Play Store Tools ---

server.registerTool(
  'playStore_listUnrepliedReviews',
  {
    description: 'List unreplied reviews for an app (Last 7 days only)',
    inputSchema: z.object({
      packageName: z.string().describe('The Android package name')
    }),
  },
  async ({ packageName }) => {
    const reviews = await reviewModule.getUnrepliedReviews(packageName);
    return { content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }] };
  },
);

server.registerTool(
  'playStore_getReview',
  {
    description: 'Get details for a specific review by ID',
    inputSchema: z.object({
      packageName: z.string().describe('The Android package name'),
      reviewId: z.string().describe('The review ID')
    }),
  },
  async ({ packageName, reviewId }) => {
    const review = await reviewModule.getReview(packageName, reviewId);
    return { content: [{ type: 'text', text: JSON.stringify(review, null, 2) }] };
  },
);

server.registerTool(
  'playStore_listHistoryReports',
  {
    description: 'List historical review report files from Cloud Storage (Bypasses 7-day limit)',
    inputSchema: z.object({
      bucketId: z.string().optional().describe('The Bucket ID (e.g. pubsite_prod_rev_...). Defaults to stored app config.'),
      packageName: z.string().describe('The Android package name')
    }),
  },
  async ({ bucketId, packageName }) => {
    let targetBucketId = bucketId;
    if (!targetBucketId) {
      const appConfig = await projectModule.loadAppConfig(packageName);
      targetBucketId = appConfig?.bucketId;
    }

    if (!targetBucketId) {
      throw new Error(`Bucket ID not provided and no stored config found for ${packageName}. Use playStore_setAppConfig to store it.`);
    }

    const reports = await reviewModule.listHistoryReports(targetBucketId, packageName);
    return { content: [{ type: 'text', text: JSON.stringify(reports, null, 2) }] };
  },
);

server.registerTool(
  'playStore_getUnrepliedFromReport',
  {
    description: 'Download and parse a historical report to find unreplied reviews',
    inputSchema: z.object({
      bucketId: z.string().optional().describe('The Bucket ID. Defaults to stored app config.'),
      packageName: z.string().optional().describe('Android package name (required if bucketId is omitted)'),
      reportName: z.string().describe('The path to the report file in the bucket'),
      minDate: z.string().optional().describe('Minimum date to include (YYYY-MM-DD)'),
      skipIds: z.array(z.string()).optional().describe('List of Review IDs to skip')
    }),
  },
  async ({ bucketId, packageName, reportName, minDate, skipIds }) => {
    let targetBucketId = bucketId;
    if (!targetBucketId && packageName) {
      const appConfig = await projectModule.loadAppConfig(packageName);
      targetBucketId = appConfig?.bucketId;
    }

    if (!targetBucketId) {
      throw new Error(`Bucket ID not provided and could not be resolved from stored config.`);
    }

    const reviews = await reviewModule.getReviewsFromReport(targetBucketId, reportName);
    const unreplied = reviews.filter(r => {
      if (r.hasReply || !r.text) return false;
      if (minDate && r.submitDate < minDate) return false;
      if (skipIds && skipIds.includes(r.reviewId)) return false;
      return true;
    });
    
    return { content: [{ type: 'text', text: JSON.stringify(unreplied, null, 2) }] };
  },
);

server.registerTool(
  'playStore_setAppConfig',
  {
    description: 'Save application-specific configuration (e.g. bucketId) for future sessions',
    inputSchema: z.object({
      packageName: z.string().describe('Android package name'),
      bucketId: z.string().optional().describe('The Google Cloud Storage bucket ID for reports'),
    }),
  },
  async ({ packageName, bucketId }) => {
    const config = {};
    if (bucketId) config.bucketId = bucketId;

    await projectModule.saveAppConfig(packageName, config);
    return { content: [{ type: 'text', text: `Configuration saved for ${packageName}` }] };
  },
);

server.registerTool(
  'playStore_searchAllHistory',
  {
    description: 'Search all historical monthly reports for unreplied reviews within a date range',
    inputSchema: z.object({
      packageName: z.string().describe('The Android package name'),
      bucketId: z.string().optional().describe('The Bucket ID. Defaults to stored app config.'),
      minDate: z.string().optional().describe('Minimum date (YYYY-MM-DD)'),
      maxDate: z.string().optional().describe('Maximum date (YYYY-MM-DD)')
    }),
  },
  async ({ packageName, bucketId, minDate, maxDate }) => {
    let targetBucketId = bucketId;
    if (!targetBucketId) {
      const appConfig = await projectModule.loadAppConfig(packageName);
      targetBucketId = appConfig?.bucketId;
    }

    if (!targetBucketId) {
      throw new Error(`Bucket ID not provided and could not be resolved from stored config.`);
    }

    const unreplied = await reviewModule.searchAllHistory(targetBucketId, packageName, { minDate, maxDate });
    return { content: [{ type: 'text', text: JSON.stringify(unreplied, null, 2) }] };
  },
);

server.registerTool(
  'playStore_checkStorageAccess',
  {
    description: 'Check if the service account has the required Bulk Report permission for the bucket',
    inputSchema: z.object({
      bucketId: z.string().describe('The Bucket ID (e.g. pubsite_prod_rev_...)')
    }),
  },
  async ({ bucketId }) => {
    try {
      await reviewModule.listHistoryReports(bucketId, 'any');
      return { content: [{ type: 'text', text: "✅ Access verified! The service account has the required permissions." }] };
    } catch (error) {
      return { 
        content: [{ 
          type: 'text', 
          text: `❌ Access denied: ${error.message}\n\nTo fix this:\n1. Go to Play Console -> Users & Permissions\n2. Select account: app-publisher@...\n3. Go to "Account permissions" tab\n4. Check "View app information and download bulk reports (read only)"\n5. Save changes.` 
        }] 
      };
    }
  },
);

server.registerTool(
  'playStore_batchReply',
  {
    description: 'Reply to multiple reviews at once (autonomous batch processing)',
    inputSchema: z.object({
      packageName: z.string().describe('The Android package name'),
      replies: z.array(z.object({
        reviewId: z.string().describe('The review ID'),
        replyText: z.string().describe('The text of the reply')
      })).describe('Array of replies to post')
    }),
  },
  async ({ packageName, replies }) => {
    const results = [];
    for (const item of replies) {
      log(`Batch reply for ${item.reviewId}`);
      try {
        const res = await reviewModule.replyToReview(packageName, item.reviewId, item.replyText);
        results.push({ reviewId: item.reviewId, status: 'success', result: res });
      } catch (err) {
        results.push({ reviewId: item.reviewId, status: 'error', error: err.message });
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  },
);

server.registerTool(
  'playStore_replyToReview',
  {
    description: 'Post a reply to a review',
    inputSchema: z.object({
      packageName: z.string().describe('The Android package name'),
      reviewId: z.string().describe('The review ID to reply to'),
      replyText: z.string().describe('The text of the reply')
    }),
  },
  async ({ packageName, reviewId, replyText }) => {
    const result = await reviewModule.replyToReview(packageName, reviewId, replyText);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'playStore_verifyAccess',
  {
    description: 'Verify service account has Play Console access',
    inputSchema: z.object({
      projectId: z.string().optional().describe('GCP project ID (defaults to current project)')
    }),
  },
  async ({ projectId }) => {
    // If no projectId, use current from state
    if (!projectId) {
      const state = await projectModule.loadProjectState();
      projectId = state?.projectId;
    }
    const result = await psAuthModule.verifyPlayConsoleAccess(projectId);
    return { content: [{ type: 'text', text: JSON.stringify({ access: result, projectId }, null, 2) }] };
  },
);

server.registerTool(
  'playStore_generateConfigTemplate',
  {
    description: 'Generate a Play Store config template pre-filled with Firebase data',
    inputSchema: z.object({
      outputPath: z.string().optional().describe('Path to save the config file'),
      force: z.boolean().default(false).describe('Overwrite existing file')
    }),
  },
  async ({ outputPath, force }) => {
    const path = outputPath || configLoaderModule.getDefaultConfigPath();
    await configGenModule.generatePlayStoreConfigTemplate(path, force);
    return { content: [{ type: 'text', text: `Config template generated at: ${path}` }] };
  },
);

server.registerTool(
  'playStore_setMetadata',
  {
    description: 'Update app metadata in an edit session',
    inputSchema: z.object({
      packageName: z.string().describe('Android package name'),
      editId: z.string().describe('Edit session ID'),
      language: z.string().default('en-US'),
      metadata: z.object({
        title: z.string().optional(),
        shortDescription: z.string().optional(),
        fullDescription: z.string().optional()
      })
    }),
  },
  async ({ packageName, editId, language, metadata }) => {
    const result = await metadataModule.setListingMetadata(packageName, editId, language, metadata);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'playStore_createEdit',
  {
    description: 'Create a new Play Store edit session',
    inputSchema: z.object({
      packageName: z.string().describe('Android package name')
    }),
  },
  async ({ packageName }) => {
    const editId = await editsModule.createEdit(packageName);
    return { content: [{ type: 'text', text: editId }] };
  },
);

server.registerTool(
  'playStore_commitEdit',
  {
    description: 'Commit a Play Store edit session',
    inputSchema: z.object({
      packageName: z.string().describe('Android package name'),
      editId: z.string().describe('Edit session ID')
    }),
  },
  async ({ packageName, editId }) => {
    const result = await editsModule.commitEdit(packageName, editId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

async function main() {
  log('server start');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('server connected');
}

main().catch((err) => {
  log('fatal error', err);
  process.exit(1);
});


