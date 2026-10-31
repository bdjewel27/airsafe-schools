/**
 * AirSafe Schools - Automated Test Bearer Token Cache
 *
 * Implements in-memory and persistent file-based caching for session tokens (QA Audit H4).
 * Reuses active Bearer tokens across sequential test suites and CLI commands,
 * preventing unnecessary logins and eliminating HTTP 429 rate limit lockouts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_FILE = path.join(__dirname, '..', '.smoke-token.json');
const memoryCache = new Map();

/**
 * Decode JWT payload without verifying signature (for expiration check only)
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if a token is still valid with at least `minTtlSeconds` buffer
 */
function isTokenValid(token, minTtlSeconds = 60) {
  if (!token || typeof token !== 'string') return false;
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true; // Non-standard or untimed token
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowSeconds > minTtlSeconds;
}

/**
 * Read persistent cache from disk
 */
function loadDiskCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(raw) || {};
    }
  } catch {
    // Ignore corrupt or locked cache file
  }
  return {};
}

/**
 * Save persistent cache to disk
 */
function writeDiskCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {
    // Fallback gracefully in restricted environments
  }
}

/**
 * Get an active, valid Bearer token for an email address
 */
function getCachedToken(email) {
  const key = (email || '').trim().toLowerCase();

  // 1. Check environment variable override
  if (process.env.AIRSAFE_AUTH_TOKEN && isTokenValid(process.env.AIRSAFE_AUTH_TOKEN)) {
    return process.env.AIRSAFE_AUTH_TOKEN;
  }
  if (key.includes('coordinator') || key.includes('principal')) {
    if (process.env.AIRSAFE_COORDINATOR_TOKEN && isTokenValid(process.env.AIRSAFE_COORDINATOR_TOKEN)) {
      return process.env.AIRSAFE_COORDINATOR_TOKEN;
    }
  }
  if (key.includes('teacher')) {
    if (process.env.AIRSAFE_TEACHER_TOKEN && isTokenValid(process.env.AIRSAFE_TEACHER_TOKEN)) {
      return process.env.AIRSAFE_TEACHER_TOKEN;
    }
  }

  // 2. Check in-memory process cache
  if (memoryCache.has(key)) {
    const mem = memoryCache.get(key);
    if (isTokenValid(mem.token)) {
      return mem.token;
    }
    memoryCache.delete(key);
  }

  // 3. Check persistent disk cache
  const disk = loadDiskCache();
  if (disk[key] && isTokenValid(disk[key].token)) {
    memoryCache.set(key, disk[key]);
    return disk[key].token;
  }

  return null;
}

/**
 * Store an authenticated Bearer token in cache
 */
function saveCachedToken(email, token) {
  if (!token || !isTokenValid(token)) return;
  const key = (email || '').trim().toLowerCase();
  const payload = decodeJwtPayload(token);
  const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + 3600 * 1000;

  const entry = { token, expiresAt, email: key, cachedAt: new Date().toISOString() };
  memoryCache.set(key, entry);

  const disk = loadDiskCache();
  disk[key] = entry;
  writeDiskCache(disk);
}

/**
 * Clear all cached tokens
 */
function clearCachedTokens() {
  memoryCache.clear();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  } catch {}
}

/**
 * Helper to fetch a cached token or perform login if cache is empty/expired
 */
async function getOrAuthenticateToken(email, password, authenticateFn) {
  const cached = getCachedToken(email);
  if (cached) {
    console.log(`⚡ [Token Cache] Reusing cached Bearer token for ${email} (zero HTTP 429 risk)`);
    return cached;
  }

  const freshToken = await authenticateFn(email, password);
  if (freshToken) {
    saveCachedToken(email, freshToken);
    console.log(`🔑 [Token Cache] Cached fresh Bearer token for ${email}`);
  }
  return freshToken;
}

module.exports = {
  getCachedToken,
  saveCachedToken,
  clearCachedTokens,
  getOrAuthenticateToken,
  isTokenValid,
  CACHE_FILE,
};
