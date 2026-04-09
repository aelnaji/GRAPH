// Core types for the knowledge graph system

export interface KnowledgeNodeData {
  id?: string;
  content: string;
  type: NodeType;
  source: NodeSource;
  confidence: number;
  novelty: number;
  urgency: number;
  valence: number;
  arousal: number;
  decayRate: number;
  accessCount: number;
  verified: boolean;
  promoted: boolean;
  metadata: Record<string, unknown>;
  tags: string[];
}

export type NodeType = 'concept' | 'entity' | 'decision' | 'pattern' | 'chat' | 'fact';
export type NodeSource = 'manual' | 'chat' | 'upload' | 'inference';

export interface EdgeData {
  id?: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  weight: number;
  verified: boolean;
  metadata: Record<string, unknown>;
}

export type RelationType = 'related' | 'causality' | 'hierarchy' | 'sequence' | 'opposition';

export interface SystemLogEntry {
  id?: string;
  eventType: string;
  category: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  payload: Record<string, unknown>;
  nodeId?: string;
  agentName?: string;
}

export interface PolicyEntry {
  key: string;
  value: unknown;
  valueType: 'number' | 'boolean' | 'string' | 'object';
  category: 'routing' | 'retry' | 'attention' | 'decay' | 'threshold';
}

export interface IngestPayload {
  content: string;
  source: NodeSource;
  type?: NodeType;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface QueryPayload {
  query: string;
  maxResults?: number;
  minConfidence?: number;
  types?: NodeType[];
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

export interface GraphUpdateEvent {
  type: 'node_add' | 'node_update' | 'node_remove' | 'edge_add' | 'edge_update' | 'state_shift' | 'log' | 'chat_node';
  data: Record<string, unknown>;
  timestamp: number;
}

// Default policies
export const DEFAULT_POLICIES: Record<string, { value: number; category: string; valueType: string }> = {
  'routing.perception_weight': { value: 1.0, category: 'routing', valueType: 'number' },
  'routing.memory_weight': { value: 1.0, category: 'routing', valueType: 'number' },
  'routing.state_weight': { value: 1.0, category: 'routing', valueType: 'number' },
  'routing.selfmodify_weight': { value: 0.5, category: 'routing', valueType: 'number' },
  'retry.max_attempts': { value: 3, category: 'retry', valueType: 'number' },
  'retry.backoff_ms': { value: 1000, category: 'retry', valueType: 'number' },
  'attention.gate_threshold': { value: 0.3, category: 'attention', valueType: 'number' },
  'attention.focus_decay': { value: 0.05, category: 'attention', valueType: 'number' },
  'decay.base_rate': { value: 0.01, category: 'decay', valueType: 'number' },
  'decay.inactivity_days': { value: 7, category: 'decay', valueType: 'number' },
  'threshold.verify_confidence': { value: 0.7, category: 'threshold', valueType: 'number' },
  'threshold.promote_confidence': { value: 0.85, category: 'threshold', valueType: 'number' },
  'threshold.novelty_floor': { value: 0.1, category: 'threshold', valueType: 'number' },
  'threshold.link_similarity': { value: 0.6, category: 'threshold', valueType: 'number' },
  'routing.batch_size': { value: 10, category: 'routing', valueType: 'number' },
};

// In-memory event bus for SSE-like broadcasting
type EventListener = (event: GraphUpdateEvent) => void;

class EventBus {
  private listeners: Set<EventListener> = new Set();

  emit(event: GraphUpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[EventBus] Listener error:', e);
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const eventBus = new EventBus();

// In-memory queue for async processing
interface QueueItem {
  id: string;
  payload: IngestPayload;
  priority: number;
  enqueuedAt: number;
}

class IngestQueue {
  private queue: QueueItem[] = [];
  private processing = false;

  enqueue(payload: IngestPayload, priority: number = 5): string {
    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.queue.push({ id, payload, priority, enqueuedAt: Date.now() });
    this.queue.sort((a, b) => b.priority - a.priority);
    return id;
  }

  dequeue(): QueueItem | undefined {
    return this.queue.shift();
  }

  get length(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

export const ingestQueue = new IngestQueue();
