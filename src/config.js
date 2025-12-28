/**
 * Configuration constants for Release The Hounds
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

export const OAUTH_CONFIG = {
  // OAuth2 scopes required for all operations
  SCOPES: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/androidpublisher',
    'https://www.googleapis.com/auth/firebase'
  ],
  
  // OAuth2 redirect URI (local callback server)
  REDIRECT_URI: 'http://localhost:3000/oauth2callback',
  
  // Port for local OAuth callback server
  CALLBACK_PORT: 3000,
  
  // OAuth2 client configuration
  // Note: For production, these should be set via environment variables
  // For now, we'll use Google's default OAuth2 client
  CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
};

export const PATHS = {
  // Directory for storing secrets and state
  AUTOPUBLISH_DIR: join(ROOT_DIR, '.autopublish'),
  
  // Token storage
  REFRESH_TOKEN_FILE: join(ROOT_DIR, '.autopublish/refresh-token.json'),
  
  // State file
  STATE_FILE: join(ROOT_DIR, '.autopublish/state.json'),
  
  // Service account keys directory
  SERVICE_ACCOUNT_DIR: join(ROOT_DIR, '.autopublish/service-accounts'),
  
  // Firebase config directory
  FIREBASE_CONFIG_DIR: join(ROOT_DIR, '.autopublish/firebase-config'),
};

export const OAUTH_TIMEOUT = {
  // Timeout for OAuth flow (5 minutes)
  FLOW_TIMEOUT_MS: 5 * 60 * 1000,
  
  // Token refresh buffer (refresh 5 minutes before expiry)
  REFRESH_BUFFER_MS: 5 * 60 * 1000,
};

