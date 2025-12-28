/**
 * Play Store edit session management
 * Edit sessions are required for all Play Console operations
 */

import { getPlayStoreClient } from './auth.js';
import { readJsonFile, writeJsonFile } from '../utils/fs.js';
import { PATHS } from '../config.js';

/**
 * Create a new edit session
 * Edit sessions expire after 1 hour
 * @param {string} packageName - Android package name
 * @returns {Promise<string>} Edit ID
 */
export async function createEdit(packageName) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n📝 Creating edit session for ${packageName}...`);

  try {
    const response = await androidpublisher.edits.insert({
      packageName: packageName
    });

    const editId = response.data.id;
    console.log(`   ✅ Edit session created: ${editId}`);

    // Save edit ID to state
    await saveEditState(packageName, editId);

    return editId;
  } catch (error) {
    if (error.code === 404) {
      throw new Error(`App ${packageName} not found in Play Console. Create the app first.`);
    }
    throw new Error(`Failed to create edit session: ${error.message}`);
  }
}

/**
 * Get existing edit ID from state (if available and not expired)
 * @param {string} packageName - Android package name
 * @returns {Promise<string|null>} Edit ID or null if not found/expired
 */
export async function getExistingEdit(packageName) {
  const state = await readJsonFile(PATHS.STATE_FILE);
  const editState = state?.playStore?.edits?.[packageName];
  
  if (!editState || !editState.editId) {
    return null;
  }

  // Check if edit is expired (edits expire after 1 hour)
  const createdAt = new Date(editState.createdAt);
  const now = new Date();
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

  if (hoursSinceCreation >= 1) {
    console.log(`   ℹ️  Previous edit session expired, creating new one...`);
    return null;
  }

  return editState.editId;
}

/**
 * Validate edit before committing
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit ID
 * @returns {Promise<Object>} Validation result
 */
export async function validateEdit(packageName, editId) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n🔍 Validating edit ${editId}...`);

  try {
    const response = await androidpublisher.edits.validate({
      packageName: packageName,
      editId: editId
    });

    if (response.data) {
      console.log(`   ✅ Edit validated successfully`);
      return response.data;
    }

    return { valid: true };
  } catch (error) {
    // Validation might require additional permissions or might not be available
    // Log warning but don't fail - we can still commit without validation
    if (error.code === 403 || error.message.includes('permission')) {
      console.log(`   ⚠️  Validation requires additional permissions (skipping)`);
      console.log(`   ℹ️  Edit will be committed without validation`);
      console.log(`\n   💡 To enable validation, grant "Admin" role to your service account:`);
      console.log(`      Run: rth grant-play-console-access --open`);
      console.log(`      Then grant "Admin" role (includes validation permissions)\n`);
      return { valid: true, skipped: true, reason: 'permission_required' };
    }
    // For other errors, still log but don't fail
    console.log(`   ⚠️  Validation failed: ${error.message}`);
    console.log(`   ℹ️  Edit will be committed anyway`);
    return { valid: true, skipped: true, reason: error.message };
  }
}

/**
 * Commit edit (publishes changes)
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit ID
 * @returns {Promise<Object>} Commit result
 */
export async function commitEdit(packageName, editId) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n🚀 Committing edit ${editId}...`);

  try {
    const response = await androidpublisher.edits.commit({
      packageName: packageName,
      editId: editId
    });

    console.log(`   ✅ Edit committed successfully`);

    // Clear edit state after successful commit
    await clearEditState(packageName);

    return response.data;
  } catch (error) {
    // Check for specific error about draft app
    if (error.message.includes('draft app') || error.message.includes('Only releases with status draft')) {
      console.log(`\n   ⚠️  Cannot commit metadata: ${error.message}`);
      console.log(`\n   💡 This usually means:`);
      console.log(`      - The app is still in draft/unreviewed status, OR`);
      console.log(`      - The edit session expired (edits expire after 1 hour)`);
      console.log(`\n   ✅ Your metadata changes ARE saved in edit ${editId}!`);
      console.log(`   📋 They will be applied when:`);
      console.log(`      - You submit the app for review, OR`);
      console.log(`      - You create a new edit session and commit it (if you have a release)`);
      console.log(`\n   🔄 To try committing again:`);
      console.log(`      1. Run: rth publish-play-store`);
      console.log(`      2. This will create a new edit session and try to commit`);
      console.log(`      3. If you have a release in any track, it should work!\n`);
      
      // Return success since metadata is saved, just not committed yet
      return {
        success: true,
        committed: false,
        note: 'Metadata saved but not committed. Edit may have expired or app is in draft status.',
        editId: editId,
        error: error.message
      };
    }
    if (error.code === 400) {
      throw new Error(`Edit commit failed: ${error.message}. Try validating the edit first.`);
    }
    throw new Error(`Failed to commit edit: ${error.message}`);
  }
}

/**
 * Save edit state to file
 */
async function saveEditState(packageName, editId) {
  const state = await readJsonFile(PATHS.STATE_FILE) || {};
  
  if (!state.playStore) {
    state.playStore = {};
  }
  if (!state.playStore.edits) {
    state.playStore.edits = {};
  }

  state.playStore.edits[packageName] = {
    editId: editId,
    createdAt: new Date().toISOString()
  };

  await writeJsonFile(PATHS.STATE_FILE, state);
}

/**
 * Clear edit state
 */
async function clearEditState(packageName) {
  const state = await readJsonFile(PATHS.STATE_FILE) || {};
  
  if (state.playStore?.edits?.[packageName]) {
    delete state.playStore.edits[packageName];
    await writeJsonFile(PATHS.STATE_FILE, state);
  }
}

