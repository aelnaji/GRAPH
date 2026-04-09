import { create } from 'zustand';
import type { GraphUpdateEvent } from '@/lib/agents/types';

export interface GraphNode {
  id: string;
  name: string;
  fullName: string;
  type: string;
  source: string;
  val: number;
  color: string;
  confidence: number;
  novelty: number;
  urgency: number;
  valence: number;
  arousal: number;
  verified: boolean;
  promoted: boolean;
  accessCount: number;
  tags: string[];
  createdAt: string;
}

export interface GraphLink {
  source: string;
  target: string;
  relationType: string;
  weight: number;
  verified: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  processed: boolean;
  nodeId?: string;
  createdAt: string;
}

export interface CognitionState {
  totalNodes: number;
  totalEdges: number;
  avgConfidence: number;
  avgNovelty: number;
  avgUrgency: number;
  verifiedCount: number;
  promotedCount: number;
  recentLogs: number;
  policyCount: number;
}

export interface PolicyEntry {
  key: string;
  value: number;
  valueType: string;
  category: string;
}

export interface LogEntry {
  id: string;
  eventType: string;
  category: string;
  level: string;
  payload: Record<string, unknown>;
  nodeId?: string;
  agentName?: string;
  createdAt: string;
}

export type SidebarTab = 'chat' | 'query' | 'dashboard' | 'logs' | 'policies';

interface KnowledgeStore {
  nodes: GraphNode[];
  links: GraphLink[];
  setGraphData: (nodes: GraphNode[], links: GraphLink[]) => void;
  addNode: (node: GraphNode) => void;
  updateNode: (id: string, data: Partial<GraphNode>) => void;
  removeNode: (id: string) => void;
  addLink: (link: GraphLink) => void;

  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;

  cognitionState: CognitionState | null;
  setCognitionState: (state: CognitionState) => void;

  policies: PolicyEntry[];
  setPolicies: (policies: PolicyEntry[]) => void;

  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  eventLog: GraphUpdateEvent[];
  addEvent: (event: GraphUpdateEvent) => void;

  processEvent: (event: GraphUpdateEvent) => void;
  nodeColor: (confidence: number, valence: number) => string;
}

function computeColor(confidence: number, valence: number): string {
  const brightness = 0.3 + confidence * 0.7;
  if (confidence > 0.7 && valence > 0) {
    const g = Math.floor(100 + valence * 155);
    const r = Math.floor(50 * (1 - valence));
    const b = Math.floor(50 * (1 - valence));
    return `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)})`;
  } else if (confidence > 0.7 && valence < 0) {
    const r = Math.floor(100 + Math.abs(valence) * 155);
    const g = Math.floor(50 * (1 - Math.abs(valence)));
    return `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(80 * brightness)})`;
  } else if (confidence > 0.4) {
    return `rgb(${Math.floor(200 * brightness)}, ${Math.floor(150 * brightness)}, ${Math.floor(30 * brightness)})`;
  }
  const v = Math.floor(100 * brightness);
  return `rgb(${v}, ${v}, ${Math.floor(v * 1.1)})`;
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  nodes: [],
  links: [],
  setGraphData: (nodes, links) => set({ nodes, links }),

  addNode: (node) => set((state) => {
    if (state.nodes.find(n => n.id === node.id)) return state;
    return { nodes: [...state.nodes, node] };
  }),

  updateNode: (id, data) => set((state) => ({
    nodes: state.nodes.map(n => {
      if (n.id !== id) return n;
      const updated = { ...n, ...data };
      if (data.confidence !== undefined || data.valence !== undefined) {
        updated.color = computeColor(
          data.confidence ?? n.confidence,
          data.valence ?? n.valence
        );
        updated.val = (data.confidence ?? n.confidence) * 10;
      }
      return updated;
    }),
  })),

  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== id),
    links: state.links.filter(l => l.source !== id && l.target !== id),
  })),

  addLink: (link) => set((state) => {
    const exists = state.links.find(
      l => (l.source === link.source && l.target === link.target) ||
           (l.source === link.target && l.target === link.source)
    );
    if (exists) return state;
    return { links: [...state.links, link] };
  }),

  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [msg, ...state.chatMessages].slice(0, 200),
  })),
  setChatMessages: (msgs) => set({ chatMessages: msgs }),

  cognitionState: null,
  setCognitionState: (state) => set({ cognitionState: state }),

  policies: [],
  setPolicies: (policies) => set({ policies }),

  logs: [],
  addLog: (log) => set((state) => ({
    logs: [log, ...state.logs].slice(0, 500),
  })),
  setLogs: (logs) => set({ logs }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),
  sidebarTab: 'chat',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  eventLog: [],
  addEvent: (event) => set((state) => ({
    eventLog: [event, ...state.eventLog].slice(0, 100),
  })),

  nodeColor: computeColor,

  processEvent: (event) => {
    const store = get();
    store.addEvent(event);

    switch (event.type) {
      case 'node_add': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d?.id) {
          store.addNode({
            id: d.id as string,
            name: String(d.content || '').slice(0, 60),
            fullName: String(d.content || ''),
            type: String(d.type || 'concept'),
            source: String(d.source || 'manual'),
            val: ((d.confidence as number) || 0.5) * 10,
            color: computeColor((d.confidence as number) || 0.5, (d.valence as number) || 0),
            confidence: (d.confidence as number) || 0.5,
            novelty: (d.novelty as number) || 1.0,
            urgency: (d.urgency as number) || 0.5,
            valence: (d.valence as number) || 0,
            arousal: (d.arousal as number) || 0.5,
            verified: (d.verified as boolean) || false,
            promoted: (d.promoted as boolean) || false,
            accessCount: (d.accessCount as number) || 0,
            tags: (d.tags as string[]) || [],
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'node_update': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d?.id) {
          store.updateNode(d.id as string, {
            confidence: d.confidence as number | undefined,
            novelty: d.novelty as number | undefined,
            arousal: d.arousal as number | undefined,
            verified: d.verified as boolean | undefined,
            promoted: d.promoted as boolean | undefined,
          });
        }
        break;
      }

      case 'node_remove': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d?.id) {
          store.removeNode(d.id as string);
        }
        break;
      }

      case 'edge_add': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d?.sourceId && d?.targetId) {
          store.addLink({
            source: d.sourceId as string,
            target: d.targetId as string,
            relationType: String(d.relationType || 'related'),
            weight: (d.weight as number) || 0.5,
            verified: (d.verified as boolean) || false,
          });
        }
        break;
      }

      case 'log': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d) {
          store.addLog({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            eventType: String(d.eventType || event.type),
            category: String(d.category || 'system'),
            level: String(d.level || 'info'),
            payload: (d.payload as Record<string, unknown>) || d,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'chat_node': {
        const d = event.data as Record<string, unknown> | undefined;
        if (d?.role) {
          store.addChatMessage({
            id: String(d.chatId || `chat_${Date.now()}`),
            role: d.role as 'user' | 'assistant' | 'system',
            content: String(d.content || ''),
            processed: true,
            nodeId: d.nodeId as string | undefined,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }
    }
  },
}));
