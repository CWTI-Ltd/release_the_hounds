/**
 * Service Account management module
 * Handles creation, key generation, and storage of service accounts
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/gcloud-auth.js';
import { loadProjectState } from './project.js';
import { writeJsonFile, readJsonFile, ensureDir } from '../utils/fs.js';
import { PATHS } from '../config.js';

/**
 * Create a service account
 * @param {string} projectId - GCP project ID
 * @param {string} accountId - Service account ID (without @projectId.iam.gserviceaccount.com)
 * @param {string} displayName - Human-readable display name
 * @returns {Promise<Object>} Service account details
 */
export async function createServiceAccount(projectId, accountId, displayName) {
  const authClient = await getAuthenticatedClient();
  const iam = google.iam({
    version: 'v1',
    auth: authClient
  });

  const serviceAccountEmail = `${accountId}@${projectId}.iam.gserviceaccount.com`;

  console.log(`\n👤 Creating service account: ${serviceAccountEmail}`);
  console.log(`   Display name: ${displayName}`);

  try {
    // Check if service account already exists
    try {
      const existing = await iam.projects.serviceAccounts.get({
        name: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`
      });
      
      console.log(`   ⚠️  Service account already exists`);
      console.log(`   ✅ Using existing service account: ${serviceAccountEmail}`);
      return existing.data;
    } catch (error) {
      if (error.code !== 404) {
        throw error;
      }
      // Service account doesn't exist, continue with creation
    }

    // Create service account
    const response = await iam.projects.serviceAccounts.create({
      name: `projects/${projectId}`,
      requestBody: {
        accountId: accountId,
        serviceAccount: {
          displayName: displayName,
          description: 'Service account for Release The Hounds automation'
        }
      }
    });

    const serviceAccount = response.data;
    console.log(`   ✅ Service account created successfully!`);
    console.log(`   Email: ${serviceAccount.email}`);
    console.log(`   Unique ID: ${serviceAccount.uniqueId}`);

    return serviceAccount;
  } catch (error) {
    if (error.code === 409) {
      throw new Error(`Service account ${serviceAccountEmail} already exists. Use a different account ID or delete the existing one.`);
    }
    if (error.code === 403) {
      throw new Error('Permission denied. Ensure your account has "Service Account Admin" role.');
    }
    throw new Error(`Failed to create service account: ${error.message}`);
  }
}

/**
 * Generate and download service account key
 * @param {string} projectId - GCP project ID
 * @param {string} serviceAccountEmail - Full service account email
 * @returns {Promise<Object>} Service account key JSON
 */
export async function createServiceAccountKey(projectId, serviceAccountEmail) {
  const authClient = await getAuthenticatedClient();
  const iam = google.iam({
    version: 'v1',
    auth: authClient
  });

  console.log(`\n🔑 Generating service account key...`);
  console.log(`   Service account: ${serviceAccountEmail}`);

  try {
    const response = await iam.projects.serviceAccounts.keys.create({
      name: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
      requestBody: {
        keyAlgorithm: 'KEY_ALG_RSA_2048',
        privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE'
      }
    });

    // The response contains the key data as base64
    const keyData = Buffer.from(response.data.privateKeyData, 'base64').toString('utf-8');
    const keyJson = JSON.parse(keyData);

    console.log(`   ✅ Key generated successfully`);
    console.log(`   Key ID: ${response.data.name.split('/').pop()}`);

    return keyJson;
  } catch (error) {
    if (error.code === 403) {
      throw new Error('Permission denied. Ensure your account has "Service Account Key Admin" role.');
    }
    throw new Error(`Failed to generate service account key: ${error.message}`);
  }
}

/**
 * Save service account key to file
 */
export async function saveServiceAccountKey(keyJson, projectId) {
  await ensureDir(PATHS.SERVICE_ACCOUNT_DIR);
  const keyPath = `${PATHS.SERVICE_ACCOUNT_DIR}/service-account-${projectId}.json`;
  
  console.log(`\n💾 Saving service account key...`);
  console.log(`   Path: ${keyPath}`);

  await writeJsonFile(keyPath, keyJson);

  // Also update state
  const state = await readJsonFile(PATHS.STATE_FILE) || {};
  state.serviceAccount = {
    email: keyJson.client_email,
    keyPath: keyPath,
    projectId: projectId,
    created_at: new Date().toISOString()
  };
  await writeJsonFile(PATHS.STATE_FILE, state);

  console.log(`   ✅ Key saved securely`);
  console.log(`   ⚠️  Keep this file secret! It's already in .gitignore`);

  return keyPath;
}

/**
 * Load service account key from file
 */
export async function loadServiceAccountKey(projectId) {
  const keyPath = `${PATHS.SERVICE_ACCOUNT_DIR}/service-account-${projectId}.json`;
  const keyJson = await readJsonFile(keyPath);
  
  if (!keyJson) {
    return null;
  }

  return {
    keyJson,
    keyPath
  };
}

/**
 * Create service account and generate key in one operation
 */
export async function setupServiceAccount(projectId, accountId = 'app-publisher', displayName = 'Release The Hounds Service Account') {
  try {
    // Create service account
    const serviceAccount = await createServiceAccount(projectId, accountId, displayName);

    // Generate key
    const keyJson = await createServiceAccountKey(projectId, serviceAccount.email);

    // Save key
    const keyPath = await saveServiceAccountKey(keyJson, projectId);

    return {
      serviceAccount,
      keyJson,
      keyPath
    };
  } catch (error) {
    console.error(`\n❌ Service account setup failed: ${error.message}`);
    throw error;
  }
}

