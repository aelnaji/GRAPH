import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '@/lib/agents';
import { requireAuth } from '@/lib/auth';
import type { IngestPayload } from '@/lib/agents/types';

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body: IngestPayload = await request.json();

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
    }

    const content = body.content.trim();
    if (content.length === 0) {
      return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
    }
    if (content.length > 10000) {
      return NextResponse.json({ error: 'Content too long (max 10000 characters)' }, { status: 400 });
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.processInput({
      content,
      source: body.source || 'manual',
      type: body.type,
      tags: body.tags,
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      nodeId: result.nodeId,
      action: result.action,
      state: result.state,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
