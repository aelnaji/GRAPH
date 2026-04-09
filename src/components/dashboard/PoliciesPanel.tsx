'use client';

import { useEffect, useState } from 'react';
import { useKnowledgeStore } from '@/store/knowledge-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Settings, RefreshCw, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function PoliciesPanel() {
  const policies = useKnowledgeStore((s) => s.policies);
  const setPolicies = useKnowledgeStore((s) => s.setPolicies);
  const [loading, setLoading] = useState(false);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Record<string, number>>({});

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/policies');
      const data = await res.json();
      if (data.success) {
        setPolicies(data.policies);
        const values: Record<string, number> = {};
        data.policies.forEach((p: any) => { values[p.key] = p.value; });
        setLocalValues(values);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [setPolicies]);

  const updatePolicy = async (key: string, value: number) => {
    setUpdatingKey(key);
    try {
      const res = await fetch('/api/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalValues((prev) => ({ ...prev, [key]: value }));
        toast.success(`Policy ${key} updated to ${value}`);
      }
    } catch {
      toast.error('Failed to update policy');
    } finally {
      setUpdatingKey(null);
    }
  };

  const resetPolicies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Maintenance cycle ran (includes policy adjustments)');
        fetchPolicies();
      }
    } catch {
      toast.error('Failed to reset');
    } finally {
      setLoading(false);
    }
  };

  // Group policies by category
  const grouped: Record<string, typeof policies> = {};
  policies.forEach((p) => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  const categoryLabels: Record<string, string> = {
    routing: 'Routing',
    retry: 'Retry',
    attention: 'Attention',
    decay: 'Decay',
    threshold: 'Thresholds',
  };

  const categoryColors: Record<string, string> = {
    routing: 'text-emerald-400',
    retry: 'text-amber-400',
    attention: 'text-sky-400',
    decay: 'text-red-400',
    threshold: 'text-violet-400',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-white/90">Policy Config</span>
        </div>
        <Button
          onClick={resetPolicies}
          disabled={loading}
          size="sm"
          variant="ghost"
          className="h-7 text-white/40 hover:text-white/80 hover:bg-white/5 text-[10px]"
        >
          <RotateCcw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Adapt
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 py-3 space-y-4">
        {Object.entries(grouped).map(([category, pols]) => (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-mono uppercase tracking-wider ${categoryColors[category] || 'text-white/50'}`}>
                {categoryLabels[category] || category}
              </span>
              <Badge variant="outline" className="text-[9px] text-white/20 border-white/10">
                {pols.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {pols.map((policy) => {
                const shortKey = policy.key.includes('.')
                  ? policy.key.split('.').slice(1).join('.')
                  : policy.key;
                const isUpdating = updatingKey === policy.key;

                return (
                  <div
                    key={policy.key}
                    className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/50 font-mono">{shortKey}</span>
                      <span className="text-xs font-mono font-bold text-white/80">
                        {localValues[policy.key]?.toFixed(2) ?? policy.value.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[localValues[policy.key] ?? policy.value]}
                        min={0}
                        max={policy.category === 'decay' ? 0.1 : 2}
                        step={policy.category === 'decay' ? 0.005 : 0.05}
                        onValueChange={([val]) => updatePolicy(policy.key, val)}
                        className="flex-1"
                        disabled={isUpdating}
                      />
                      {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-white/30" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
