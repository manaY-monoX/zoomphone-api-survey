import { OAuthService } from '../../application/services/OAuthService';
import { CallHistoryService } from '../../application/services/CallHistoryService';
import { RecordingService } from '../../application/services/RecordingService';
import { WebhookHandler } from '../../application/services/WebhookHandler';
import { WebhookServer } from '../../infrastructure/server/WebhookServer';
import { OAuthCallbackServer } from '../../infrastructure/server/OAuthCallbackServer';
import { config } from '../../config/index';

/**
 * CLI Commands
 */
const COMMANDS = {
  AUTH: 'auth',
  HISTORY: 'history',
  RECORDINGS: 'recordings',
  DOWNLOAD: 'download',
  WEBHOOK: 'webhook',
  HELP: 'help',
} as const;

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Zoom Phone API POC - CLI

Usage: npm run cli -- <command> [options]

Commands:
  auth                  Start OAuth authentication flow
  history               Fetch call history
  recordings            List recordings for authenticated user
  download <url>        Download a recording
  webhook               Start webhook server
  help                  Show this help message

Examples:
  npm run cli -- auth
  npm run cli -- history
  npm run cli -- recordings
  npm run cli -- download "https://zoom.us/..."
  npm run cli -- webhook
`);
}

/**
 * Generate random state for OAuth
 */
function generateState(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Handle auth command
 */
async function handleAuth(): Promise<void> {
  console.log('Starting OAuth authentication flow...\n');

  const oauthService = new OAuthService();

  // Check if already authenticated
  await oauthService.loadToken();
  if (oauthService.isAuthenticated()) {
    console.log('Already authenticated!');
    console.log('To re-authenticate, delete .tokens.json and run again.\n');
    return;
  }

  // Create callback server
  const callbackServer = new OAuthCallbackServer(oauthService);

  // Generate authorization URL
  const state = generateState();
  const authUrl = oauthService.getAuthorizationUrl(state);

  console.log('Please visit the following URL to authorize:');
  console.log('\n' + authUrl + '\n');
  console.log('Waiting for authorization callback on ' + config.zoom.redirectUri + '...\n');
  console.log('(Press Ctrl+C to cancel)\n');

  try {
    // Start callback server and wait for OAuth redirect
    const result = await callbackServer.waitForCallback();

    if (result.success) {
      console.log('\n✓ Authentication successful!');
      console.log('Token saved. You can now use other commands.\n');
    } else {
      console.error('\n✗ Authentication failed:', result.error);
      console.log('\nAlternatively, you can manually copy the "code" from the redirect URL and run:');
      console.log('  npm run cli -- auth-callback <code>\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Authentication error:', (error as Error).message);
    console.log('\nAlternatively, you can manually copy the "code" from the redirect URL and run:');
    console.log('  npm run cli -- auth-callback <code>\n');
    process.exit(1);
  } finally {
    callbackServer.stop();
  }
}

/**
 * Handle auth callback (exchange code for token)
 */
async function handleAuthCallback(code: string): Promise<void> {
  console.log('Exchanging authorization code for token...\n');

  const oauthService = new OAuthService();
  const result = await oauthService.exchangeCodeForToken(code);

  if (!result.success) {
    console.error('Authentication failed:', result.error.message);
    process.exit(1);
  }

  console.log('Authentication successful!');
  console.log(`Token expires at: ${result.data.expiresAt.toISOString()}\n`);
}

/**
 * Handle history command
 */
async function handleHistory(): Promise<void> {
  console.log('Fetching call history...\n');

  const oauthService = new OAuthService();
  await oauthService.loadToken();

  if (!oauthService.isAuthenticated()) {
    console.error('Not authenticated. Run "npm run cli -- auth" first.');
    process.exit(1);
  }

  const callHistoryService = new CallHistoryService(undefined, oauthService);

  // Get today's date range
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const result = await callHistoryService.getCallHistory({
    from: thirtyDaysAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
    pageSize: 100,
  });

  if (!result.success) {
    console.error('Failed to fetch call history:', result.error.message);
    process.exit(1);
  }

  console.log(`Total records: ${result.data.totalRecords}`);
  console.log(`Fetched: ${result.data.callLogs.length} records\n`);

  if (result.data.callLogs.length === 0) {
    console.log('No call logs found.');
    return;
  }

  console.log('Call History:');
  console.log('─'.repeat(100));

  for (const log of result.data.callLogs) {
    console.log(`ID: ${log.id}`);
    console.log(`  Direction: ${log.direction}`);
    console.log(`  From: ${log.callerNumber} → To: ${log.calleeNumber}`);
    console.log(`  Duration: ${log.duration}s`);
    console.log(`  Time: ${log.startTime} - ${log.endTime}`);
    console.log(`  Result: ${log.result}`);
    console.log(`  Has Recording: ${log.hasRecording}`);
    console.log('─'.repeat(100));
  }

  if (result.data.nextPageToken) {
    console.log('\nMore records available. Use pagination to fetch all.');
  }
}

/**
 * Handle recordings command
 * Note: userId is optional as user-level endpoint fetches recordings for authenticated user
 */
async function handleRecordings(_userId?: string): Promise<void> {
  console.log('Fetching recordings for authenticated user...\n');

  const oauthService = new OAuthService();
  await oauthService.loadToken();

  if (!oauthService.isAuthenticated()) {
    console.error('Not authenticated. Run "npm run cli -- auth" first.');
    process.exit(1);
  }

  const recordingService = new RecordingService(undefined, undefined, oauthService);
  const result = await recordingService.getRecordings();

  if (!result.success) {
    console.error('Failed to fetch recordings:', result.error.message);
    process.exit(1);
  }

  console.log(`Fetched: ${result.data.recordings.length} recordings\n`);

  if (result.data.recordings.length === 0) {
    console.log('No recordings found.');
    return;
  }

  console.log('Recordings:');
  console.log('─'.repeat(100));

  for (const recording of result.data.recordings) {
    console.log(`ID: ${recording.id}`);
    console.log(`  Call Log ID: ${recording.callLogId}`);
    console.log(`  From: ${recording.callerNumber} → To: ${recording.calleeNumber}`);
    console.log(`  Duration: ${recording.duration}s`);
    console.log(`  Time: ${recording.startTime} - ${recording.endTime}`);
    console.log(`  File Type: ${recording.fileType}`);
    console.log(`  File Size: ${(recording.fileSize / 1024).toFixed(2)} KB`);
    console.log(`  Download URL: ${recording.downloadUrl}`);
    console.log('─'.repeat(100));
  }
}

/**
 * Handle download command
 */
async function handleDownload(downloadUrl: string): Promise<void> {
  console.log('Downloading recording...\n');

  const oauthService = new OAuthService();
  await oauthService.loadToken();

  if (!oauthService.isAuthenticated()) {
    console.error('Not authenticated. Run "npm run cli -- auth" first.');
    process.exit(1);
  }

  const recordingService = new RecordingService(undefined, undefined, oauthService);

  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = `recording_${timestamp}.mp3`;

  const result = await recordingService.downloadRecording(downloadUrl, outputPath);

  if (!result.success) {
    console.error('Failed to download recording:', result.error.message);
    process.exit(1);
  }

  console.log('Download successful!');
  console.log(`  File: ${result.data.filePath}`);
  console.log(`  Size: ${(result.data.fileSize / 1024).toFixed(2)} KB`);
  console.log(`  Type: ${result.data.mimeType}\n`);
}

/**
 * Handle webhook command
 */
async function handleWebhook(): Promise<void> {
  console.log('Starting webhook server...\n');

  const webhookServer = new WebhookServer();
  const webhookHandler = new WebhookHandler();

  // Register event handler
  webhookServer.onEvent(async (event) => {
    await webhookHandler.handleEvent(event);
  });

  // Register call completed callback
  webhookHandler.onCallCompleted(async (payload) => {
    console.log('\n[Webhook] Call completed:');
    console.log(`  Call ID: ${payload.call_id}`);
    console.log(`  Call Log ID: ${payload.call_log_id}`);
    console.log(`  Direction: ${payload.direction}`);
    console.log(`  From: ${payload.caller_number} → To: ${payload.callee_number}`);
    console.log(`  Duration: ${payload.duration}s`);
    console.log(`  Result: ${payload.result}`);
  });

  // Start server
  await webhookServer.start();

  console.log(`Webhook server is running on port ${config.webhook.port}`);
  console.log('\nEndpoints:');
  console.log(`  Health: http://localhost:${config.webhook.port}/health`);
  console.log(`  Webhook: http://localhost:${config.webhook.port}/webhook`);
  console.log('\nPress Ctrl+C to stop.\n');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await webhookServer.stop();
    process.exit(0);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || command === COMMANDS.HELP) {
    printHelp();
    return;
  }

  switch (command) {
    case COMMANDS.AUTH:
      await handleAuth();
      break;

    case 'auth-callback':
      const code = args[1];
      if (!code) {
        console.error('Error: Authorization code is required.');
        console.log('Usage: npm run cli -- auth-callback <code>');
        process.exit(1);
      }
      await handleAuthCallback(code);
      break;

    case COMMANDS.HISTORY:
      await handleHistory();
      break;

    case COMMANDS.RECORDINGS:
      // userId is optional for user-level endpoint
      await handleRecordings();
      break;

    case COMMANDS.DOWNLOAD:
      const downloadUrl = args[1];
      if (!downloadUrl) {
        console.error('Error: Download URL is required.');
        console.log('Usage: npm run cli -- download <url>');
        process.exit(1);
      }
      await handleDownload(downloadUrl);
      break;

    case COMMANDS.WEBHOOK:
      await handleWebhook();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
