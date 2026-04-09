import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// DELETE /api/graph/:id — delete a knowledge node and its edges
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { id } = params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
  }

  try {
    // Check node exists first
    const node = await db.knowledgeNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Edges cascade-delete automatically (set in schema)
    // Also clean up any chat messages referencing this node
    await db.chatMessage.updateMany({
      where: { nodeId: id },
      data: { nodeId: null },
    });

    await db.knowledgeNode.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      deleted: { id, content: node.content.slice(0, 80) },
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/graph/:id — get a single node with its edges
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const node = await db.knowledgeNode.findUnique({
      where: { id },
      include: {
        edgesSource: true,
        edgesTarget: true,
      },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      node: {
        ...node,
        createdAt: node.createdAt.toISOString(),
        updatedAt: node.updatedAt.toISOString(),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
