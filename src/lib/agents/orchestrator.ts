import { db } from '@/lib/db';
import { eventBus, type IngestPayload, type GraphUpdateEvent, type KnowledgeNodeData, type CognitionState } from './types';
import { PerceptionAgent } from './perception';
import { MemoryAgent } from './memory';
import { StateEmotionAgent } from './state-emotion';
import { SelfModifyAgent } from './self-modify';
import { ensurePolicies } from './policy-store';

// Orchestrator: closed-loop cognition
// Perception → Memory Verify → State Evaluate → Policy Update → Action → Log

export class Orchestrator {
  private perception = new PerceptionAgent();
  private memory = new MemoryAgent();
  private stateEmotion = new StateEmotionAgent();
  private selfModify = new SelfModifyAgent();

  // Main cognition loop for a single input
  async processInput(payload: IngestPayload): Promise<{
    nodeId: string;
    action: string;
    state: Record<string, number>;
  }> {
    await ensurePolicies();

    const startTime = Date.now();
    let nodeId = '';
    let action = 'create';
    const state: Record<string, number> = {};

    try {
      // Step 1: PERCEPTION - Chunk and extract
      const perceived = await this.perception.process(payload);
      
      for (const nodeData of perceived) {
        // Step 2: MEMORY VERIFY - Check against existing knowledge
        const verification = await this.memory.verify(nodeData);
        
        // Step 3: STATE EVALUATE - Score the node
        const evaluatedState = this.stateEmotion.evaluateState(nodeData, verification);
        Object.assign(nodeData, evaluatedState);

        if (verification.action === 'reinforce' && verification.existingId) {
          // Reinforce existing node
          nodeId = verification.existingId;
          action = 'reinforce';
          await this.memory.reinforceNode(nodeId, evaluatedState.confidence - nodeData.confidence);
          state.confidence = evaluatedState.confidence;
          state.novelty = evaluatedState.novelty;
        } else {
          // Create new node
          nodeId = await this.memory.createNode(nodeData);
          action = 'create';
          state.confidence = evaluatedState.confidence;
          state.novelty = evaluatedState.novelty;

          // Auto-link with similar nodes
          if (verification.existingId) {
            await this.memory.createEdge({
              sourceId: nodeId,
              targetId: verification.existingId,
              relationType: 'related',
              weight: verification.similarity,
              verified: false,
              metadata: { autoLinked: true, reason: 'perception_similarity' },
            });
          }
        }

        // Auto-link with other nodes based on tags
        await this.memory.autoLink(nodeId, verification.existingId);

        // Step 4: LOG every action
        await this.logCycle(nodeId, 'ingest_complete', {
          action,
          source: payload.source,
          confidence: state.confidence,
          novelty: state.novelty,
          processingTime: Date.now() - startTime,
          chunkCount: perceived.length,
        });
      }

      return { nodeId, action, state };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.logCycle(nodeId || 'unknown', 'ingest_error', {
        error: errorMsg,
        source: payload.source,
        processingTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  // Process chat message through the cognition loop
  async processChatMessage(role: string, content: string): Promise<{
    chatId: string;
    nodeId?: string;
    state?: Record<string, number>;
  }> {
    // Store the chat message
    const chatMsg = await db.chatMessage.create({
      data: { role, content },
    });

    // Only process user messages through perception
    if (role === 'user') {
      const result = await this.processInput({
        content,
        source: 'chat',
        type: 'chat',
      });

      await db.chatMessage.update({
        where: { id: chatMsg.id },
        data: { processed: true, nodeId: result.nodeId },
      });

      // Emit chat node event for real-time visualization
      eventBus.emit({
        type: 'chat_node',
        data: {
          chatId: chatMsg.id,
          nodeId: result.nodeId,
          role,
          content: content.slice(0, 200),
          state: result.state,
        },
        timestamp: Date.now(),
      });

      return { chatId: chatMsg.id, nodeId: result.nodeId, state: result.state };
    }

    // For assistant messages, just log them
    await db.chatMessage.update({
      where: { id: chatMsg.id },
      data: { processed: true },
    });

    eventBus.emit({
      type: 'chat_node',
      data: {
        chatId: chatMsg.id,
        role,
        content: content.slice(0, 200),
      },
      timestamp: Date.now(),
    });

    return { chatId: chatMsg.id };
  }

  // Periodic maintenance: decay + consolidate + self-modify
  async maintenanceCycle(): Promise<{
    decayed: number;
    consolidated: number;
    policyAdjustments: number;
  }> {
    await ensurePolicies();

    // Decay low-confidence nodes
    const decayed = await this.memory.decayNodes();

    // Consolidate verified nodes
    const consolidated = await this.memory.consolidateNodes();

    // Get recent stats for self-modification
    const recentLogs = await db.systemLog.findMany({
      where: {
        eventType: 'ingest_complete',
        createdAt: { gte: new Date(Date.now() - 3600000) }, // last hour
      },
    });

    const successCount = recentLogs.filter(l => {
      const payload = JSON.parse(l.payload);
      return !payload.error;
    }).length;

    const failureCount = recentLogs.filter(l => {
      const payload = JSON.parse(l.payload);
      return !!payload.error;
    }).length;

    // Self-modify based on performance
    const adjustments = await this.selfModify.evaluateAndAdapt({
      successCount,
      failureCount,
      avgSimilarity: 0.5,
      nodesCreated: successCount,
      nodesReinforced: Math.floor(successCount * 0.3),
      edgesCreated: successCount,
    });

    if (adjustments.length > 0) {
      await this.logCycle('system', 'maintenance_complete', {
        decayed,
        consolidated,
        policyAdjustments: adjustments.length,
        adjustments: adjustments.map(a => ({ key: a.key, from: a.oldValue, to: a.newValue })),
      });
    }

    return { decayed, consolidated, policyAdjustments: adjustments.length };
  }

  // Get full cognition state for dashboard
  async getCognitionState(): Promise<CognitionState> {
    const [nodeCount, edgeCount, logCount, policyCount, verifiedCount, promotedCount] = await Promise.all([
      db.knowledgeNode.count(),
      db.knowledgeEdge.count(),
      db.systemLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 86400000) } },
      }),
      db.policyConfig.count(),
      db.knowledgeNode.count({ where: { verified: true } }),
      db.knowledgeNode.count({ where: { promoted: true } }),
    ]);

    const aggregates = await db.knowledgeNode.aggregate({
      _avg: { confidence: true, novelty: true, urgency: true },
    });

    return {
      totalNodes: nodeCount,
      totalEdges: edgeCount,
      avgConfidence: aggregates._avg.confidence || 0,
      avgNovelty: aggregates._avg.novelty || 0,
      avgUrgency: aggregates._avg.urgency || 0,
      verifiedCount,
      promotedCount,
      recentLogs: logCount,
      policyCount,
    };
  }

  // Get graph data for 3D visualization
  async getGraphData(): Promise<{ nodes: any[]; links: any[] }> {
    const [nodes, edges] = await Promise.all([
      db.knowledgeNode.findMany({
        orderBy: { confidence: 'desc' },
        take: 200,
      }),
      db.knowledgeEdge.findMany({
        take: 500,
      }),
    ]);

    const nodeIds = new Set(nodes.map(n => n.id));

    return {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.content.slice(0, 60),
        fullName: n.content,
        type: n.type,
        source: n.source,
        val: n.confidence * 10, // node size
        color: this.nodeColor(n.confidence, n.valence),
        confidence: n.confidence,
        novelty: n.novelty,
        urgency: n.urgency,
        valence: n.valence,
        arousal: n.arousal,
        verified: n.verified,
        promoted: n.promoted,
        accessCount: n.accessCount,
        tags: JSON.parse(n.tags),
        createdAt: n.createdAt.toISOString(),
      })),
      links: edges
        .filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
        .map(e => ({
          source: e.sourceId,
          target: e.targetId,
          relationType: e.relationType,
          weight: e.weight,
          verified: e.verified,
        })),
    };
  }

  // Map confidence + valence to RGB color for visualization
  private nodeColor(confidence: number, valence: number): string {
    // High confidence + positive valence = green
    // High confidence + negative valence = red
    // Low confidence = gray/dim
    // Medium confidence = amber/yellow

    const brightness = 0.3 + confidence * 0.7;
    
    if (confidence > 0.7 && valence > 0) {
      // Green spectrum
      const g = Math.floor(100 + valence * 155);
      const r = Math.floor(50 * (1 - valence));
      const b = Math.floor(50 * (1 - valence));
      return `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
    } else if (confidence > 0.7 && valence < 0) {
      // Red spectrum
      const r = Math.floor(100 + Math.abs(valence) * 155);
      const g = Math.floor(50 * (1 - Math.abs(valence)));
      const b = Math.floor(80);
      return `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
    } else if (confidence > 0.4) {
      // Amber spectrum
      const r = Math.floor(200 * brightness);
      const g = Math.floor(150 * brightness);
      const b = Math.floor(30 * brightness);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Gray/dim
      const v = Math.floor(100 * brightness);
      return `rgb(${v}, ${v}, ${Math.floor(v * 1.1)})`;
    }
  }

  // Log a cognition cycle event
  private async logCycle(nodeId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await db.systemLog.create({
      data: {
        eventType,
        category: 'agent',
        level: 'info',
        payload: JSON.stringify(payload),
        nodeId: nodeId !== 'unknown' && nodeId !== 'system' ? nodeId : null,
        agentName: 'orchestrator',
      },
    });

    eventBus.emit({
      type: 'log',
      data: { eventType, category: 'agent', payload, nodeId },
      timestamp: Date.now(),
    });
  }
}

// Singleton instance
let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
