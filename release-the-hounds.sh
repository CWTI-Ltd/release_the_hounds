#!/bin/bash

# Release The Hounds: Single entry point for the entire automation pipeline
# Just run: ./release-the-hounds.sh

set -e

# Resolve script directory, handling symlinks
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
# If script is a symlink, resolve it
while [ -h "$SCRIPT_SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  # If relative symlink, resolve relative to script directory
  [[ $SCRIPT_SOURCE != /* ]] && SCRIPT_SOURCE="$SCRIPT_DIR/$SCRIPT_SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
# Preserve original working directory before changing to script directory
ORIGINAL_CWD="$(pwd)"
cd "$SCRIPT_DIR"
# Export original CWD so Node.js can use it
export ORIGINAL_CWD

echo "🚀 Release The Hounds: Mobile App Publishing Automation"
echo ""

# Track if we need to exit
EXIT_CODE=0

# Check if Node.js is installed
echo "🔍 Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found."
    echo ""
    echo "📦 Install Node.js:"
    echo "   Linux: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "   macOS: brew install node"
    echo "   Or visit: https://nodejs.org/"
    echo ""
    EXIT_CODE=1
else
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found."
    echo "   npm usually comes with Node.js. Please reinstall Node.js."
    echo ""
    EXIT_CODE=1
else
    NPM_VERSION=$(npm --version)
    echo "✅ npm: $NPM_VERSION"
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found."
    echo ""
    echo "📦 Install Google Cloud SDK:"
    echo "   Linux (snap): sudo snap install google-cloud-cli --classic"
    echo "   Linux (manual): https://cloud.google.com/sdk/docs/install#linux"
    echo "   macOS: brew install google-cloud-sdk"
    echo "   Or visit: https://cloud.google.com/sdk/docs/install"
    echo ""
    EXIT_CODE=1
else
    GCLOUD_VERSION=$(gcloud --version 2>&1 | head -n 1)
    echo "✅ Google Cloud SDK: $GCLOUD_VERSION"
fi

# Check if gcloud is initialized
if command -v gcloud &> /dev/null; then
    if ! gcloud config list &> /dev/null; then
        echo "⚠️  gcloud not initialized. Run 'gcloud init' first."
        echo ""
    fi
fi

# Exit if any critical dependencies are missing
if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Missing required dependencies. Please install them and try again."
    exit $EXIT_CODE
fi

echo ""

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
    echo ""
fi

# If a command was provided, run it directly
if [ $# -gt 0 ]; then
    COMMAND="$1"
    shift
    
    # For commands that need authentication, check first
    case "$COMMAND" in
        create-project|list-projects|status|auth|check-deps)
            # These commands handle their own auth checks
            node src/cli.js "$COMMAND" "$@"
            ;;
        *)
            # For other commands, check auth first
            AUTH_STATUS=$(node src/cli.js status 2>&1 | grep -q "✅ Authenticated" && echo "authenticated" || echo "not_authenticated")
            
            if [ "$AUTH_STATUS" != "authenticated" ]; then
                echo ""
                echo "🔐 Not authenticated. Starting authentication..."
                echo "   This will open your browser for Google sign-in."
                echo ""
                node src/cli.js auth
                echo ""
            fi
            
            node src/cli.js "$COMMAND" "$@"
            ;;
    esac
else
    # No command provided - show help
    echo "✅ Ready to go!"
    echo ""
    echo "Available commands:"
    echo "   ./release-the-hounds.sh check-deps           - Check if all dependencies are installed"
    echo "   ./release-the-hounds.sh auth                 - Authenticate with Google"
    echo "   ./release-the-hounds.sh status               - Check authentication status"
    echo "   ./release-the-hounds.sh create-project       - Create a new Google Cloud project"
    echo "   ./release-the-hounds.sh list-projects        - List all accessible projects"
    echo "   ./release-the-hounds.sh setup-service-account - Create service account and grant roles"
    echo "   ./release-the-hounds.sh setup-firebase       - Create/link Firebase project and register apps"
    echo "   ./release-the-hounds.sh generate-play-store-config - Generate Play Store config template"
    echo "   ./release-the-hounds.sh export-service-account - Export service account key for CI/CD"
    echo "   ./release-the-hounds.sh enable-apis           - Enable required Google Cloud APIs"
    echo "   ./release-the-hounds.sh generate-play-store-config - Generate Play Store config template"
    echo "   ./release-the-hounds.sh publish-play-store   - Publish app metadata to Google Play Store"
    echo ""
    echo "💡 Start with: ./release-the-hounds.sh check-deps"
fi

