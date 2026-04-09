'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Brain, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useKnowledgeStore((s) => s.chatMessages);
  const addChatMessage = useKnowledgeStore((s) => s.addChatMessage);
  const setIsLoading = useKnowledgeStore((s) => s.setIsLoading);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput('');
    setSending(true);
    setIsLoading(true);

    // Add user message to local state immediately
    const userMsg = {
      id: `local_${Date.now()}`,
      role: 'user' as const,
      content,
      processed: false,
      createdAt: new Date().toISOString(),
    };
    addChatMessage(userMsg);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(`Error: ${data.error}`);
        return;
      }

      // Add system response
      if (data.state) {
        const sysMsg = {
          id: `sys_${Date.now()}`,
          role: 'system' as const,
          content: `Knowledge ingested [confidence: ${(data.state.confidence * 100).toFixed(0)}% | novelty: ${(data.state.novelty * 100).toFixed(0)}%]`,
          processed: true,
          nodeId: data.nodeId,
          createdAt: new Date().toISOString(),
        };
        addChatMessage(sysMsg);
      }

      toast.success('Knowledge processed and mapped to graph');
    } catch (error) {
      toast.error('Failed to process message');
    } finally {
      setSending(false);
      setIsLoading(false);
    }
  }, [input, sending, addChatMessage, setIsLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Brain className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium text-white/90">Knowledge Chat</span>
        <span className="text-[10px] text-white/30 font-mono ml-auto">
          Every message feeds the graph
        </span>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
        <div className="space-y-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="w-8 h-8 text-emerald-500/30 mb-3" />
              <p className="text-xs text-white/40">Send a message to start building your knowledge graph</p>
              <p className="text-[10px] text-white/20 mt-1">Messages are chunked, verified, and mapped in real-time</p>
            </div>
          )}

          {[...messages].reverse().map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 ml-4'
                  : msg.role === 'system'
                  ? 'bg-amber-500/10 border border-amber-500/20 mr-2'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 ${
                    msg.role === 'user'
                      ? 'text-emerald-400 border-emerald-500/30'
                      : msg.role === 'system'
                      ? 'text-amber-400 border-amber-500/30'
                      : 'text-white/40 border-white/10'
                  }`}
                >
                  {msg.role}
                </Badge>
                {msg.nodeId && (
                  <span className="text-[9px] text-white/20 font-mono truncate max-w-20">
                    node:{msg.nodeId.slice(0, 6)}
                  </span>
                )}
              </div>
              <p className="text-white/80 leading-relaxed break-words">{msg.content}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a knowledge statement..."
            className="min-h-[40px] max-h-[100px] resize-none bg-white/5 border-white/10 text-sm text-white/90 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            size="icon"
            className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white h-10 w-10"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
