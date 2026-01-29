import { WebhookHandler } from '../../../src/application/services/WebhookHandler';
import { ZoomWebhookEvent, CallHistoryCompletedPayload, CalleeRingingPayload } from '../../../src/application/types';

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    zoom: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/oauth/callback',
      apiBaseUrl: 'https://api.zoom.us/v2',
    },
    webhook: {
      port: 3001,
      secretToken: 'test-secret',
    },
    logging: {
      level: 'error',
    },
    storage: {
      recordingsOutputDir: './recordings',
    },
  },
}));

// Mock logger
jest.mock('../../../src/infrastructure/logging/Logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('WebhookHandler', () => {
  let webhookHandler: WebhookHandler;

  const createCallCompletedEvent = (callLogId: string): ZoomWebhookEvent => ({
    event: 'phone.caller_call_history_completed',
    event_ts: Date.now(),
    payload: {
      account_id: 'account-123',
      object: {
        call_id: 'call-1',
        call_log_id: callLogId,
        caller_number: '+1234567890',
        callee_number: '+0987654321',
        direction: 'outbound',
        duration: 120,
        start_time: '2024-01-15T10:00:00Z',
        end_time: '2024-01-15T10:02:00Z',
        result: 'Answered',
      } as CallHistoryCompletedPayload,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    webhookHandler = new WebhookHandler();
  });

  describe('handleEvent', () => {
    it('should process call history completed event', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCallCompleted(callbackMock);

      const event = createCallCompletedEvent('call-log-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).toHaveBeenCalledTimes(1);
      expect(callbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          call_log_id: 'call-log-1',
          caller_number: '+1234567890',
        })
      );
    });

    it('should handle callee call history completed event', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCallCompleted(callbackMock);

      const event: ZoomWebhookEvent = {
        event: 'phone.callee_call_history_completed',
        event_ts: Date.now(),
        payload: {
          account_id: 'account-123',
          object: {
            call_id: 'call-1',
            call_log_id: 'call-log-callee',
            caller_number: '+1234567890',
            callee_number: '+0987654321',
            direction: 'inbound',
            duration: 60,
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T10:01:00Z',
            result: 'Answered',
          } as CallHistoryCompletedPayload,
        },
      };

      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).toHaveBeenCalledTimes(1);
    });

    it('should ignore unknown event types', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCallCompleted(callbackMock);

      const event: ZoomWebhookEvent = {
        event: 'unknown.event.type',
        event_ts: Date.now(),
        payload: {
          account_id: 'account-123',
          object: {},
        },
      };

      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should deduplicate events by call_log_id', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCallCompleted(callbackMock);

      const event = createCallCompletedEvent('call-log-1');

      // Send same event twice
      await webhookHandler.handleEvent(event);
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only be called once
      expect(callbackMock).toHaveBeenCalledTimes(1);
    });

    it('should process different events separately', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCallCompleted(callbackMock);

      const event1 = createCallCompletedEvent('call-log-1');
      const event2 = createCallCompletedEvent('call-log-2');

      await webhookHandler.handleEvent(event1);
      await webhookHandler.handleEvent(event2);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('callback registration', () => {
    it('should support multiple callbacks', async () => {
      const callback1 = jest.fn().mockResolvedValue(undefined);
      const callback2 = jest.fn().mockResolvedValue(undefined);

      webhookHandler.onCallCompleted(callback1);
      webhookHandler.onCallCompleted(callback2);

      const event = createCallCompletedEvent('call-log-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should continue processing if a callback throws', async () => {
      const callback1 = jest.fn().mockRejectedValue(new Error('Callback error'));
      const callback2 = jest.fn().mockResolvedValue(undefined);

      webhookHandler.onCallCompleted(callback1);
      webhookHandler.onCallCompleted(callback2);

      const event = createCallCompletedEvent('call-log-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue management', () => {
    it('should track queue length', async () => {
      expect(webhookHandler.getQueueLength()).toBe(0);
    });

    it('should track processed event count', async () => {
      const event = createCallCompletedEvent('call-log-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(webhookHandler.getProcessedEventCount()).toBe(1);
    });
  });

  describe('callee ringing events', () => {
    const createCalleeRingingEvent = (callId: string): ZoomWebhookEvent => ({
      event: 'phone.callee_ringing',
      event_ts: Date.now(),
      payload: {
        account_id: 'account-123',
        object: {
          call_id: callId,
          caller: {
            phone_number: '+81901234567',
            name: 'Test Caller',
          },
          callee: {
            phone_number: '+81312345678',
            user_id: 'user-123',
            extension_number: '1001',
            device_type: 'desktop',
          },
        } as CalleeRingingPayload,
      },
    });

    it('should process callee ringing event', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCalleeRinging(callbackMock);

      const event = createCalleeRingingEvent('call-ringing-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).toHaveBeenCalledTimes(1);
      expect(callbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          call_id: 'call-ringing-1',
          caller: expect.objectContaining({
            phone_number: '+81901234567',
          }),
        })
      );
    });

    it('should deduplicate callee ringing events by call_id', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCalleeRinging(callbackMock);

      const event = createCalleeRingingEvent('call-ringing-1');

      // Send same event twice
      await webhookHandler.handleEvent(event);
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only be called once
      expect(callbackMock).toHaveBeenCalledTimes(1);
    });

    it('should support multiple callee ringing callbacks', async () => {
      const callback1 = jest.fn().mockResolvedValue(undefined);
      const callback2 = jest.fn().mockResolvedValue(undefined);

      webhookHandler.onCalleeRinging(callback1);
      webhookHandler.onCalleeRinging(callback2);

      const event = createCalleeRingingEvent('call-ringing-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should continue processing if a callee ringing callback throws', async () => {
      const callback1 = jest.fn().mockRejectedValue(new Error('Callback error'));
      const callback2 = jest.fn().mockResolvedValue(undefined);

      webhookHandler.onCalleeRinging(callback1);
      webhookHandler.onCalleeRinging(callback2);

      const event = createCalleeRingingEvent('call-ringing-1');
      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle callee ringing event with minimal payload', async () => {
      const callbackMock = jest.fn().mockResolvedValue(undefined);
      webhookHandler.onCalleeRinging(callbackMock);

      // Minimal payload (only required fields)
      const event: ZoomWebhookEvent = {
        event: 'phone.callee_ringing',
        event_ts: Date.now(),
        payload: {
          account_id: 'account-123',
          object: {
            call_id: 'call-minimal',
            caller: {
              phone_number: '+81901234567',
            },
            callee: {
              phone_number: '+81312345678',
            },
          } as CalleeRingingPayload,
        },
      };

      await webhookHandler.handleEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbackMock).toHaveBeenCalledTimes(1);
      expect(callbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          call_id: 'call-minimal',
        })
      );
    });
  });
});
