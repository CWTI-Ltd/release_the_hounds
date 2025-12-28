/**
 * Play Store content rating and questionnaire management
 * Handles content rating questionnaires (financial app, health app, gambling, etc.)
 */

import { getPlayStoreClient } from './auth.js';

/**
 * Set content rating based on questionnaire answers
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {Object} answers - Content rating questionnaire answers
 * @returns {Promise<Object>} Content rating result
 */
export async function setContentRating(packageName, editId, answers) {
  console.log(`\n📋 Content Rating Questionnaires`);

  // Note: Content rating questionnaires cannot be set via API
  // They must be completed manually in Play Console
  // However, we can provide clear guidance based on the config

  console.log(`\n   ⚠️  Content rating questionnaires must be completed manually in Play Console`);
  console.log(`   📋 Your answers from config:`);
  console.log(`      - Financial app: ${answers.isFinancialApp ? 'Yes' : 'No'}`);
  console.log(`      - Health app: ${answers.isHealthApp ? 'Yes' : 'No'}`);
  console.log(`      - Gambling app: ${answers.isGamblingApp ? 'Yes' : 'No'}`);
  console.log(`      - Target age group: ${answers.targetAgeGroup || 'EVERYONE'}`);
  console.log(`      - Contains violence: ${answers.containsViolence ? 'Yes' : 'No'}`);
  console.log(`      - Contains sexual content: ${answers.containsSexualContent ? 'Yes' : 'No'}`);
  console.log(`      - Contains drugs: ${answers.containsDrugs ? 'Yes' : 'No'}`);
  
  console.log(`\n   💡 Complete the questionnaires at:`);
  console.log(`      https://play.google.com/console → Your app → Content rating`);
  console.log(`\n   📝 Steps:`);
  console.log(`      1. Go to Play Console → Your app → Policy → Content rating`);
  console.log(`      2. Answer the questionnaires using the answers above`);
  console.log(`      3. Save your answers`);
  
  return {
    success: true,
    note: 'Content rating questionnaires must be completed manually in Play Console',
    answers: answers
  };
}


/**
 * Set data safety information
 * @param {string} packageName - Android package name
 * @param {string} editId - Edit session ID
 * @param {Object} dataSafety - Data safety answers
 * @returns {Promise<Object>} Data safety result
 */
export async function setDataSafety(packageName, editId, dataSafety) {
  const androidpublisher = await getPlayStoreClient();

  console.log(`\n🔒 Setting data safety information...`);

  try {
    // Data safety uses applications.dataSafety endpoint (not under edits)
    // It requires CSV format which is complex, so we'll use a simplified approach
    // For common cases like Sentry (crash reporting), we can document what to set
    
    const dataSafetyInfo = {
      collectsPersonalData: dataSafety.collectsPersonalData || false,
      sharesPersonalData: dataSafety.sharesPersonalData || false,
      collectsLocation: dataSafety.collectsLocation || false,
      usesCrashReporting: dataSafety.usesCrashReporting || false, // e.g., Sentry
      usesAnalytics: dataSafety.usesAnalytics || false
    };

    // Note: The actual API uses CSV format which is complex
    // For now, we'll provide guidance on what needs to be set
    console.log(`   ℹ️  Data safety configuration:`);
    console.log(`      - Collects personal data: ${dataSafetyInfo.collectsPersonalData ? 'Yes' : 'No'}`);
    console.log(`      - Shares personal data: ${dataSafetyInfo.sharesPersonalData ? 'Yes' : 'No'}`);
    console.log(`      - Collects location: ${dataSafetyInfo.collectsLocation ? 'Yes' : 'No'}`);
    if (dataSafetyInfo.usesCrashReporting) {
      console.log(`      - Uses crash reporting (e.g., Sentry): Yes`);
      console.log(`        → This typically collects: Device IDs, crash logs`);
      console.log(`        → Set in Play Console: Data safety → Crash logs`);
    }
    
    console.log(`\n   ⚠️  Note: Data safety form uses CSV format and may need manual completion`);
    console.log(`   💡 Tip: If using Sentry, select "Crash logs" in Data safety form`);
    console.log(`   📋 Complete the form at: https://play.google.com/console → Your app → Data safety`);
    
    return { success: true, dataSafetyInfo, note: 'Complete data safety form manually in Play Console' };
  } catch (error) {
    console.log(`   ⚠️  Data safety API may require different format: ${error.message}`);
    console.log(`   ℹ️  Data safety must be set manually in Play Console`);
    return { success: false, note: 'Set data safety manually in Play Console' };
  }
}

