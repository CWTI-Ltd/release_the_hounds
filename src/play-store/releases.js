/**
 * Play Store release management
 * Handles AAB/APK uploads
 */

import { getPlayStoreClient } from './auth.js';
import { createEdit, getExistingEdit } from './edits.js';
import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * Upload AAB (Android App Bundle) to Play Console
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {string} aabPath - Path to AAB file
 * @returns {Promise<Object>} Upload result with version info
 */
export async function uploadAAB(packageName, editId, aabPath) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n📦 Uploading AAB: ${aabPath}`);

  try {
    // Read AAB file
    const aabFile = await readFile(aabPath);

    // Upload AAB
    const response = await androidpublisher.edits.bundles.upload({
      packageName: packageName,
      editId: editId,
      media: {
        mimeType: 'application/octet-stream',
        body: aabFile
      }
    });

    const versionCode = response.data.versionCode;
    const versionName = response.data.versionName || `version-${versionCode}`;

    console.log(`   ✅ AAB uploaded successfully`);
    console.log(`   Version Code: ${versionCode}`);
    console.log(`   Version Name: ${versionName}`);

    return {
      versionCode: versionCode,
      versionName: versionName,
      sha1: response.data.sha1
    };
  } catch (error) {
    if (error.code === 400) {
      throw new Error(`Invalid AAB file: ${error.message}`);
    }
    throw new Error(`Failed to upload AAB: ${error.message}`);
  }
}

/**
 * Upload APK to Play Console
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {string} apkPath - Path to APK file
 * @returns {Promise<Object>} Upload result with version info
 */
export async function uploadAPK(packageName, editId, apkPath) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n📦 Uploading APK: ${apkPath}`);

  try {
    // Read APK file
    const apkFile = await readFile(apkPath);

    // Upload APK
    const response = await androidpublisher.edits.apks.upload({
      packageName: packageName,
      editId: editId,
      media: {
        mimeType: 'application/vnd.android.package-archive',
        body: apkFile
      }
    });

    const versionCode = response.data.versionCode;

    console.log(`   ✅ APK uploaded successfully`);
    console.log(`   Version Code: ${versionCode}`);

    return {
      versionCode: versionCode,
      sha1: response.data.sha1,
      sha256: response.data.sha256
    };
  } catch (error) {
    if (error.code === 400) {
      throw new Error(`Invalid APK file: ${error.message}`);
    }
    throw new Error(`Failed to upload APK: ${error.message}`);
  }
}

/**
 * Upload AAB or APK (auto-detect file type)
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {string} filePath - Path to AAB or APK file
 * @returns {Promise<Object>} Upload result
 */
export async function uploadBuild(packageName, editId, filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.aab') {
    return await uploadAAB(packageName, editId, filePath);
  } else if (ext === '.apk') {
    return await uploadAPK(packageName, editId, filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Expected .aab or .apk`);
  }
}

/**
 * Upload build and create edit session if needed
 * IMPORTANT: If app doesn't exist yet, uploading the first AAB/APK will
 * automatically create the app in Play Console.
 * 
 * @param {string} packageName - Android package name
 * @param {string} filePath - Path to AAB or APK file
 * @returns {Promise<Object>} Upload result with editId
 */
export async function uploadBuildWithEdit(packageName, filePath) {
  // Try to get existing edit, or create new one
  let editId = await getExistingEdit(packageName);
  
  if (!editId) {
    try {
      editId = await createEdit(packageName);
    } catch (error) {
      // If edit creation fails with 404, app doesn't exist yet
      // According to Play Store API docs, we can still create an edit for a new app
      // The app will be created when we upload the first build
      if (error.code === 404 || error.message.includes('not found') || error.message.includes('Package not found')) {
        console.log(`   ℹ️  App doesn't exist yet - creating edit session for new app...`);
        // For new apps, we need to create the edit session anyway
        // The API should allow this - the app gets created on first upload
        // If this still fails, it's likely a permissions issue
        try {
          // Retry once - sometimes the API needs a moment
          await new Promise(resolve => setTimeout(resolve, 1000));
          editId = await createEdit(packageName);
        } catch (retryError) {
          // If we still can't create an edit, the first build must be uploaded manually
          // This is a Play Store API limitation - draft apps aren't "active" until first build is uploaded via UI
          throw new Error(
            `Cannot create edit session. The Play Store API requires the first build to be uploaded manually.\n\n` +
            `Even though you created a draft app, you must upload the first build through the Play Console UI:\n\n` +
            `1. Go to https://play.google.com/console\n` +
            `2. Select your app: ${packageName}\n` +
            `3. Go to "Release" → "Internal testing" → "Create new release"\n` +
            `4. Upload your AAB file: ${filePath}\n` +
            `5. Click "Save" (don't need to publish yet)\n\n` +
            `After this first manual upload, your app will be "activated" and CI/CD can handle all future uploads.\n` +
            `This is a one-time manual step required by Google Play Store.\n`
          );
        }
      } else {
        throw error;
      }
    }
  }

  if (!editId) {
    throw new Error('Failed to create edit session. Cannot upload build.');
  }

  // Upload build - this will create the app if it doesn't exist
  const uploadResult = await uploadBuild(packageName, editId, filePath);

  return {
    ...uploadResult,
    editId: editId
  };
}

