import { db } from '@/lib/db';
import type { IngestPayload, KnowledgeNodeData, NodeType, NodeSource } from './types';

// Perception agent: chunks raw input, extracts entities, assigns initial scores
export class PerceptionAgent {
  name = 'perception';

  // Chunk text into meaningful knowledge units
  private chunkText(content: string): string[] {
    // Split by sentences, filter out very short ones
    const sentences = content
      .split(/[.!?\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    
    // If content is short, treat as single chunk
    if (sentences.length <= 1) return [content.trim()];
    
    // Merge short consecutive sentences
    const chunks: string[] = [];
    let current = '';
    
    for (const sentence of sentences) {
      if (current.length + sentence.length < 300) {
        current = current ? `${current}. ${sentence}` : sentence;
      } else {
        if (current) chunks.push(current);
        current = sentence;
      }
    }
    if (current) chunks.push(current);
    
    return chunks.length > 0 ? chunks : [content.trim()];
  }

  // Simple keyword/entity extraction
  private extractEntities(content: string): string[] {
    // Extract capitalized words, quoted terms, and key technical terms
    const entities: Set<string> = new Set();
    
    // Capitalized multi-word entities
    const capMatches = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (capMatches) {
      capMatches.forEach(m => { if (m.length > 3) entities.add(m); });
    }
    
    // Quoted terms
    const quoted = content.match(/["']([^"']+)["']/g);
    if (quoted) {
      quoted.forEach(q => entities.add(q.replace(/["']/g, '')));
    }
    
    // Technical terms (words with numbers or hyphens)
    const techTerms = content.match(/\b[a-zA-Z]+[-][a-zA-Z]+\b|\b[a-zA-Z]+\d+\b/g);
    if (techTerms) {
      techTerms.forEach(t => entities.add(t));
    }
    
    return Array.from(entities).slice(0, 10);
  }

  // Determine node type from source and content
  private inferType(source: NodeSource, content: string): NodeType {
    if (source === 'chat') return 'chat';
    
    // Heuristics
    const lower = content.toLowerCase();
    if (lower.includes('because') || lower.includes('therefore') || lower.includes('causes')) return 'decision';
    if (lower.includes('pattern') || lower.includes('always') || lower.includes('never')) return 'pattern';
    if (lower.includes('is a') || lower.includes('are the') || lower.includes('means')) return 'concept';
    if (/^\d{4}-\d{2}-\d{2}|^\$[\d,]+|^\d+(\.\d+)?%/.test(content)) return 'fact';
    
    return 'entity';
  }

  // Calculate initial confidence based on source
  private initialConfidence(source: NodeSource): number {
    switch (source) {
      case 'manual': return 0.8;
      case 'chat': return 0.6;
      case 'upload': return 0.7;
      case 'inference': return 0.4;
      default: return 0.5;
    }
  }

  // Process a single ingest payload through perception
  async process(payload: IngestPayload): Promise<KnowledgeNodeData[]> {
    const chunks = this.chunkText(payload.content);
    const results: KnowledgeNodeData[] = [];

    for (const chunk of chunks) {
      const entities = this.extractEntities(chunk);
      const type = payload.type || this.inferType(payload.source, chunk);
      const confidence = this.initialConfidence(payload.source);
      
      // Longer chunks with more entities get higher urgency
      const urgency = Math.min(1, 0.3 + (entities.length * 0.1) + (chunk.length > 200 ? 0.2 : 0));
      
      const nodeData: KnowledgeNodeData = {
        content: chunk,
        type,
        source: payload.source,
        confidence,
        novelty: 1.0, // All new knowledge starts with max novelty
        urgency,
        valence: 0.0,
        arousal: Math.min(1, 0.4 + (confidence * 0.3)),
        decayRate: 0.01,
        accessCount: 0,
        verified: false,
        promoted: false,
        metadata: {
          chunkIndex: chunks.indexOf(chunk),
          totalChunks: chunks.length,
          originalLength: payload.content.length,
          entities,
        },
        tags: payload.tags || entities.slice(0, 5),
      };
      
      results.push(nodeData);
    }

    return results;
  }

  // Quick verification: check if very similar content already exists
  async findSimilar(content: string, threshold: number = 0.8): Promise<string | null> {
    const normalizedContent = content.toLowerCase().trim();
    const words = normalizedContent.split(/\s+/).slice(0, 10); // first 10 words
    
    // Search for nodes that share significant word overlap
    const candidates = await db.knowledgeNode.findMany({
      where: {
        AND: words.slice(0, 3).map(w => ({
          content: { contains: w },
        })),
      },
      take: 5,
    });

    for (const candidate of candidates) {
      const candidateWords = new Set(candidate.content.toLowerCase().split(/\s+/));
      const inputWords = new Set(words);
      const intersection = [...inputWords].filter(w => candidateWords.has(w));
      const similarity = intersection.length / Math.max(inputWords.size, candidateWords.size);
      
      if (similarity >= threshold) {
        return candidate.id;
      }
    }

    return null;
  }
}
