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
  download <url|id>     Download a recording by URL or recording ID
  webhook               Start webhook server (HTTP POST)
  help                  Show this help message

Examples:
  npm run cli -- auth
  npm run cli -- history
  npm run cli -- recordings
  npm run cli -- download "https://zoom.us/..."
  npm run cli -- download 9fd3c039f425469c84a8e17f0aa00104
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

  // Try to get access token (will auto-refresh if expired)
  const tokenResult = await oauthService.getAccessToken();
  if (!tokenResult.success) {
    console.error('Not authenticated or token refresh failed:', tokenResult.error.message);
    console.error('Run "npm run cli -- auth" first.');
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

  // Try to get access token (will auto-refresh if expired)
  const tokenResult = await oauthService.getAccessToken();
  if (!tokenResult.success) {
    console.error('Not authenticated or token refresh failed:', tokenResult.error.message);
    console.error('Run "npm run cli -- auth" first.');
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
    console.log(`  Time: ${recording.startTime} - ${recording.endTime || 'N/A'}`);
    if (recording.recordingType) {
      console.log(`  Recording Type: ${recording.recordingType}`);
    }
    if (recording.fileType) {
      console.log(`  File Type: ${recording.fileType}`);
    }
    if (recording.fileSize) {
      console.log(`  File Size: ${(recording.fileSize / 1024).toFixed(2)} KB`);
    }
    console.log(`  Download URL: ${recording.downloadUrl}`);
    console.log('─'.repeat(100));
  }
}

/**
 * Check if input is a URL
 */
function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

/**
 * Handle download command
 * Supports both download URL and recording ID
 */
async function handleDownload(input: string): Promise<void> {
  console.log('Downloading recording...\n');

  const oauthService = new OAuthService();
  await oauthService.loadToken();

  // Try to get access token (will auto-refresh if expired)
  const tokenResult = await oauthService.getAccessToken();
  if (!tokenResult.success) {
    console.error('Not authenticated or token refresh failed:', tokenResult.error.message);
    console.error('Run "npm run cli -- auth" first.');
    process.exit(1);
  }

  const recordingService = new RecordingService(undefined, undefined, oauthService);

  let downloadUrl = input;

  // If input is not a URL, treat it as a recording ID
  if (!isUrl(input)) {
    console.log(`Input "${input}" is not a URL, searching by recording ID...\n`);
    const recordingResult = await recordingService.findRecordingById(input);

    if (!recordingResult.success) {
      console.error('Recording not found:', recordingResult.error.message);
      console.log('\nTip: Use "npm run cli -- recordings" to list available recordings.\n');
      process.exit(1);
    }

    downloadUrl = recordingResult.data.downloadUrl;
    console.log(`Found recording. Download URL: ${downloadUrl}\n`);
  }

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
 * 発信者名を取得するヘルパー関数
 * connection_typeに応じて適切な表示を返す
 */
function getCallerDisplayName(caller?: {
  name?: string;
  phone_number?: string;
  connection_type?: string;
}): string {
  if (!caller) return 'Unknown';
  if (caller.name) return caller.name;

  // PSTN外部発信の場合
  if (caller.connection_type === 'pstn_off_net') {
    return `外部発信者 (${caller.phone_number || 'Unknown'})`;
  }

  // その他の場合は電話番号を表示
  return caller.phone_number || 'Unknown';
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
    // Log raw payload for structure verification during testing
    console.log(`  [DEBUG] Raw payload: ${JSON.stringify(payload)}`);
  });

  // Register callee ringing callback (incoming call notification)
  webhookHandler.onCalleeRinging(async (payload) => {
    console.log('\n[Webhook] 着信通知 (ringing):');
    console.log(`  Call ID: ${payload.call_id}`);
    console.log(`  発信者番号: ${payload.caller?.phone_number || 'Unknown'}`);
    console.log(`  発信者名: ${getCallerDisplayName(payload.caller)}`);
    console.log(`  接続タイプ: ${payload.caller?.connection_type || 'N/A'}`);
    console.log(`  着信者番号: ${payload.callee?.phone_number || 'Unknown'}`);
    console.log(`  着信者ユーザーID: ${payload.callee?.user_id || 'N/A'}`);
    console.log(`  内線番号: ${payload.callee?.extension_number || 'N/A'}`);
    console.log(`  デバイス種別: ${payload.callee?.device_type || 'N/A'}`);
    // Log raw payload for structure verification during testing
    console.log(`  [DEBUG] Raw payload: ${JSON.stringify(payload)}`);
  });

  // Register callee answered callback (call answered)
  webhookHandler.onCalleeAnswered(async (payload) => {
    console.log('\n[Webhook] 通話開始 (answered):');
    console.log(`  Call ID: ${payload.call_id}`);
    console.log(`  発信者番号: ${payload.caller_number || payload.caller?.phone_number || 'Unknown'}`);
    console.log(`  発信者名: ${getCallerDisplayName(payload.caller)}`);
    console.log(`  着信者番号: ${payload.callee_number || payload.callee?.phone_number || 'Unknown'}`);
    // Log raw payload for structure verification during testing
    console.log(`  [DEBUG] Raw payload: ${JSON.stringify(payload)}`);
  });

  // Register callee missed callback (missed call)
  webhookHandler.onCalleeMissed(async (payload) => {
    console.log('\n[Webhook] 不在着信 (missed):');
    console.log(`  Call ID: ${payload.call_id}`);
    console.log(`  発信者番号: ${payload.caller_number || payload.caller?.phone_number || 'Unknown'}`);
    console.log(`  発信者名: ${getCallerDisplayName(payload.caller)}`);
    console.log(`  着信者番号: ${payload.callee_number || payload.callee?.phone_number || 'Unknown'}`);
    // Log raw payload for structure verification during testing
    console.log(`  [DEBUG] Raw payload: ${JSON.stringify(payload)}`);
  });

  // Register callee ended callback (call ended)
  webhookHandler.onCalleeEnded(async (payload) => {
    console.log('\n[Webhook] 通話終了 (ended):');
    console.log(`  Call ID: ${payload.call_id}`);
    console.log(`  発信者番号: ${payload.caller_number || payload.caller?.phone_number || 'Unknown'}`);
    console.log(`  発信者名: ${getCallerDisplayName(payload.caller)}`);
    console.log(`  着信者番号: ${payload.callee_number || payload.callee?.phone_number || 'Unknown'}`);
    // Log raw payload for structure verification during testing
    console.log(`  [DEBUG] Raw payload: ${JSON.stringify(payload)}`);
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
      const downloadInput = args[1];
      if (!downloadInput) {
        console.error('Error: Download URL or recording ID is required.');
        console.log('Usage: npm run cli -- download <url|id>');
        process.exit(1);
      }
      await handleDownload(downloadInput);
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
