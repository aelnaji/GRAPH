import { db } from '@/lib/db';
import { eventBus } from './types';
import type { KnowledgeNodeData } from './types';
import { getPolicy } from './policy-store';

// State-emotion agent: evaluates confidence, novelty, urgency, valence, arousal
export class StateEmotionAgent {
  name = 'state-emotion';

  // Evaluate the state of a node after verification
  evaluateState(
    nodeData: KnowledgeNodeData,
    verificationResult: { action: string; similarity: number; adjustedConfidence: number }
  ): {
    confidence: number;
    novelty: number;
    urgency: number;
    valence: number;
    arousal: number;
  } {
    let { confidence, novelty, urgency, valence, arousal } = nodeData;

    // Adjust based on verification result
    switch (verificationResult.action) {
      case 'create':
        // New knowledge: high novelty, moderate confidence
        confidence = verificationResult.adjustedConfidence;
        novelty = 1.0 - verificationResult.similarity;
        urgency = Math.max(0.3, urgency); // New items are somewhat urgent
        valence = 0.2; // Slightly positive - new knowledge is valued
        arousal = 0.7; // High arousal for new items
        break;

      case 'reinforce':
        // Existing knowledge reinforced: increased confidence, decreased novelty
        confidence = Math.min(1, verificationResult.adjustedConfidence + 0.15);
        novelty = Math.max(0, novelty - 0.2);
        urgency = Math.max(0, urgency - 0.1);
        valence = Math.min(1, valence + 0.3); // Positive - reinforcement is good
        arousal = Math.min(1, arousal + 0.15);
        break;
    }

    // Normalize to [0, 1] range
    confidence = Math.max(0, Math.min(1, confidence));
    novelty = Math.max(0, Math.min(1, novelty));
    urgency = Math.max(0, Math.min(1, urgency));
    valence = Math.max(-1, Math.min(1, valence));
    arousal = Math.max(0, Math.min(1, arousal));

    return { confidence, novelty, urgency, valence, arousal };
  }

  // Evaluate system-wide state
  async evaluateSystemState(): Promise<{
    totalNodes: number;
    totalEdges: number;
    avgConfidence: number;
    avgNovelty: number;
    avgUrgency: number;
    healthScore: number;
    stateVector: number[];
  }> {
    const [nodeCount, edgeCount, aggregates] = await Promise.all([
      db.knowledgeNode.count(),
      db.knowledgeEdge.count(),
      db.knowledgeNode.aggregate({
        _avg: {
          confidence: true,
          novelty: true,
          urgency: true,
        },
        _count: true,
      }),
    ]);

    const avgConfidence = aggregates._avg.confidence || 0;
    const avgNovelty = aggregates._avg.novelty || 0;
    const avgUrgency = aggregates._avg.urgency || 0;

    // Health score: composite of confidence, verification rate, and activity
    const verifiedCount = await db.knowledgeNode.count({ where: { verified: true } });
    const verificationRate = nodeCount > 0 ? verifiedCount / nodeCount : 0;
    const healthScore = (avgConfidence * 0.4) + (verificationRate * 0.3) + (Math.min(1, nodeCount / 50) * 0.3);

    return {
      totalNodes: nodeCount,
      totalEdges: edgeCount,
      avgConfidence,
      avgNovelty,
      avgUrgency,
      healthScore: Math.max(0, Math.min(1, healthScore)),
      stateVector: [avgConfidence, avgNovelty, avgUrgency, healthScore],
    };
  }

  // Detect significant state shifts and emit events
  async detectStateShifts(nodeId: string, oldState: Partial<KnowledgeNodeData>, newState: Partial<KnowledgeNodeData>): Promise<void> {
    const shifts: string[] = [];

    if (oldState.confidence !== undefined && newState.confidence !== undefined) {
      const delta = Math.abs(newState.confidence - oldState.confidence);
      if (delta > 0.2) shifts.push(`confidence_shift_${delta > 0.4 ? 'major' : 'minor'}`);
    }

    if (oldState.verified === false && newState.verified === true) {
      shifts.push('verification_achieved');
    }

    if (oldState.promoted === false && newState.promoted === true) {
      shifts.push('promotion_to_semantic');
    }

    if (shifts.length > 0) {
      eventBus.emit({
        type: 'state_shift',
        data: { nodeId, shifts, oldState, newState },
        timestamp: Date.now(),
      });
    }
  }

  // Get the attention profile: which nodes are currently most "active"
  async getAttentionProfile(limit: number = 10): Promise<Array<{ id: string; content: string; attentionScore: number }>> {
    const nodes = await db.knowledgeNode.findMany({
      orderBy: { accessCount: 'desc' },
      take: limit,
    });

    const attentionThreshold = await getPolicy('attention.gate_threshold');

    return nodes
      .map(n => ({
        id: n.id,
        content: n.content.slice(0, 80),
        attentionScore: n.confidence * (0.5 + n.arousal * 0.3 + (n.accessCount * 0.01)),
      }))
      .filter(n => n.attentionScore >= attentionThreshold);
  }
}
