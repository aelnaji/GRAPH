'use client';

import { useKnowledgeStore } from '@/store/knowledge-store';
import { X, ExternalLink, Tag, Activity, Shield, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NodeDetailPanel() {
  const node = useKnowledgeStore((s) => s.selectedNode);
  const setSelectedNode = useKnowledgeStore((s) => s.setSelectedNode);

  if (!node) return null;

  const confidencePct = Math.round(node.confidence * 100);
  const noveltyPct = Math.round(node.novelty * 100);
  const urgencyPct = Math.round(node.urgency * 100);
  const arousalPct = Math.round(node.arousal * 100);

  const confidenceColor =
    confidencePct >= 70 ? 'text-emerald-400' :
    confidencePct >= 40 ? 'text-amber-400' :
    'text-red-400';

  return (
    <div className="absolute top-3 right-3 z-20 w-80">
      <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: node.color }} />
            <span className="text-xs font-mono text-white/50 uppercase tracking-wider">{node.type}</span>
          </div>
          <div className="flex items-center gap-1">
            {node.verified && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-[10px] gap-1">
                <Shield className="w-3 h-3" /> Verified
              </Badge>
            )}
            {node.promoted && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/40 text-[10px] gap-1">
                <Award className="w-3 h-3" /> Promoted
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10"
              onClick={() => setSelectedNode(null)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-96">
          {/* Content */}
          <div className="px-4 py-3 space-y-4">
            <p className="text-sm text-white/90 leading-relaxed">{node.fullName}</p>

            {/* Source */}
            <div className="text-xs text-white/40 font-mono">
              Source: <span className="text-white/60">{node.source}</span>
              {' | '}Accesses: <span className="text-white/60">{node.accessCount}</span>
            </div>

            <Separator className="bg-white/10" />

            {/* Metrics */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" /> Confidence
                </span>
                <span className={`text-xs font-mono font-bold ${confidenceColor}`}>{confidencePct}%</span>
              </div>
              <Progress value={confidencePct} className="h-1.5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Novelty</span>
                <span className="text-xs font-mono font-bold text-sky-400">{noveltyPct}%</span>
              </div>
              <Progress value={noveltyPct} className="h-1.5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Urgency</span>
                <span className="text-xs font-mono font-bold text-orange-400">{urgencyPct}%</span>
              </div>
              <Progress value={urgencyPct} className="h-1.5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Arousal</span>
                <span className="text-xs font-mono font-bold text-purple-400">{arousalPct}%</span>
              </div>
              <Progress value={arousalPct} className="h-1.5" />
            </div>

            {/* Valence */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">Valence</span>
              <span className={`text-xs font-mono font-bold ${node.valence >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {node.valence >= 0 ? '+' : ''}{node.valence.toFixed(2)}
              </span>
            </div>

            {/* Tags */}
            {node.tags.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs text-white/40 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" /> Tags
                </span>
                <div className="flex flex-wrap gap-1">
                  {node.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] bg-white/5 text-white/60 border-white/10">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ID */}
            <div className="text-[10px] text-white/20 font-mono break-all">
              ID: {node.id}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
