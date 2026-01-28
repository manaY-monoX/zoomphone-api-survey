import {
  ZoomWebhookEvent,
  CallHistoryCompletedPayload,
  CalleeRingingPayload,
  GenericCallEventPayload,
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
  private calleeRingingCallbacks: Array<(payload: CalleeRingingPayload) => Promise<void>> = [];
  private calleeAnsweredCallbacks: Array<(payload: GenericCallEventPayload) => Promise<void>> = [];
  private calleeMissedCallbacks: Array<(payload: GenericCallEventPayload) => Promise<void>> = [];
  private calleeEndedCallbacks: Array<(payload: GenericCallEventPayload) => Promise<void>> = [];
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
   * Register callback for callee ringing events (incoming call notification)
   */
  onCalleeRinging(callback: (payload: CalleeRingingPayload) => Promise<void>): void {
    this.calleeRingingCallbacks.push(callback);
    logger.debug('Callee ringing callback registered', {
      totalCallbacks: this.calleeRingingCallbacks.length,
    });
  }

  /**
   * Register callback for callee answered events
   */
  onCalleeAnswered(callback: (payload: GenericCallEventPayload) => Promise<void>): void {
    this.calleeAnsweredCallbacks.push(callback);
    logger.debug('Callee answered callback registered', {
      totalCallbacks: this.calleeAnsweredCallbacks.length,
    });
  }

  /**
   * Register callback for callee missed events
   */
  onCalleeMissed(callback: (payload: GenericCallEventPayload) => Promise<void>): void {
    this.calleeMissedCallbacks.push(callback);
    logger.debug('Callee missed callback registered', {
      totalCallbacks: this.calleeMissedCallbacks.length,
    });
  }

  /**
   * Register callback for callee ended events
   */
  onCalleeEnded(callback: (payload: GenericCallEventPayload) => Promise<void>): void {
    this.calleeEndedCallbacks.push(callback);
    logger.debug('Callee ended callback registered', {
      totalCallbacks: this.calleeEndedCallbacks.length,
    });
  }

  /**
   * Get unique event ID for idempotency check
   */
  private getEventId(event: ZoomWebhookEvent): string {
    const payload = event.payload.object;

    // Use call_log_id if available (for call history events)
    if ('call_log_id' in payload && payload.call_log_id) {
      return `${event.event}:${payload.call_log_id}`;
    }

    // Use call_id if available (for ringing events)
    if ('call_id' in payload && payload.call_id) {
      return `${event.event}:${payload.call_id}`;
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

      case WebhookEventTypes.CALLEE_RINGING:
        await this.handleCalleeRinging(event);
        break;

      case WebhookEventTypes.CALLEE_ANSWERED:
        await this.handleCalleeAnswered(event);
        break;

      case WebhookEventTypes.CALLEE_MISSED:
        await this.handleCalleeMissed(event);
        break;

      case WebhookEventTypes.CALLEE_ENDED:
        await this.handleCalleeEnded(event);
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

    // Log full payload for debugging (structure verification)
    logger.debug('Full call history completed payload', {
      payload: JSON.stringify(event.payload.object),
    });

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
   * Handle callee ringing event (incoming call notification)
   */
  private async handleCalleeRinging(event: ZoomWebhookEvent): Promise<void> {
    const payload = event.payload.object as CalleeRingingPayload;

    logger.info('Callee ringing event received', {
      callId: payload.call_id,
      callerNumber: payload.caller?.phone_number,
      calleeNumber: payload.callee?.phone_number,
    });

    // Log full payload for debugging (structure verification)
    logger.debug('Full callee ringing payload', {
      payload: JSON.stringify(event.payload.object),
    });

    // Execute all registered callbacks
    for (const callback of this.calleeRingingCallbacks) {
      try {
        await callback(payload);
      } catch (error) {
        logger.error('Error in callee ringing callback', error as Error, {
          callId: payload.call_id,
        });
      }
    }
  }

  /**
   * Handle callee answered event
   */
  private async handleCalleeAnswered(event: ZoomWebhookEvent): Promise<void> {
    const payload = event.payload.object as GenericCallEventPayload;

    logger.info('Callee answered event received', {
      callId: payload.call_id,
      callerNumber: payload.caller_number || payload.caller?.phone_number,
      calleeNumber: payload.callee_number || payload.callee?.phone_number,
    });

    // Log full payload for debugging (structure verification)
    logger.debug('Full callee answered payload', {
      payload: JSON.stringify(event.payload.object),
    });

    // Execute all registered callbacks
    for (const callback of this.calleeAnsweredCallbacks) {
      try {
        await callback(payload);
      } catch (error) {
        logger.error('Error in callee answered callback', error as Error, {
          callId: payload.call_id,
        });
      }
    }
  }

  /**
   * Handle callee missed event
   */
  private async handleCalleeMissed(event: ZoomWebhookEvent): Promise<void> {
    const payload = event.payload.object as GenericCallEventPayload;

    logger.info('Callee missed event received', {
      callId: payload.call_id,
      callerNumber: payload.caller_number || payload.caller?.phone_number,
      calleeNumber: payload.callee_number || payload.callee?.phone_number,
    });

    // Log full payload for debugging (structure verification)
    logger.debug('Full callee missed payload', {
      payload: JSON.stringify(event.payload.object),
    });

    // Execute all registered callbacks
    for (const callback of this.calleeMissedCallbacks) {
      try {
        await callback(payload);
      } catch (error) {
        logger.error('Error in callee missed callback', error as Error, {
          callId: payload.call_id,
        });
      }
    }
  }

  /**
   * Handle callee ended event
   */
  private async handleCalleeEnded(event: ZoomWebhookEvent): Promise<void> {
    const payload = event.payload.object as GenericCallEventPayload;

    logger.info('Callee ended event received', {
      callId: payload.call_id,
      callerNumber: payload.caller_number || payload.caller?.phone_number,
      calleeNumber: payload.callee_number || payload.callee?.phone_number,
    });

    // Log full payload for debugging (structure verification)
    logger.debug('Full callee ended payload', {
      payload: JSON.stringify(event.payload.object),
    });

    // Execute all registered callbacks
    for (const callback of this.calleeEndedCallbacks) {
      try {
        await callback(payload);
      } catch (error) {
        logger.error('Error in callee ended callback', error as Error, {
          callId: payload.call_id,
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
