import {
  ZoomWebhookEvent,
  CallHistoryCompletedPayload,
  WebhookEventTypes,
  IWebhookHandler,
} from '../types/index';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * Event queue entry
 */
interface QueuedEvent {
  event: ZoomWebhookEvent;
  receivedAt: Date;
}

/**
 * Webhook handler implementation
 */
export class WebhookHandler implements IWebhookHandler {
  private readonly eventQueue: QueuedEvent[] = [];
  private readonly processedEventIds: Set<string> = new Set();
  private callCompletedCallbacks: Array<(payload: CallHistoryCompletedPayload) => Promise<void>> = [];
  private isProcessing = false;

  /**
   * Handle incoming webhook event
   */
  async handleEvent(event: ZoomWebhookEvent): Promise<void> {
    logger.info('Received webhook event', {
      eventType: event.event,
      eventTs: event.event_ts,
      accountId: event.payload.account_id,
    });

    // Extract event ID for idempotency check
    const eventId = this.getEventId(event);

    if (this.processedEventIds.has(eventId)) {
      logger.debug('Duplicate event detected, skipping', { eventId });
      return;
    }

    // Add to queue
    this.eventQueue.push({
      event,
      receivedAt: new Date(),
    });

    logger.debug('Event added to queue', {
      eventId,
      queueLength: this.eventQueue.length,
    });

    // Process queue asynchronously
    this.processQueue().catch((error) => {
      logger.error('Error processing event queue', error as Error);
    });
  }

  /**
   * Register callback for call completed events
   */
  onCallCompleted(callback: (payload: CallHistoryCompletedPayload) => Promise<void>): void {
    this.callCompletedCallbacks.push(callback);
    logger.debug('Call completed callback registered', {
      totalCallbacks: this.callCompletedCallbacks.length,
    });
  }

  /**
   * Get unique event ID for idempotency check
   */
  private getEventId(event: ZoomWebhookEvent): string {
    const payload = event.payload.object;

    // Use call_log_id if available
    if ('call_log_id' in payload && payload.call_log_id) {
      return `${event.event}:${payload.call_log_id}`;
    }

    // Fallback to event timestamp
    return `${event.event}:${event.event_ts}`;
  }

  /**
   * Process event queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        const queuedEvent = this.eventQueue.shift();
        if (!queuedEvent) continue;

        const eventId = this.getEventId(queuedEvent.event);

        // Double-check idempotency
        if (this.processedEventIds.has(eventId)) {
          continue;
        }

        await this.processEvent(queuedEvent.event);

        // Mark as processed
        this.processedEventIds.add(eventId);

        // Clean up old processed event IDs (keep last 1000)
        if (this.processedEventIds.size > 1000) {
          const idsArray = Array.from(this.processedEventIds);
          const toRemove = idsArray.slice(0, idsArray.length - 1000);
          toRemove.forEach(id => this.processedEventIds.delete(id));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: ZoomWebhookEvent): Promise<void> {
    logger.debug('Processing event', { eventType: event.event });

    switch (event.event) {
      case WebhookEventTypes.CALLEE_CALL_HISTORY_COMPLETED:
      case WebhookEventTypes.CALLER_CALL_HISTORY_COMPLETED:
        await this.handleCallHistoryCompleted(event);
        break;

      default:
        logger.debug('Unhandled event type', { eventType: event.event });
    }
  }

  /**
   * Handle call history completed event
   */
  private async handleCallHistoryCompleted(event: ZoomWebhookEvent): Promise<void> {
    const payload = event.payload.object as CallHistoryCompletedPayload;

    logger.info('Call history completed', {
      callLogId: payload.call_log_id,
      callId: payload.call_id,
      direction: payload.direction,
      duration: payload.duration,
      result: payload.result,
    });

    // Execute all registered callbacks
    for (const callback of this.callCompletedCallbacks) {
      try {
        await callback(payload);
      } catch (error) {
        logger.error('Error in call completed callback', error as Error, {
          callLogId: payload.call_log_id,
        });
      }
    }
  }

  /**
   * Get current queue length (for monitoring)
   */
  getQueueLength(): number {
    return this.eventQueue.length;
  }

  /**
   * Get processed event count (for monitoring)
   */
  getProcessedEventCount(): number {
    return this.processedEventIds.size;
  }
}

/**
 * Default webhook handler instance
 */
export const webhookHandler = new WebhookHandler();

export default webhookHandler;
