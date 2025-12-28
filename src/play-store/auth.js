/**
 * Play Store authentication module
 * Handles Android Publisher API authentication using service account
 */

import { google } from 'googleapis';
import { loadServiceAccountKey } from '../gcp/service-account.js';
import { loadProjectState } from '../gcp/project.js';

/**
 * Get authenticated Android Publisher API client
 * Uses service account key for authentication
 * @param {string} projectId - GCP project ID
 * @returns {Promise<Object>} Authenticated androidpublisher client
 */
export async function getPlayStoreClient(projectId = null) {
  // Load project state if projectId not provided
  if (!projectId) {
    const projectState = await loadProjectState();
    if (!projectState || !projectState.projectId) {
      throw new Error('No project found. Create a project first: ./release-the-hounds.sh create-project');
    }
    projectId = projectState.projectId;
  }

  // Load service account key
  const serviceAccountData = await loadServiceAccountKey(projectId);
  if (!serviceAccountData || !serviceAccountData.keyJson) {
    throw new Error(`Service account key not found for project ${projectId}. Run: ./release-the-hounds.sh setup-service-account`);
  }

  const serviceAccountKey = serviceAccountData.keyJson;

  // Create JWT auth client for Android Publisher API and Storage (for reports)
  const auth = new google.auth.JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: [
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/devstorage.read_only'
    ]
  });

  // Create Android Publisher API client
  const androidpublisher = google.androidpublisher({
    version: 'v3',
    auth: auth
  });

  return androidpublisher;
}

/**
 * Verify service account has Play Console access
 * Note: This checks if we can make API calls, but Play Console permissions
 * must be granted manually in Play Console UI
 * @param {string} projectId - GCP project ID
 * @returns {Promise<boolean>} True if access verified
 */
export async function verifyPlayConsoleAccess(projectId = null) {
  try {
    const androidpublisher = await getPlayStoreClient(projectId);
    
    // Load project state if projectId not provided
    if (!projectId) {
      const projectState = await loadProjectState();
      projectId = projectState?.projectId;
    }
    
    const serviceAccountData = await loadServiceAccountKey(projectId);
    const serviceAccountEmail = serviceAccountData?.keyJson?.client_email;
    
    // Try to list reviews (this will fail if service account doesn't have Play Console access)
    // We use list instead of something more intensive
    await androidpublisher.reviews.list({
      packageName: 'com.any.package', // Doesn't matter, we just check for 403 vs 404
      maxResults: 1
    }).catch(err => {
      // 404 means we have access but app doesn't exist
      // 403 means no access
      if (err.code === 403) throw err;
    });

    return true;
  } catch (error) {
    if (!projectId) {
      const projectState = await loadProjectState();
      projectId = projectState?.projectId;
    }
    const serviceAccountData = await loadServiceAccountKey(projectId);
    const serviceAccountEmail = serviceAccountData?.keyJson?.client_email || 'check .autopublish/state.json';
    
    if (error.code === 403 || error.message.includes('permission') || error.message.includes('access')) {
      throw new Error(
        `Service account does not have Play Console access.\n` +
        `Please grant access manually:\n` +
        `1. Go to Play Console → Settings → Users & Permissions\n` +
        `2. Add service account: ${serviceAccountEmail}\n` +
        `3. Grant "Admin" or "Release" permissions\n`
      );
    }
    throw error;
  }
}

