import { NextRequest, NextResponse } from 'next/server';
import { getAllPolicies, setPolicy, ensurePolicies } from '@/lib/agents/policy-store';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    await ensurePolicies();
    const policies = await getAllPolicies();
    return NextResponse.json({
      success: true,
      policies,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Key and value are required' },
        { status: 400 }
      );
    }

    // Fetch policy to check guardrail bounds
    const { db } = await import('@/lib/db');
    const policy = await db.policyConfig.findUnique({ where: { key } });

    if (policy && policy.valueType === 'number') {
      const numVal = Number(value);
      if (isNaN(numVal)) {
        return NextResponse.json({ error: 'Value must be a number for this policy' }, { status: 400 });
      }
      if (policy.minValue !== null && numVal < policy.minValue) {
        return NextResponse.json(
          { error: `Value ${numVal} is below minimum allowed (${policy.minValue})` },
          { status: 400 }
        );
      }
      if (policy.maxValue !== null && numVal > policy.maxValue) {
        return NextResponse.json(
          { error: `Value ${numVal} is above maximum allowed (${policy.maxValue})` },
          { status: 400 }
        );
      }
    }

    await setPolicy(key, value);
    return NextResponse.json({ success: true, key, value, timestamp: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
