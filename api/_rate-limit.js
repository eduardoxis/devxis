import crypto from 'node:crypto';
import { adminDb } from './_firebase-admin.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 4;

function secret() {
  if (!process.env.RATE_LIMIT_SECRET) throw new Error('Rate limit não configurado.');
  return process.env.RATE_LIMIT_SECRET;
}

export function rateLimitKey(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

// Persistente e transacional: funciona entre instâncias serverless e cold starts.
export async function rateLimit(key, max = MAX_HITS, windowMs = WINDOW_MS) {
  const reference = adminDb.collection('rate_limits').doc(rateLimitKey(key));
  const now = Date.now();
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists ? snapshot.data() : {};
    const hits = Array.isArray(previous.hits) ? previous.hits.filter(at => Number.isInteger(at) && now - at < windowMs) : [];
    if (hits.length >= max) return false;
    hits.push(now);
    transaction.set(reference, { hits, expiresAt: new Date(now + windowMs), updatedAt: new Date(now) });
    return true;
  });
}
