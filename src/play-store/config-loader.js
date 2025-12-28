/**
 * Play Store config file loader
 * Loads and validates play-store-config.json
 */

import { readJsonFile, fileExists } from '../utils/fs.js';
import { join } from 'path';

/**
 * Load and validate Play Store config file
 * @param {string} configPath - Path to config file
 * @returns {Promise<Object>} Validated config object
 */
export async function loadPlayStoreConfig(configPath) {
  if (!(await fileExists(configPath))) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = await readJsonFile(configPath);
  
  if (!config) {
    throw new Error(`Failed to parse config file: ${configPath}`);
  }

  // Validate required fields
  validateConfig(config);

  return config;
}

/**
 * Validate config structure
 */
function validateConfig(config) {
  const required = ['packageName', 'build', 'metadata'];
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required config fields: ${missing.join(', ')}`);
  }

  // Build section is optional (builds are uploaded via CI/CD)
  // We don't validate it here since this tool only manages metadata

  // Validate metadata section
  // Note: Only fields that CAN be automated via API are required
  const requiredMetadata = ['title', 'shortDescription', 'fullDescription'];
  const missingMetadata = requiredMetadata.filter(field => !config.metadata[field]);

  if (missingMetadata.length > 0) {
    throw new Error(`Missing required metadata fields: ${missingMetadata.join(', ')}`);
  }
}

/**
 * Get default config path
 * Uses ORIGINAL_CWD environment variable if set (preserved from shell script)
 * Otherwise falls back to process.cwd()
 * @returns {string} Default config path
 */
export function getDefaultConfigPath() {
  // Use original CWD if preserved by shell script, otherwise use current CWD
  const baseDir = process.env.ORIGINAL_CWD || process.cwd();
  return join(baseDir, 'play-store-config.json');
}

/**
 * Create example config file
 * @param {string} outputPath - Path to write example config
 */
export async function createExampleConfig(outputPath) {
  const exampleConfig = {
    packageName: "com.example.app",
    build: {
      aab: "./app/build/outputs/bundle/release/app-release.aab",
      apk: null
    },
    metadata: {
      title: "My Awesome App",
      shortDescription: "Short description (max 80 characters)",
      fullDescription: "Full description with details about your app. This can be up to 4000 characters.",
      category: "APPLICATION_PRODUCTIVITY",
      privacyPolicyUrl: "https://example.com/privacy"
    },
    graphics: {
      screenshotsDir: "./screenshots/android",
      icon: "./assets/icon-512.png",
      featureGraphic: "./assets/feature-graphic-1024x500.png"
    },
    contentRating: {
      isFinancialApp: false,
      isHealthApp: false,
      isGamblingApp: false,
      targetAgeGroup: "EVERYONE",
      containsViolence: false,
      containsSexualContent: false,
      containsDrugs: false,
      dataSafety: {
        collectsPersonalData: false,
        sharesPersonalData: false,
        collectsLocation: false
      }
    },
    distribution: {
      track: "internal",
      pricing: {
        free: true
      },
      countries: "all"
    }
  };

  const { writeJsonFile } = await import('../utils/fs.js');
  await writeJsonFile(outputPath, exampleConfig);
}

