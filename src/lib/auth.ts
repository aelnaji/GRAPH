import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple API key auth middleware.
 * Checks Authorization: Bearer <API_SECRET_KEY> header.
 * Set API_SECRET_KEY in your .env file.
 *
 * Usage in any route:
 *   const authError = requireAuth(request);
 *   if (authError) return authError;
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET_KEY;

  // If no secret is configured, skip auth in development only
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server misconfiguration: API_SECRET_KEY is not set' },
        { status: 500 }
      );
    }
    // Dev mode: allow without key but log a warning
    console.warn('[AUTH] WARNING: API_SECRET_KEY not set — auth is disabled in development mode');
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or malformed Authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7); // strip "Bearer "
  if (token !== secret) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid API key' },
      { status: 401 }
    );
  }

  return null; // auth passed
}
