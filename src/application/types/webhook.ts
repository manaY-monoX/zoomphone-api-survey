/**
 * Zoom webhook event
 */
export interface ZoomWebhookEvent {
  event: string;
  event_ts: number;
  payload: {
    account_id: string;
    object: CallHistoryCompletedPayload | CalleeRingingPayload | GenericCallEventPayload | Record<string, unknown>;
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
 * Callee ringing payload (incoming call notification)
 * Note: Actual payload structure may vary - verify during testing
 */
export interface CalleeRingingPayload {
  call_id: string;
  caller: {
    phone_number: string;
    name?: string;
    caller_id?: string;
    connection_type?: string; // "pstn_off_net", "voip" など
    extension_number?: number; // 外部発信時は電話番号がセットされる
  };
  callee: {
    phone_number: string;
    user_id?: string;
    extension_number?: string;
    device_type?: string;
  };
}

/**
 * Generic call event payload (for answered, missed, ended events)
 * Note: Actual payload structure may vary - verify during testing
 */
export interface GenericCallEventPayload {
  call_id: string;
  caller_number?: string;
  callee_number?: string;
  caller?: {
    phone_number: string;
    name?: string;
    caller_id?: string;
    connection_type?: string; // "pstn_off_net", "voip" など
    extension_number?: number; // 外部発信時は電話番号がセットされる
  };
  callee?: {
    phone_number: string;
    user_id?: string;
    extension_number?: string;
    device_type?: string;
  };
  [key: string]: unknown;
}

/**
 * Webhook event types
 */
export const WebhookEventTypes = {
  CALLEE_CALL_HISTORY_COMPLETED: 'phone.callee_call_history_completed',
  CALLER_CALL_HISTORY_COMPLETED: 'phone.caller_call_history_completed',
  CALLEE_RINGING: 'phone.callee_ringing',
  CALLEE_ANSWERED: 'phone.callee_answered',
  CALLEE_MISSED: 'phone.callee_missed',
  CALLEE_ENDED: 'phone.callee_ended',
} as const;

export type WebhookEventType = (typeof WebhookEventTypes)[keyof typeof WebhookEventTypes];

/**
 * Webhook handler interface
 */
export interface IWebhookHandler {
  handleEvent(event: ZoomWebhookEvent): Promise<void>;
  onCallCompleted(callback: (payload: CallHistoryCompletedPayload) => Promise<void>): void;
  onCalleeRinging(callback: (payload: CalleeRingingPayload) => Promise<void>): void;
  onCalleeAnswered(callback: (payload: GenericCallEventPayload) => Promise<void>): void;
  onCalleeMissed(callback: (payload: GenericCallEventPayload) => Promise<void>): void;
  onCalleeEnded(callback: (payload: GenericCallEventPayload) => Promise<void>): void;
}

/**
 * Webhook server interface
 */
export interface IWebhookServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: ZoomWebhookEvent) => Promise<void>): void;
}
