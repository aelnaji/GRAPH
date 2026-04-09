import { eventBus } from '@/lib/agents';
import type { GraphUpdateEvent } from '@/lib/agents/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: GraphUpdateEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Send initial connection event
      sendEvent({
        type: 'log',
        data: { message: 'SSE connection established', level: 'info' },
        timestamp: Date.now(),
      });

      // Subscribe to event bus
      const unsubscribe = eventBus.subscribe(sendEvent);

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAlive);
          unsubscribe();
        }
      }, 30000);

      // Clean up on close
      controller.close = new Proxy(controller.close, {
        apply(target, thisArg, args) {
          clearInterval(keepAlive);
          unsubscribe();
          return Reflect.apply(target, thisArg, args);
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
