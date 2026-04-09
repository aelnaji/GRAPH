'use client';

import { useEffect, useState, useRef } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, RefreshCw, Filter, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LogsPanel() {
  const logs = useKnowledgeStore((s) => s.logs);
  const setLogs = useKnowledgeStore((s) => s.setLogs);
  const [filter, setFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter !== 'all') params.set('category', filter);
      if (levelFilter !== 'all') params.set('level', levelFilter);
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.success) setLogs(data.logs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter, levelFilter, setLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filter !== 'all' && log.category !== filter) return false;
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    return true;
  });

  const levelColor: Record<string, string> = {
    debug: 'text-white/30',
    info: 'text-sky-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
  };

  const categoryColor: Record<string, string> = {
    agent: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    policy: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    memory: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    system: 'bg-white/10 text-white/50 border-white/20',
    graph: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-medium text-white/90">System Logs</span>
        </div>
        <Button
          onClick={fetchLogs}
          disabled={loading}
          size="sm"
          variant="ghost"
          className="h-7 text-white/40 hover:text-white/80 hover:bg-white/5"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-white/10 flex gap-2">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-white/30" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-24 h-6 bg-white/5 border-white/10 text-[10px] text-white/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="policy">Policy</SelectItem>
              <SelectItem value="memory">Memory</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="graph">Graph</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-20 h-6 bg-white/5 border-white/10 text-[10px] text-white/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log entries */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {filteredLogs.length === 0 && (
            <div className="text-center py-8 text-xs text-white/30">
              No log entries
            </div>
          )}

          {filteredLogs.slice(0, 100).map((log) => (
            <div
              key={log.id}
              className="bg-white/[0.03] border border-white/5 rounded px-2.5 py-1.5 space-y-1"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[9px] font-mono uppercase ${levelColor[log.level] || 'text-white/30'}`}>
                  {log.level}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[8px] px-1 py-0 ${categoryColor[log.category] || ''}`}
                >
                  {log.category}
                </Badge>
                <span className="text-[9px] text-white/20 font-mono ml-auto">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-[10px] text-white/60">
                <span className="text-white/40 font-mono">{log.eventType}</span>
                {log.agentName && (
                  <span className="text-white/20 ml-1.5">[{log.agentName}]</span>
                )}
              </div>
              {Object.keys(log.payload).length > 0 && (
                <pre className="text-[9px] text-white/30 font-mono truncate">
                  {JSON.stringify(log.payload)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
