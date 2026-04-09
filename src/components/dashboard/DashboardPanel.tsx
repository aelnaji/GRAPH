'use client';

import { useEffect, useState } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, RefreshCw, TrendingUp, Shield, Award, BarChart3, Zap, Cpu, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

export function DashboardPanel() {
  const cognitionState = useKnowledgeStore((s) => s.cognitionState);
  const setCognitionState = useKnowledgeStore((s) => s.setCognitionState);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [attention, setAttention] = useState<any[]>([]);
  const [routingWeights, setRoutingWeights] = useState<Record<string, number>>({});
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success) {
        setCognitionState(data.state);
        setSystemHealth(data.systemHealth);
        setAttention(data.attention || []);
        setRoutingWeights(data.routingWeights || {});
        setThresholds(data.thresholds || {});
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [setCognitionState]);

  const runMaintenance = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Maintenance: decayed ${data.decayed}, consolidated ${data.consolidated}, adjusted ${data.policyAdjustments} policies`);
        fetchDashboard();
      }
    } catch {
      toast.error('Maintenance failed');
    } finally {
      setLoading(false);
    }
  };

  const state = cognitionState;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white/90">System Dashboard</span>
        </div>
        <Button
          onClick={runMaintenance}
          disabled={loading}
          size="sm"
          variant="outline"
          className="h-7 text-[10px] border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Maintenance
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 py-3 space-y-4">
        {/* Core Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            icon={<BarChart3 className="w-3.5 h-3.5" />}
            label="Total Nodes"
            value={state?.totalNodes ?? 0}
            color="text-emerald-400"
          />
          <MetricCard
            icon={<GitBranch className="w-3.5 h-3.5" />}
            label="Total Edges"
            value={state?.totalEdges ?? 0}
            color="text-sky-400"
          />
          <MetricCard
            icon={<Shield className="w-3.5 h-3.5" />}
            label="Verified"
            value={state?.verifiedCount ?? 0}
            color="text-emerald-400"
          />
          <MetricCard
            icon={<Award className="w-3.5 h-3.5" />}
            label="Promoted"
            value={state?.promotedCount ?? 0}
            color="text-yellow-400"
          />
        </div>

        {/* Average Scores */}
        <div className="space-y-2.5">
          <span className="text-xs text-white/40 font-mono uppercase tracking-wider">Cognition Metrics</span>

          <ScoreBar
            label="Avg Confidence"
            value={state?.avgConfidence ?? 0}
            color="emerald"
            pct={Math.round((state?.avgConfidence ?? 0) * 100)}
          />
          <ScoreBar
            label="Avg Novelty"
            value={state?.avgNovelty ?? 0}
            color="sky"
            pct={Math.round((state?.avgNovelty ?? 0) * 100)}
          />
          <ScoreBar
            label="Avg Urgency"
            value={state?.avgUrgency ?? 0}
            color="orange"
            pct={Math.round((state?.avgUrgency ?? 0) * 100)}
          />
          <ScoreBar
            label="Health Score"
            value={systemHealth?.healthScore ?? 0}
            color="violet"
            pct={Math.round((systemHealth?.healthScore ?? 0) * 100)}
          />
        </div>

        {/* Routing Weights */}
        {Object.keys(routingWeights).length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-white/40 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> Routing Weights
            </span>
            <div className="space-y-1.5">
              {Object.entries(routingWeights).map(([key, value]) => {
                const shortKey = key.replace('routing.', '');
                return (
                  <div key={key} className="flex items-center justify-between bg-white/5 rounded px-2 py-1.5">
                    <span className="text-[10px] text-white/50 font-mono">{shortKey}</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{value.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attention Profile */}
        {attention.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-white/40 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Attention Focus
            </span>
            <div className="space-y-1.5">
              {attention.slice(0, 5).map((item) => (
                <div key={item.id} className="bg-white/5 rounded px-2 py-1.5 space-y-0.5">
                  <p className="text-[10px] text-white/70 truncate">{item.content}</p>
                  <div className="flex items-center gap-2">
                    <Progress value={item.attentionScore * 100} className="h-1 flex-1" />
                    <span className="text-[9px] text-amber-400 font-mono">
                      {(item.attentionScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Stats */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-lg font-bold text-white/90">{state?.recentLogs ?? 0}</div>
            <div className="text-[9px] text-white/30 font-mono uppercase">Recent Logs</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-lg font-bold text-white/90">{state?.policyCount ?? 0}</div>
            <div className="text-[9px] text-white/30 font-mono uppercase">Active Policies</div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-2">
      <div className={`${color}`}>{icon}</div>
      <div>
        <div className="text-lg font-bold text-white/90">{value}</div>
        <div className="text-[9px] text-white/30 font-mono uppercase">{label}</div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, color, pct }: { label: string; value: number; color: string; pct: number }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    orange: 'bg-orange-500',
    violet: 'bg-violet-500',
    red: 'bg-red-500',
  };
  const textMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    orange: 'text-orange-400',
    violet: 'text-violet-400',
    red: 'text-red-400',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/50">{label}</span>
        <span className={`text-xs font-mono font-bold ${textMap[color]}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
