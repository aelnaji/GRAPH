import { db } from '@/lib/db';
import { eventBus } from './types';
import type { KnowledgeNodeData, EdgeData, RelationType } from './types';
import { getPolicy, adjustPolicy } from './policy-store';

// Memory agent: verifies, consolidates, decays knowledge
export class MemoryAgent {
  name = 'memory';

  // Verify a new node against existing knowledge
  async verify(nodeData: KnowledgeNodeData): Promise<{
    action: 'create' | 'reinforce' | 'merge';
    existingId?: string;
    adjustedConfidence: number;
    similarity: number;
  }> {
    // Find potentially similar nodes using word overlap
    const words = nodeData.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const searchTerms = words.slice(0, 5);

    if (searchTerms.length === 0) {
      return { action: 'create', adjustedConfidence: nodeData.confidence, similarity: 0 };
    }

    const candidates = await db.knowledgeNode.findMany({
      where: {
        OR: searchTerms.slice(0, 3).map(term => ({
          content: { contains: term },
        })),
      },
      take: 10,
    });

    let bestMatch: { id: string; similarity: number } | null = null;

    for (const candidate of candidates) {
      const candidateWords = new Set(candidate.content.toLowerCase().split(/\s+/));
      const inputWords = new Set(words);
      const intersection = [...inputWords].filter(w => candidateWords.has(w));
      const similarity = intersection.length / Math.max(inputWords.size, candidateWords.size);

      if (similarity > 0.5 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { id: candidate.id, similarity };
      }
    }

    if (bestMatch && bestMatch.similarity > 0.8) {
      // Very high similarity: reinforce existing node
      return {
        action: 'reinforce',
        existingId: bestMatch.id,
        adjustedConfidence: Math.min(1, nodeData.confidence + 0.1),
        similarity: bestMatch.similarity,
      };
    } else if (bestMatch && bestMatch.similarity > 0.5) {
      // Medium similarity: create new but link
      return {
        action: 'create',
        adjustedConfidence: nodeData.confidence * 0.9,
        similarity: bestMatch.similarity,
      };
    }

    // No significant match: create new
    return { action: 'create', adjustedConfidence: nodeData.confidence, similarity: 0 };
  }

  // Create a knowledge node in the database
  async createNode(nodeData: KnowledgeNodeData): Promise<string> {
    const node = await db.knowledgeNode.create({
      data: {
        content: nodeData.content,
        type: nodeData.type,
        source: nodeData.source,
        confidence: nodeData.confidence,
        novelty: nodeData.novelty,
        urgency: nodeData.urgency,
        valence: nodeData.valence,
        arousal: nodeData.arousal,
        decayRate: nodeData.decayRate,
        verified: nodeData.verified,
        promoted: nodeData.promoted,
        metadata: JSON.stringify(nodeData.metadata),
        tags: JSON.stringify(nodeData.tags || []),
      },
    });

    eventBus.emit({
      type: 'node_add',
      data: { id: node.id, ...nodeData },
      timestamp: Date.now(),
    });

    return node.id;
  }

  // Reinforce an existing node
  async reinforceNode(nodeId: string, boost: number = 0.1): Promise<void> {
    const node = await db.knowledgeNode.findUnique({ where: { id: nodeId } });
    if (!node) return;

    const newConfidence = Math.min(1, node.confidence + boost);
    const newAccessCount = node.accessCount + 1;
    const newArousal = Math.min(1, node.arousal + 0.1);
    const newNovelty = Math.max(0, node.novelty - 0.1); // Novelty decreases with reinforcement

    await db.knowledgeNode.update({
      where: { id: nodeId },
      data: {
        confidence: newConfidence,
        accessCount: newAccessCount,
        arousal: newArousal,
        novelty: newNovelty,
      },
    });

    eventBus.emit({
      type: 'node_update',
      data: {
        id: nodeId,
        confidence: newConfidence,
        accessCount: newAccessCount,
        arousal: newArousal,
        novelty: newNovelty,
      },
      timestamp: Date.now(),
    });
  }

  // Create an edge between two nodes
  async createEdge(edgeData: EdgeData): Promise<string> {
    // Check for existing edge
    const existing = await db.knowledgeEdge.findFirst({
      where: {
        sourceId: edgeData.sourceId,
        targetId: edgeData.targetId,
        relationType: edgeData.relationType,
      },
    });

    if (existing) {
      // Reinforce existing edge
      const newWeight = Math.min(1, existing.weight + 0.1);
      await db.knowledgeEdge.update({
        where: { id: existing.id },
        data: { weight: newWeight },
      });
      eventBus.emit({
        type: 'edge_update',
        data: { id: existing.id, weight: newWeight },
        timestamp: Date.now(),
      });
      return existing.id;
    }

    const edge = await db.knowledgeEdge.create({
      data: {
        sourceId: edgeData.sourceId,
        targetId: edgeData.targetId,
        relationType: edgeData.relationType,
        weight: edgeData.weight,
        verified: edgeData.verified,
        metadata: JSON.stringify(edgeData.metadata),
      },
    });

    eventBus.emit({
      type: 'edge_add',
      data: { id: edge.id, ...edgeData },
      timestamp: Date.now(),
    });

    return edge.id;
  }

  // Auto-link nodes based on shared tags/entities
  async autoLink(newNodeId: string, similaritySourceId?: string): Promise<void> {
    const newNode = await db.knowledgeNode.findUnique({ where: { id: newNodeId } });
    if (!newNode) return;

    const newTags: string[] = JSON.parse(newNode.tags);
    const linkThreshold = await getPolicy('threshold.link_similarity');

    // Find nodes with overlapping tags
    const candidates = await db.knowledgeNode.findMany({
      where: { id: { not: newNodeId } },
      take: 20,
    });

    for (const candidate of candidates) {
      if (candidate.id === similaritySourceId) {
        // Always link the similar node
        await this.createEdge({
          sourceId: newNodeId,
          targetId: candidate.id,
          relationType: 'related',
          weight: 0.6,
          verified: false,
          metadata: { autoLinked: true, reason: 'similarity' },
        });
        continue;
      }

      const candidateTags: string[] = JSON.parse(candidate.tags);
      const overlap = newTags.filter(t => candidateTags.includes(t));
      
      if (overlap.length >= 2) {
        const similarity = overlap.length / Math.max(newTags.length, candidateTags.length);
        if (similarity >= linkThreshold) {
          await this.createEdge({
            sourceId: newNodeId,
            targetId: candidate.id,
            relationType: this.inferRelation(newNode, candidate),
            weight: Math.min(1, similarity),
            verified: false,
            metadata: { autoLinked: true, sharedTags: overlap, similarity },
          });
        }
      }
    }
  }

  // Decay low-confidence nodes
  async decayNodes(): Promise<number> {
    const baseDecay = await getPolicy('decay.base_rate');
    const nodes = await db.knowledgeNode.findMany({
      where: { verified: false },
    });

    let decayed = 0;
    for (const node of nodes) {
      // Decay based on confidence and access count
      const decayAmount = baseDecay * (1 - node.accessCount * 0.05);
      const newConfidence = Math.max(0, node.confidence - decayAmount);
      const newUrgency = Math.max(0, node.urgency - decayAmount * 0.5);
      const newArousal = Math.max(0, node.arousal - decayAmount * 0.3);

      if (newConfidence < 0.05) {
        // Remove very low confidence nodes
        await db.knowledgeNode.delete({ where: { id: node.id } });
        eventBus.emit({
          type: 'node_remove',
          data: { id: node.id, reason: 'decay_below_threshold' },
          timestamp: Date.now(),
        });
        decayed++;
      } else {
        await db.knowledgeNode.update({
          where: { id: node.id },
          data: { confidence: newConfidence, urgency: newUrgency, arousal: newArousal },
        });
        if (decayAmount > 0) decayed++;
      }
    }

    return decayed;
  }

  // Promote verified high-confidence nodes
  async consolidateNodes(): Promise<number> {
    const promoteThreshold = await getPolicy('threshold.promote_confidence');
    const verifyThreshold = await getPolicy('threshold.verify_confidence');

    // Promote nodes
    const toPromote = await db.knowledgeNode.findMany({
      where: {
        promoted: false,
        verified: true,
        confidence: { gte: promoteThreshold },
      },
    });

    for (const node of toPromote) {
      await db.knowledgeNode.update({
        where: { id: node.id },
        data: { promoted: true },
      });
      eventBus.emit({
        type: 'node_update',
        data: { id: node.id, promoted: true, action: 'promoted_to_semantic' },
        timestamp: Date.now(),
      });
    }

    // Verify high-confidence nodes with enough access
    const toVerify = await db.knowledgeNode.findMany({
      where: {
        verified: false,
        confidence: { gte: verifyThreshold },
        accessCount: { gte: 3 },
      },
    });

    for (const node of toVerify) {
      await db.knowledgeNode.update({
        where: { id: node.id },
        data: { verified: true },
      });
      eventBus.emit({
        type: 'node_update',
        data: { id: node.id, verified: true },
        timestamp: Date.now(),
      });
    }

    return toPromote.length + toVerify.length;
  }

  // Query knowledge graph
  async query(
    queryText: string,
    maxResults: number = 20,
    minConfidence: number = 0.1
  ): Promise<{ nodes: KnowledgeNodeData[]; edges: EdgeData[] }> {
    const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const nodes = await db.knowledgeNode.findMany({
      where: {
        AND: [
          { confidence: { gte: minConfidence } },
          ...(words.length > 0
            ? [{ OR: words.slice(0, 5).map(w => ({ content: { contains: w } })) }]
            : []),
        ],
      },
      take: maxResults,
      orderBy: { confidence: 'desc' },
    });

    const nodeIds = nodes.map(n => n.id);
    const edges = await db.knowledgeEdge.findMany({
      where: {
        OR: [
          { sourceId: { in: nodeIds } },
          { targetId: { in: nodeIds } },
        ],
      },
    });

    return {
      nodes: nodes.map(n => ({
        id: n.id,
        content: n.content,
        type: n.type as KnowledgeNodeData['type'],
        source: n.source as KnowledgeNodeData['source'],
        confidence: n.confidence,
        novelty: n.novelty,
        urgency: n.urgency,
        valence: n.valence,
        arousal: n.arousal,
        decayRate: n.decayRate,
        accessCount: n.accessCount,
        verified: n.verified,
        promoted: n.promoted,
        metadata: JSON.parse(n.metadata),
        tags: JSON.parse(n.tags),
      })),
      edges: edges.map(e => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        relationType: e.relationType as RelationType,
        weight: e.weight,
        verified: e.verified,
        metadata: JSON.parse(e.metadata),
      })),
    };
  }

  private inferRelation(
    a: { type: string; tags: string },
    b: { type: string; tags: string }
  ): RelationType {
    if (a.type === 'decision' && b.type === 'fact') return 'causality';
    if (a.type === 'concept' && b.type === 'entity') return 'hierarchy';
    if (a.type === 'pattern' && b.type === 'pattern') return 'sequence';
    return 'related';
  }
}
