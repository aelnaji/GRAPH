'use client';

import { useEffect, useCallback, useState } from 'react';
import { useKnowledgeStore, type SidebarTab } from '@/store/knowledge-store';
import { useSSE } from '@/hooks/use-sse';
import { KnowledgeGraphCanvas } from '@/components/knowledge-graph/KnowledgeGraphCanvas';
import { NodeDetailPanel } from '@/components/knowledge-graph/NodeDetailPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { QueryPanel } from '@/components/chat/QueryPanel';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { LogsPanel } from '@/components/dashboard/LogsPanel';
import { PoliciesPanel } from '@/components/dashboard/PoliciesPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Search,
  Activity,
  ScrollText,
  Settings,
  PanelRightOpen,
  PanelRightClose,
  Eye,
  Zap,
} from 'lucide-react';

const tabs: { id: SidebarTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'chat', label: 'Chat', icon: <Brain className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
  { id: 'query', label: 'Query', icon: <Search className="w-3.5 h-3.5" />, color: 'text-sky-400' },
  { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-3.5 h-3.5" />, color: 'text-violet-400' },
  { id: 'logs', label: 'Logs', icon: <ScrollText className="w-3.5 h-3.5" />, color: 'text-amber-400' },
  { id: 'policies', label: 'Policies', icon: <Settings className="w-3.5 h-3.5" />, color: 'text-orange-400' },
];

export default function HomePage() {
  useSSE();

  const sidebarTab = useKnowledgeStore((s) => s.sidebarTab);
  const setSidebarTab = useKnowledgeStore((s) => s.setSidebarTab);
  const eventLog = useKnowledgeStore((s) => s.eventLog);
  const nodes = useKnowledgeStore((s) => s.nodes);
  const links = useKnowledgeStore((s) => s.links);
  const setGraphData = useKnowledgeStore((s) => s.setGraphData);
  const setCognitionState = useKnowledgeStore((s) => s.setCognitionState);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [eventPanelOpen, setEventPanelOpen] = useState(false);

  const fetchInitialData = useCallback(async () => {
    try {
      const [graphRes, dashboardRes] = await Promise.all([
        fetch('/api/graph'),
        fetch('/api/dashboard'),
      ]);
      const graphData = await graphRes.json();
      if (graphData.success) {
        setGraphData(graphData.nodes, graphData.links);
      }
      const dashData = await dashboardRes.json();
      if (dashData.success) {
        setCognitionState(dashData.state);
      }
    } catch (e) {
      console.error('Failed to fetch initial data', e);
    }
  }, [setGraphData, setCognitionState]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 h-11 border-b border-white/10 flex items-center px-4 justify-between bg-black/40 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-sm font-semibold text-white/90 tracking-tight">Cognition Engine</h1>
          </div>
          <Badge variant="outline" className="text-[9px] text-emerald-400/70 border-emerald-500/20 ml-1">LIVE</Badge>
          <span className="text-[9px] text-white/20 font-mono hidden sm:inline">Self-improving knowledge graph</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button onClick={() => setEventPanelOpen(!eventPanelOpen)} variant="ghost" size="sm" className={`h-7 text-xs gap-1 ${eventPanelOpen ? 'text-amber-400 bg-amber-500/10' : 'text-white/40 hover:text-white/70'}`}>
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">Events</span>
            {eventLog.length > 0 && <Badge variant="outline" className="text-[8px] text-amber-400 border-amber-500/20 ml-1 px-1">{eventLog.length}</Badge>}
          </Button>
          <Button onClick={() => setSidebarOpen(!sidebarOpen)} variant="ghost" size="sm" className="h-7 text-white/40 hover:text-white/70">
            {sidebarOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph Area */}
        <div className="flex-1 relative bg-[#06060a]">
          <KnowledgeGraphCanvas />
          <NodeDetailPanel />

          {/* Stats overlay */}
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs font-mono space-y-0.5">
              <div className="text-emerald-400">Nodes: <span className="text-white">{nodes.length}</span></div>
              <div className="text-amber-400">Edges: <span className="text-white">{links.length}</span></div>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10">
            <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-[10px] space-y-1">
              <div className="text-white/50 font-mono text-[9px] uppercase tracking-wider mb-1">Node Color = Confidence</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-white/70">High</span></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-white/70">Medium</span></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-500" /><span className="text-white/70">Low</span></div>
              <div className="flex items-center gap-2 mt-1"><div className="w-2.5 h-2.5 rounded-full border border-emerald-400" /><span className="text-white/60">Verified</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full border border-yellow-400" /><span className="text-white/60">Promoted</span></div>
            </div>
          </div>

          {/* Event Stream */}
          {eventPanelOpen && (
            <div className="absolute top-0 right-0 w-72 h-full bg-black/80 backdrop-blur-md border-l border-white/10 z-10 flex flex-col">
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5"><Eye className="w-3 h-3" /> Live Events</span>
                <Button onClick={() => setEventPanelOpen(false)} variant="ghost" size="icon" className="h-5 w-5 text-white/30 hover:text-white">×</Button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
                {eventLog.slice(0, 50).map((event, i) => {
                  const typeColor: Record<string, string> = { node_add: 'text-emerald-400', node_update: 'text-sky-400', node_remove: 'text-red-400', edge_add: 'text-amber-400', state_shift: 'text-violet-400', log: 'text-white/40', chat_node: 'text-emerald-300' };
                  return (
                    <div key={`${event.timestamp}_${i}`} className="bg-white/[0.03] rounded px-2 py-1 border border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-mono uppercase ${typeColor[event.type] || 'text-white/30'}`}>{event.type}</span>
                        <span className="text-[8px] text-white/15 font-mono ml-auto">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <pre className="text-[8px] text-white/20 font-mono truncate mt-0.5">{JSON.stringify(event.data).slice(0, 80)}</pre>
                    </div>
                  );
                })}
                {eventLog.length === 0 && <p className="text-[10px] text-white/20 text-center py-4">Waiting for events...</p>}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="shrink-0 w-80 lg:w-96 border-l border-white/10 bg-black/60 backdrop-blur-md flex flex-col z-20">
            <div className="shrink-0 border-b border-white/10 flex overflow-x-auto">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setSidebarTab(tab.id)} className={`flex-1 min-w-0 px-2 py-2.5 flex flex-col items-center gap-0.5 transition-colors border-b-2 ${sidebarTab === tab.id ? `${tab.color} border-current bg-white/5` : 'text-white/30 border-transparent hover:text-white/50 hover:bg-white/[0.02]'}`}>
                  {tab.icon}
                  <span className="text-[9px] font-mono uppercase tracking-wider">{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {sidebarTab === 'chat' && <ChatPanel />}
              {sidebarTab === 'query' && <QueryPanel />}
              {sidebarTab === 'dashboard' && <DashboardPanel />}
              {sidebarTab === 'logs' && <LogsPanel />}
              {sidebarTab === 'policies' && <PoliciesPanel />}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="shrink-0 h-7 border-t border-white/10 bg-black/60 backdrop-blur-md flex items-center px-4 justify-between z-30">
        <span className="text-[9px] text-white/20 font-mono">Perception → Memory → State → Policy → Action → Log</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/20 font-mono">Closed-loop cognition engine</span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </footer>
    </div>
  );
}
