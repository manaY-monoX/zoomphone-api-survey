import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import { OAuthService } from '../../application/services/OAuthService';
import { logger } from '../logging/Logger';

/**
 * OAuth callback port (must match ZOOM_REDIRECT_URI)
 */
const OAUTH_CALLBACK_PORT = 3000;

/**
 * Authentication timeout (5 minutes)
 */
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Result type for OAuth callback
 */
export interface OAuthCallbackResult {
  success: boolean;
  error?: string;
}

/**
 * OAuth callback server for handling Zoom OAuth redirects
 */
export class OAuthCallbackServer {
  private readonly app: Express;
  private server: Server | null = null;
  private oauthService: OAuthService;
  private resolvePromise: ((result: OAuthCallbackResult) => void) | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(oauthService: OAuthService) {
    this.app = express();
    this.oauthService = oauthService;
    this.setupRoutes();
  }

  /**
   * Setup routes for OAuth callback
   */
  private setupRoutes(): void {
    // OAuth callback endpoint
    this.app.get('/oauth/callback', async (req: Request, res: Response) => {
      const { code, error, error_description } = req.query;

      // Handle OAuth error response
      if (error) {
        const errorMessage = error_description
          ? `${error}: ${error_description}`
          : String(error);

        logger.error('OAuth error received', undefined, { error: String(error), error_description: String(error_description || '') });

        res.send(this.generateHtmlPage(
          'Authentication Error',
          `<p class="error">Error: ${this.escapeHtml(errorMessage)}</p>
           <p>Please close this window and try again.</p>`
        ));

        this.resolvePromise?.({ success: false, error: errorMessage });
        return;
      }

      // Validate code parameter
      if (!code || typeof code !== 'string') {
        logger.error('No authorization code received');

        res.send(this.generateHtmlPage(
          'Authentication Error',
          `<p class="error">No authorization code received.</p>
           <p>Please close this window and try again.</p>`
        ));

        this.resolvePromise?.({ success: false, error: 'No authorization code received' });
        return;
      }

      // Exchange code for token
      logger.info('Received authorization code, exchanging for token');

      const result = await this.oauthService.exchangeCodeForToken(code);

      if (result.success) {
        logger.info('Token exchange successful');

        res.send(this.generateHtmlPage(
          'Authentication Successful',
          `<p class="success">Authentication completed successfully!</p>
           <p>You can close this window and return to the terminal.</p>`
        ));

        this.resolvePromise?.({ success: true });
      } else {
        logger.error('Token exchange failed', undefined, { errorMessage: result.error.message });

        res.send(this.generateHtmlPage(
          'Authentication Error',
          `<p class="error">Failed to exchange authorization code: ${this.escapeHtml(result.error.message)}</p>
           <p>Please close this window and try again.</p>`
        ));

        this.resolvePromise?.({ success: false, error: result.error.message });
      }
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'oauth-callback' });
    });
  }

  /**
   * Generate HTML page for browser response
   */
  private generateHtmlPage(title: string, content: string): string {
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    p {
      color: #666;
      line-height: 1.6;
    }
    .success {
      color: #28a745;
      font-weight: bold;
    }
    .error {
      color: #dc3545;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(title)}</h1>
    ${content}
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
  }

  /**
   * Start the callback server and wait for OAuth callback
   */
  async waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;

      this.server = this.app.listen(OAUTH_CALLBACK_PORT, () => {
        logger.info('OAuth callback server started', { port: OAUTH_CALLBACK_PORT });
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${OAUTH_CALLBACK_PORT} is already in use`);
          resolve({
            success: false,
            error: `Port ${OAUTH_CALLBACK_PORT} is already in use. Please stop any other service using this port.`,
          });
        } else {
          logger.error('Server error', error);
          resolve({ success: false, error: error.message });
        }
      });

      // Set timeout
      this.timeoutId = setTimeout(() => {
        logger.warn('OAuth callback timeout');
        this.stop();
        resolve({ success: false, error: 'Authentication timeout. Please try again.' });
      }, AUTH_TIMEOUT_MS);
    });
  }

  /**
   * Stop the callback server
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.server) {
      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping OAuth callback server', error);
        } else {
          logger.info('OAuth callback server stopped');
        }
      });
      this.server = null;
    }
  }
}
