/**
 * Play Store metadata management
 * Handles app listing metadata (title, descriptions, category, etc.)
 */

import { getPlayStoreClient } from './auth.js';

/**
 * Set store listing metadata
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {string} language - Language code (e.g., 'en-US')
 * @param {Object} metadata - Metadata object
 * @param {string} metadata.title - App title (max 50 chars)
 * @param {string} metadata.shortDescription - Short description (max 80 chars)
 * @param {string} metadata.fullDescription - Full description (max 4000 chars)
 * @param {string} metadata.category - App category (e.g., 'APPLICATION_PRODUCTIVITY')
 * @param {string} metadata.privacyPolicyUrl - Privacy policy URL
 * @returns {Promise<Object>} Updated listing
 */
export async function setListingMetadata(packageName, editId, language, metadata) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n📝 Setting store listing metadata (${language})...`);

  // Validate metadata
  validateMetadata(metadata);

  try {
    // First, get current listing to see what fields are available
    let currentListing = null;
    try {
      const currentResponse = await androidpublisher.edits.listings.get({
        packageName: packageName,
        editId: editId,
        language: language
      });
      currentListing = currentResponse.data;
    } catch (error) {
      // If listing doesn't exist yet, that's okay - we'll create it
      console.log(`   ℹ️  Creating new listing for ${language}`);
    }

    const listing = {
      title: metadata.title,
      shortDescription: metadata.shortDescription,
      fullDescription: metadata.fullDescription
    };

    // Update listing
    let response;
    try {
      response = await androidpublisher.edits.listings.update({
        packageName: packageName,
        editId: editId,
        language: language,
        requestBody: listing
      });
    } catch (error) {
      throw new Error(`Failed to update listing: ${error.message}`);
    }

    // Verify what was actually saved by getting the listing back
    let savedTitle = null;
    let savedShortDesc = null;
    let savedFullDesc = null;
    try {
      const savedListing = await androidpublisher.edits.listings.get({
        packageName: packageName,
        editId: editId,
        language: language
      });
      savedTitle = savedListing.data?.title;
      savedShortDesc = savedListing.data?.shortDescription;
      savedFullDesc = savedListing.data?.fullDescription;
    } catch (error) {
      // Ignore verification errors
    }

    console.log(`   ✅ Listing metadata updated`);
    if (savedTitle) {
      console.log(`      ✅ Title: "${savedTitle}"`);
    }
    if (savedShortDesc) {
      console.log(`      ✅ Short description: "${savedShortDesc.substring(0, 60)}..."`);
    }
    if (savedFullDesc) {
      console.log(`      ✅ Full description: ${savedFullDesc.length} characters`);
    }

    // Privacy policy URL and category cannot be set via API (Google limitation)
    // These fields are no longer in the config, but if someone has old config, ignore them

    return response.data;
  } catch (error) {
    throw new Error(`Failed to set listing metadata: ${error.message}`);
  }
}

/**
 * Set app details (privacy policy URL, category, etc.)
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {Object} details - App details
 * @param {string} details.privacyPolicyUrl - Privacy policy URL
 * @param {string} details.category - App category
 * @returns {Promise<Object>} Updated app details
 */
async function setAppDetails(packageName, editId, details) {
  const androidpublisher = await getPlayStoreClient();

  try {
    // Get current app details
    let currentDetails;
    try {
      currentDetails = await androidpublisher.edits.details.get({
        packageName: packageName,
        editId: editId
      });
    } catch (error) {
      // If details endpoint doesn't exist or fails, try alternative approach
      console.log(`   ⚠️  Could not get current app details: ${error.message}`);
      currentDetails = { data: {} };
    }

    const appDetails = {
      ...(currentDetails.data || {}),
      defaultLanguage: currentDetails.data?.defaultLanguage || 'en-US'
    };

    // Set privacy policy URL if provided
    if (details.privacyPolicyUrl) {
      appDetails.privacyPolicyUrl = details.privacyPolicyUrl;
    }

    // Set category if provided
    if (details.category) {
      appDetails.category = details.category;
    }

    // Update app details
    try {
      await androidpublisher.edits.details.update({
        packageName: packageName,
        editId: editId,
        requestBody: appDetails
      });
      
      if (details.privacyPolicyUrl) {
        console.log(`   ✅ Privacy policy URL set: ${details.privacyPolicyUrl}`);
      }
      if (details.category) {
        console.log(`   ✅ App category set: ${details.category}`);
      }
    } catch (error) {
      // Details endpoint might not support all fields or might need different format
      console.log(`   ⚠️  Could not set all app details via API: ${error.message}`);
      console.log(`   ℹ️  Privacy policy URL and category may need to be set manually in Play Console`);
      console.log(`   💡 Privacy policy: ${details.privacyPolicyUrl || 'N/A'}`);
      console.log(`   💡 Category: ${details.category || 'N/A'}`);
    }

    return appDetails;
  } catch (error) {
    console.log(`   ⚠️  Could not set app details: ${error.message}`);
    console.log(`   ℹ️  Privacy policy URL and category may need to be set manually in Play Console`);
    return {};
  }
}

/**
 * Validate metadata constraints
 */
function validateMetadata(metadata) {
  if (metadata.title && metadata.title.length > 50) {
    throw new Error(`Title exceeds 50 characters (${metadata.title.length} chars)`);
  }

  if (metadata.shortDescription && metadata.shortDescription.length > 80) {
    throw new Error(`Short description exceeds 80 characters (${metadata.shortDescription.length} chars)`);
  }

  if (metadata.fullDescription && metadata.fullDescription.length > 4000) {
    throw new Error(`Full description exceeds 4000 characters (${metadata.fullDescription.length} chars)`);
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current listing metadata
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {string} language - Language code
 * @returns {Promise<Object>} Current listing
 */
export async function getListingMetadata(packageName, editId, language = 'en-US') {
  const androidpublisher = await getPlayStoreClient();

  try {
    const response = await androidpublisher.edits.listings.get({
      packageName: packageName,
      editId: editId,
      language: language
    });

    return response.data;
  } catch (error) {
    if (error.code === 404) {
      return null;
    }
    throw new Error(`Failed to get listing metadata: ${error.message}`);
  }
}

