'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Upload, Loader2, FileText, Zap } from 'lucide-react';
import { useKnowledgeStore, type GraphNode } from '@/store/knowledge-store';
import { toast } from 'sonner';

export function QueryPanel() {
  const [query, setQuery] = useState('');
  const [bulkContent, setBulkContent] = useState('');
  const [source, setSource] = useState('manual');
  const [type, setType] = useState('concept');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ nodes: GraphNode[]; links: any[] }> | null>(null);
  const setIsLoading = useKnowledgeStore((s) => s.setIsLoading);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/query?q=${encodeURIComponent(query)}&limit=30`);
      const data = await res.json();
      setResults(data);
      toast.success(`Found ${data.nodes?.length || 0} nodes`);
    } catch {
      toast.error('Query failed');
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: query,
          source,
          type,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Knowledge ingested: ${data.action} (confidence: ${(data.state.confidence * 100).toFixed(0)}%)`);
        setQuery('');
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Ingest failed');
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleBulkIngest = async () => {
    if (!bulkContent.trim()) return;
    setLoading(true);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: bulkContent,
          source: 'upload',
          type,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Bulk ingest complete: ${data.action}`);
        setBulkContent('');
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Bulk ingest failed');
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Search className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-medium text-white/90">Query & Ingest</span>
      </div>

      <ScrollArea className="flex-1 px-4 py-3 space-y-4">
        {/* Search */}
        <div className="space-y-2">
          <span className="text-xs text-white/40 font-mono uppercase tracking-wider">Search Graph</span>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="bg-white/5 border-white/10 text-sm text-white/90 placeholder:text-white/20"
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            />
            <Button
              onClick={handleQuery}
              disabled={loading || !query.trim()}
              size="sm"
              variant="outline"
              className="shrink-0 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Ingest */}
        <div className="space-y-2">
          <span className="text-xs text-white/40 font-mono uppercase tracking-wider">Ingest Knowledge</span>
          <div className="grid grid-cols-2 gap-2">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="bg-white/5 border-white/10 text-xs text-white/70 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="upload">Upload</SelectItem>
                <SelectItem value="inference">Inference</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="bg-white/5 border-white/10 text-xs text-white/70 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="entity">Entity</SelectItem>
                <SelectItem value="fact">Fact</SelectItem>
                <SelectItem value="decision">Decision</SelectItem>
                <SelectItem value="pattern">Pattern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleIngest}
            disabled={loading || !query.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Zap className="w-3.5 h-3.5 mr-2" />}
            Ingest Statement
          </Button>
        </div>

        {/* Bulk Ingest */}
        <div className="space-y-2">
          <span className="text-xs text-white/40 font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Upload className="w-3 h-3" /> Bulk Upload
          </span>
          <Textarea
            value={bulkContent}
            onChange={(e) => setBulkContent(e.target.value)}
            placeholder="Paste multiple statements separated by newlines..."
            className="min-h-[80px] max-h-[150px] resize-none bg-white/5 border-white/10 text-xs text-white/90 placeholder:text-white/20"
          />
          <Button
            onClick={handleBulkIngest}
            disabled={loading || !bulkContent.trim()}
            variant="outline"
            className="w-full border-white/20 text-white/70 hover:bg-white/5 text-xs h-8"
          >
            <FileText className="w-3.5 h-3.5 mr-2" />
            Bulk Ingest
          </Button>
        </div>

        {/* Search Results */}
        {results && results.nodes && results.nodes.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-white/40 font-mono uppercase tracking-wider">
              Results ({results.nodes.length})
            </span>
            <div className="space-y-1.5">
              {results.nodes.slice(0, 10).map((node) => (
                <div
                  key={node.id}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-1"
                >
                  <p className="text-white/80 line-clamp-2">{node.fullName || node.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-white/40 border-white/10">
                      {node.type}
                    </Badge>
                    <span className="text-[9px] text-emerald-400/60 font-mono">
                      {(node.confidence * 100).toFixed(0)}%
                    </span>
                    {node.verified && (
                      <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400">verified</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
