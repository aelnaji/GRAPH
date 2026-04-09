/**
 * Unit tests for MemoryAgent
 * All DB calls are mocked — no real database needed.
 */
import { MemoryAgent } from '../memory';
import type { KnowledgeNodeData } from '../types';

// Mock the db module
jest.mock('@/lib/db', () => ({
  db: {
    knowledgeNode: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    knowledgeEdge: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock policy-store
jest.mock('../policy-store', () => ({
  getPolicy: jest.fn().mockResolvedValue(0.6),
  adjustPolicy: jest.fn(),
}));

// Mock eventBus
jest.mock('../types', () => ({
  ...jest.requireActual('../types'),
  eventBus: { emit: jest.fn() },
}));

import { db } from '@/lib/db';
const mockDb = db as jest.Mocked<typeof db>;

const makeNode = (overrides: Partial<KnowledgeNodeData> = {}): KnowledgeNodeData => ({
  content: 'test knowledge content about graphs',
  type: 'concept',
  source: 'manual',
  confidence: 0.7,
  novelty: 0.8,
  urgency: 0.5,
  valence: 0.0,
  arousal: 0.5,
  decayRate: 0.01,
  accessCount: 0,
  verified: false,
  promoted: false,
  metadata: {},
  tags: ['graph', 'knowledge'],
  ...overrides,
});

describe('MemoryAgent', () => {
  let agent: MemoryAgent;

  beforeEach(() => {
    agent = new MemoryAgent();
    jest.clearAllMocks();
  });

  // ── verify() ────────────────────────────────────────────────────────────
  describe('verify()', () => {
    it('returns create with similarity 0 when no candidates found', async () => {
      (mockDb.knowledgeNode.findMany as jest.Mock).mockResolvedValue([]);
      const node = makeNode();
      const result = await agent.verify(node);
      expect(result.action).toBe('create');
      expect(result.similarity).toBe(0);
    });

    it('returns create with similarity 0 for very short content', async () => {
      const node = makeNode({ content: 'hi' });
      const result = await agent.verify(node);
      expect(result.action).toBe('create');
      expect(result.similarity).toBe(0);
    });

    it('returns reinforce when similarity > 0.8', async () => {
      const content = 'test knowledge content about graphs database systems';
      const node = makeNode({ content });
      // Return a near-identical candidate
      (mockDb.knowledgeNode.findMany as jest.Mock).mockResolvedValue([
        { id: 'existing-id', content, tags: '[]' },
      ]);
      const result = await agent.verify(node);
      expect(result.action).toBe('reinforce');
      expect(result.existingId).toBe('existing-id');
      expect(result.similarity).toBeGreaterThan(0.8);
    });

    it('returns create (with link) when similarity is between 0.5 and 0.8', async () => {
      const node = makeNode({ content: 'knowledge about graphs and systems design' });
      (mockDb.knowledgeNode.findMany as jest.Mock).mockResolvedValue([
        { id: 'similar-id', content: 'graphs and systems are important for design patterns here', tags: '[]' },
      ]);
      const result = await agent.verify(node);
      expect(result.action).toBe('create');
      expect(result.adjustedConfidence).toBeLessThanOrEqual(node.confidence);
    });
  });

  // ── createNode() ─────────────────────────────────────────────────────────
  describe('createNode()', () => {
    it('calls db.knowledgeNode.create and returns id', async () => {
      (mockDb.knowledgeNode.create as jest.Mock).mockResolvedValue({ id: 'new-node-id' });
      const node = makeNode();
      const id = await agent.createNode(node);
      expect(id).toBe('new-node-id');
      expect(mockDb.knowledgeNode.create).toHaveBeenCalledTimes(1);
      const callArg = (mockDb.knowledgeNode.create as jest.Mock).mock.calls[0][0].data;
      expect(callArg.content).toBe(node.content);
      expect(callArg.confidence).toBe(node.confidence);
    });
  });

  // ── reinforceNode() ──────────────────────────────────────────────────────
  describe('reinforceNode()', () => {
    it('increases confidence and accessCount', async () => {
      (mockDb.knowledgeNode.findUnique as jest.Mock).mockResolvedValue({
        id: 'node-1', confidence: 0.5, accessCount: 2, arousal: 0.3, novelty: 0.8,
      });
      (mockDb.knowledgeNode.update as jest.Mock).mockResolvedValue({});

      await agent.reinforceNode('node-1', 0.1);

      const updateCall = (mockDb.knowledgeNode.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.confidence).toBeCloseTo(0.6);
      expect(updateCall.data.accessCount).toBe(3);
      expect(updateCall.data.novelty).toBeLessThan(0.8); // novelty should decrease
    });

    it('caps confidence at 1.0', async () => {
      (mockDb.knowledgeNode.findUnique as jest.Mock).mockResolvedValue({
        id: 'node-1', confidence: 0.95, accessCount: 10, arousal: 0.9, novelty: 0.1,
      });
      (mockDb.knowledgeNode.update as jest.Mock).mockResolvedValue({});

      await agent.reinforceNode('node-1', 0.2);

      const updateCall = (mockDb.knowledgeNode.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.confidence).toBe(1.0);
    });

    it('does nothing if node not found', async () => {
      (mockDb.knowledgeNode.findUnique as jest.Mock).mockResolvedValue(null);
      await agent.reinforceNode('ghost-id');
      expect(mockDb.knowledgeNode.update).not.toHaveBeenCalled();
    });
  });

  // ── createEdge() ─────────────────────────────────────────────────────────
  describe('createEdge()', () => {
    it('creates a new edge when none exists', async () => {
      (mockDb.knowledgeEdge.findFirst as jest.Mock).mockResolvedValue(null);
      (mockDb.knowledgeEdge.create as jest.Mock).mockResolvedValue({ id: 'edge-1' });

      const id = await agent.createEdge({
        sourceId: 'a', targetId: 'b', relationType: 'related',
        weight: 0.5, verified: false, metadata: {},
      });

      expect(id).toBe('edge-1');
      expect(mockDb.knowledgeEdge.create).toHaveBeenCalledTimes(1);
    });

    it('reinforces existing edge instead of creating duplicate', async () => {
      (mockDb.knowledgeEdge.findFirst as jest.Mock).mockResolvedValue({ id: 'edge-existing', weight: 0.5 });
      (mockDb.knowledgeEdge.update as jest.Mock).mockResolvedValue({});

      const id = await agent.createEdge({
        sourceId: 'a', targetId: 'b', relationType: 'related',
        weight: 0.5, verified: false, metadata: {},
      });

      expect(id).toBe('edge-existing');
      expect(mockDb.knowledgeEdge.create).not.toHaveBeenCalled();
      const updateCall = (mockDb.knowledgeEdge.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.weight).toBeCloseTo(0.6);
    });
  });

  // ── decayNodes() ─────────────────────────────────────────────────────────
  describe('decayNodes()', () => {
    it('deletes nodes with confidence falling below 0.05', async () => {
      (mockDb.knowledgeNode.findMany as jest.Mock).mockResolvedValue([
        { id: 'weak-node', confidence: 0.04, accessCount: 0, urgency: 0.1, arousal: 0.1 },
      ]);
      (mockDb.knowledgeNode.delete as jest.Mock).mockResolvedValue({});

      const decayed = await agent.decayNodes();
      expect(mockDb.knowledgeNode.delete).toHaveBeenCalledWith({ where: { id: 'weak-node' } });
      expect(decayed).toBe(1);
    });

    it('updates (not deletes) nodes with confidence above 0.05 after decay', async () => {
      (mockDb.knowledgeNode.findMany as jest.Mock).mockResolvedValue([
        { id: 'medium-node', confidence: 0.5, accessCount: 2, urgency: 0.4, arousal: 0.4 },
      ]);
      (mockDb.knowledgeNode.update as jest.Mock).mockResolvedValue({});

      await agent.decayNodes();
      expect(mockDb.knowledgeNode.delete).not.toHaveBeenCalled();
      expect(mockDb.knowledgeNode.update).toHaveBeenCalled();
    });
  });
});
