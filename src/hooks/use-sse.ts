'use client';

import { useEffect, useRef } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';
import type { GraphUpdateEvent } from '@/lib/agents/types';

export function useSSE() {
  const processEvent = useKnowledgeStore((s) => s.processEvent);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const controller = new AbortController();

    async function connect() {
      if (!mountedRef.current) return;

      try {
        const res = await fetch('/api/events', {
          signal: controller.signal,
        });

        if (!res.ok) {
          // Don't log 504 to avoid spam - just reconnect
          attemptRef.current++;
          const delay = Math.min(3000 * Math.pow(1.5, Math.min(attemptRef.current, 5)), 15000);
          if (mountedRef.current) {
            timerRef.current = setTimeout(connect, delay);
          }
          return;
        }

        // Successful connection - reset attempt counter
        attemptRef.current = 0;

        const reader = res.body?.getReader();
        if (!reader) {
          if (mountedRef.current) timerRef.current = setTimeout(connect, 2000);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: GraphUpdateEvent = JSON.parse(line.slice(6));
                processEvent(event);
              } catch {
                // Skip malformed events
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && mountedRef.current) {
          attemptRef.current++;
          const delay = Math.min(3000 * Math.pow(1.5, Math.min(attemptRef.current, 5)), 15000);
          timerRef.current = setTimeout(connect, delay);
        }
      }
    }

    // Initial connection with a small delay to let the page render first
    timerRef.current = setTimeout(connect, 500);

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [processEvent]);
}
