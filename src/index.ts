/**
 * Zoom Phone API POC
 *
 * This is the main entry point for the POC application.
 * Use the CLI commands for actual functionality:
 *
 * npm run cli -- auth          # Start OAuth authentication flow
 * npm run cli -- history       # Fetch call history
 * npm run cli -- recordings    # List recordings
 * npm run cli -- download <id> # Download a recording
 * npm run cli -- webhook       # Start webhook server
 */

import { config } from './config/index';

console.log('Zoom Phone API POC');
console.log('==================');
console.log('');
console.log('Available commands:');
console.log('  npm run cli -- auth          Start OAuth authentication flow');
console.log('  npm run cli -- history       Fetch call history');
console.log('  npm run cli -- recordings    List recordings');
console.log('  npm run cli -- download <id> Download a recording');
console.log('  npm run cli -- webhook       Start webhook server');
console.log('');
console.log('Configuration status:');
console.log(`  Client ID: ${config.zoom.clientId ? '✓ Set' : '✗ Not set'}`);
console.log(`  Client Secret: ${config.zoom.clientSecret ? '✓ Set' : '✗ Not set'}`);
console.log(`  Redirect URI: ${config.zoom.redirectUri}`);
console.log(`  API Base URL: ${config.zoom.apiBaseUrl}`);
console.log(`  Webhook Port: ${config.webhook.port}`);
console.log(`  Log Level: ${config.logging.level}`);
