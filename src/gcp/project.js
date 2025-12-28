/**
 * Google Cloud Project management module
 * Handles project creation, activation polling, and project number retrieval
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/gcloud-auth.js';
import { writeJsonFile, readJsonFile } from '../utils/fs.js';
import { PATHS } from '../config.js';

/**
 * Generate unique project ID
 * Format: autoapp-{timestamp}-{random}
 */
export function generateProjectId(prefix = 'autoapp') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a new Google Cloud project
 * @param {string} projectId - Unique project ID
 * @param {string} displayName - Human-readable project name
 * @returns {Promise<Object>} Project details
 */
export async function createProject(projectId, displayName) {
  const authClient = await getAuthenticatedClient();
  const crm = google.cloudresourcemanager({
    version: 'v1',
    auth: authClient
  });

  console.log(`\n🏗️  Creating Google Cloud project: ${projectId}`);
  console.log(`   Display name: ${displayName}`);

  try {
    // Create project
    const createResponse = await crm.projects.create({
      requestBody: {
        projectId,
        name: displayName
      }
    });

    // Extract operation name for polling
    const operationName = createResponse.data.name;
    console.log(`   Operation: ${operationName}`);

    // Poll for project activation
    const project = await pollProjectActivation(crm, operationName, projectId);
    
    console.log(`✅ Project created successfully!`);
    console.log(`   Project ID: ${project.projectId}`);
    console.log(`   Project Number: ${project.projectNumber}`);
    console.log(`   State: ${project.lifecycleState}`);

    // Save project state
    await saveProjectState(project);

    return project;
  } catch (error) {
    if (error.code === 409) {
      throw new Error(`Project ${projectId} already exists. Please choose a different project ID.`);
    }
    if (error.code === 403) {
      throw new Error('Permission denied. Ensure your account has permission to create projects.');
    }
    throw new Error(`Failed to create project: ${error.message}`);
  }
}

/**
 * Poll for project activation
 * Projects can take a few seconds to become ACTIVE
 */
async function pollProjectActivation(crm, operationName, projectId, maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check operation status
      const operation = await crm.operations.get({
        name: operationName
      });

      if (operation.data.done) {
        // Operation complete, get project details
        const project = await crm.projects.get({
          projectId
        });

        if (project.data.lifecycleState === 'ACTIVE') {
          return project.data;
        }

        // Project exists but not active yet
        if (attempt < maxAttempts) {
          await sleep(2000); // Wait 2 seconds
          continue;
        }
      } else {
        // Operation still in progress
        if (attempt < maxAttempts) {
          process.stdout.write('.');
          await sleep(2000); // Wait 2 seconds
          continue;
        }
      }
    } catch (error) {
      // If operation not found, try getting project directly
      if (error.code === 404 && attempt > 5) {
        try {
          const project = await crm.projects.get({
            projectId
          });
          if (project.data.lifecycleState === 'ACTIVE') {
            return project.data;
          }
        } catch (getError) {
          // Continue polling
        }
      }

      if (attempt < maxAttempts) {
        await sleep(2000);
        continue;
      }
    }
  }

  throw new Error('Project creation timed out. Project may still be activating.');
}

/**
 * Get project details
 */
export async function getProject(projectId) {
  const authClient = await getAuthenticatedClient();
  const crm = google.cloudresourcemanager({
    version: 'v1',
    auth: authClient
  });

  try {
    const response = await crm.projects.get({
      projectId
    });
    return response.data;
  } catch (error) {
    if (error.code === 404) {
      throw new Error(`Project ${projectId} not found`);
    }
    throw new Error(`Failed to get project: ${error.message}`);
  }
}

/**
 * List all projects accessible by the authenticated user
 */
export async function listProjects() {
  const authClient = await getAuthenticatedClient();
  const crm = google.cloudresourcemanager({
    version: 'v1',
    auth: authClient
  });

  try {
    const response = await crm.projects.list({
      filter: 'lifecycleState:ACTIVE'
    });
    return response.data.projects || [];
  } catch (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
}

/**
 * Save project state to file
 */
async function saveProjectState(project) {
  const state = {
    projectId: project.projectId,
    projectNumber: project.projectNumber,
    name: project.name,
    lifecycleState: project.lifecycleState,
    created_at: new Date().toISOString()
  };

  // Load existing state or create new
  const existingState = await readJsonFile(PATHS.STATE_FILE) || {};
  existingState.currentProject = state;

  await writeJsonFile(PATHS.STATE_FILE, existingState);
}

/**
 * Switch to a different GCP project (update project state)
 * @param {string} projectId - GCP project ID to switch to
 * @returns {Promise<Object>} Project details
 */
export async function switchProject(projectId) {
  const project = await getProject(projectId);
  await saveProjectState(project);
  return project;
}

/**
 * Load current project state
 */
export async function loadProjectState() {
  const state = await readJsonFile(PATHS.STATE_FILE);
  return state?.currentProject || null;
}

/**
 * Save application-specific configuration (like bucketId)
 * @param {string} packageName - Android package name
 * @param {Object} config - Configuration object
 */
export async function saveAppConfig(packageName, config) {
  const state = await readJsonFile(PATHS.STATE_FILE) || {};
  if (!state.appConfigs) {
    state.appConfigs = {};
  }
  state.appConfigs[packageName] = {
    ...state.appConfigs[packageName],
    ...config,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(PATHS.STATE_FILE, state);
}

/**
 * Load application-specific configuration
 * @param {string} packageName - Android package name
 * @returns {Promise<Object|null>} App config
 */
export async function loadAppConfig(packageName) {
  const state = await readJsonFile(PATHS.STATE_FILE);
  return state?.appConfigs?.[packageName] || null;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

