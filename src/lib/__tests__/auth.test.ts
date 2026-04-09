/**
 * Unit tests for auth middleware
 */
import { requireAuth } from '../auth';
import { NextRequest } from 'next/server';

const makeRequest = (authHeader?: string): NextRequest => {
  return new NextRequest('http://localhost:3000/api/test', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
};

describe('requireAuth()', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns null (passes) in development with no API_SECRET_KEY set', () => {
    delete process.env.API_SECRET_KEY;
    process.env.NODE_ENV = 'development';
    const result = requireAuth(makeRequest());
    expect(result).toBeNull();
  });

  it('returns 500 in production with no API_SECRET_KEY configured', () => {
    delete process.env.API_SECRET_KEY;
    process.env.NODE_ENV = 'production';
    const result = requireAuth(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
  });

  it('returns 401 when Authorization header is missing', () => {
    process.env.API_SECRET_KEY = 'my-secret';
    const result = requireAuth(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 401 when header is malformed (no Bearer prefix)', () => {
    process.env.API_SECRET_KEY = 'my-secret';
    const result = requireAuth(makeRequest('my-secret')); // missing "Bearer "
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 401 when token is wrong', () => {
    process.env.API_SECRET_KEY = 'correct-secret';
    const result = requireAuth(makeRequest('Bearer wrong-token'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns null (passes) when correct Bearer token provided', () => {
    process.env.API_SECRET_KEY = 'correct-secret';
    const result = requireAuth(makeRequest('Bearer correct-secret'));
    expect(result).toBeNull();
  });
});
