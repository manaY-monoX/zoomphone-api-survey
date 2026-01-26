/**
 * Zoom webhook event
 */
export interface ZoomWebhookEvent {
  event: string;
  event_ts: number;
  payload: {
    account_id: string;
    object: CallHistoryCompletedPayload | Record<string, unknown>;
  };
}

/**
 * Call history completed payload
 */
export interface CallHistoryCompletedPayload {
  call_id: string;
  call_log_id: string;
  caller_number: string;
  callee_number: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  start_time: string;
  end_time: string;
  result: string;
}

/**
 * Webhook event types
 */
export const WebhookEventTypes = {
  CALLEE_CALL_HISTORY_COMPLETED: 'phone.callee_call_history_completed',
  CALLER_CALL_HISTORY_COMPLETED: 'phone.caller_call_history_completed',
} as const;

export type WebhookEventType = (typeof WebhookEventTypes)[keyof typeof WebhookEventTypes];

/**
 * Webhook handler interface
 */
export interface IWebhookHandler {
  handleEvent(event: ZoomWebhookEvent): Promise<void>;
  onCallCompleted(callback: (payload: CallHistoryCompletedPayload) => Promise<void>): void;
}

/**
 * Webhook server interface
 */
export interface IWebhookServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: ZoomWebhookEvent) => Promise<void>): void;
}
