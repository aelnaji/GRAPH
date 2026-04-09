import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '@/lib/agents';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: 'Role and content are required' },
        { status: 400 }
      );
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be user, assistant, or system' },
        { status: 400 }
      );
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.processChatMessage(role, content);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { db } = await import('@/lib/db');
    const messages = await db.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        processed: m.processed,
        nodeId: m.nodeId,
        createdAt: m.createdAt.toISOString(),
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
