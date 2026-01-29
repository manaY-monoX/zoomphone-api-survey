import express, { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Server } from 'http';
import { ZoomWebhookEvent, IWebhookServer } from '../../application/types/index';
import { config } from '../../config/index';
import { logger } from '../logging/Logger';

/**
 * Timestamp tolerance for signature validation (5 minutes)
 */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Webhook server implementation
 */
export class WebhookServer implements IWebhookServer {
  private readonly app: Express;
  private server: Server | null = null;
  private eventHandler: ((event: ZoomWebhookEvent) => Promise<void>) | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup express middleware
   */
  private setupMiddleware(): void {
    // Parse raw body for signature verification
    this.app.use(express.raw({ type: 'application/json' }));

    // Logging middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.debug('Incoming request', {
        method: req.method,
        path: req.path,
        headers: {
          'content-type': req.headers['content-type'],
          'x-zm-signature': req.headers['x-zm-signature'] ? '[present]' : '[missing]',
          'x-zm-request-timestamp': req.headers['x-zm-request-timestamp'],
        },
      });
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Webhook endpoint - both / and /webhook paths
    // Zoom Marketplace may send to either path depending on configuration
    const webhookHandler = async (req: Request, res: Response): Promise<void> => {
      try {
        // Verify signature
        const isValid = this.verifySignature(req);
        if (!isValid) {
          logger.warn('Invalid webhook signature');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }

        // Parse body
        const body = JSON.parse(req.body.toString()) as ZoomWebhookEvent;

        // Handle endpoint URL validation
        if (body.event === 'endpoint.url_validation') {
          const plainToken = (body.payload as { plainToken?: string }).plainToken;
          if (plainToken) {
            const encryptedToken = crypto
              .createHmac('sha256', config.webhook.secretToken)
              .update(plainToken)
              .digest('hex');

            logger.info('Webhook URL validation request received');
            res.json({
              plainToken,
              encryptedToken,
            });
            return;
          }
        }

        // Return 200 immediately
        res.status(200).json({ status: 'received' });

        // Process event asynchronously
        if (this.eventHandler) {
          this.eventHandler(body).catch((error) => {
            logger.error('Error processing webhook event', error as Error);
          });
        }
      } catch (error) {
        logger.error('Error handling webhook request', error as Error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };

    // Register handler for both paths
    this.app.post('/', webhookHandler);
    this.app.post('/webhook', webhookHandler);
  }

  /**
   * Verify Zoom webhook signature
   */
  private verifySignature(req: Request): boolean {
    const signature = req.headers['x-zm-signature'] as string;
    const timestamp = req.headers['x-zm-request-timestamp'] as string;

    if (!signature || !timestamp) {
      logger.debug('Missing signature or timestamp header');
      return false;
    }

    // Check timestamp to prevent replay attacks
    const timestampMs = parseInt(timestamp, 10) * 1000;
    const now = Date.now();

    if (Math.abs(now - timestampMs) > TIMESTAMP_TOLERANCE_MS) {
      logger.debug('Timestamp outside tolerance', {
        timestamp: timestampMs,
        now,
        difference: Math.abs(now - timestampMs),
      });
      return false;
    }

    // Calculate expected signature
    const message = `v0:${timestamp}:${req.body.toString()}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', config.webhook.secretToken)
      .update(message)
      .digest('hex')}`;

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      logger.debug('Signature mismatch');
    }

    return isValid;
  }

  /**
   * Register event handler
   */
  onEvent(handler: (event: ZoomWebhookEvent) => Promise<void>): void {
    this.eventHandler = handler;
    logger.debug('Event handler registered');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(config.webhook.port, () => {
          logger.info('Webhook server started', {
            port: config.webhook.port,
            endpoints: ['/health', '/', '/webhook'],
          });
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Server error', error as Error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping server', error as Error);
          reject(error);
          return;
        }

        logger.info('Webhook server stopped');
        this.server = null;
        resolve();
      });
    });
  }
}

/**
 * Default webhook server instance
 */
export const webhookServer = new WebhookServer();

export default webhookServer;
