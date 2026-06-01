/**
 * Knowledge API auth middleware.
 *
 * Protects write routes (POST, PUT, DELETE) on /api/knowledge.
 * Supports two authentication methods:
 *   1. Admin JWT token (same as other admin routes) — via Authorization: Bearer <token>
 *   2. Dedicated knowledge API key — via X-Knowledge-Key header or Authorization: Bearer <key>
 *
 * Read-only routes (GET) are unprotected so the admin dashboard
 * and chatbot can fetch knowledge without extra auth.
 */

import jwt from 'jsonwebtoken';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'change-this-in-production';
const KNOWLEDGE_API_KEY = process.env.KNOWLEDGE_API_KEY || '';

export function requireKnowledgeAuth(req, res, next) {
  // Method 1: Try dedicated X-Knowledge-Key header
  const knowledgeKey = req.get('X-Knowledge-Key')?.trim();
  if (KNOWLEDGE_API_KEY && knowledgeKey === KNOWLEDGE_API_KEY) {
    req.knowledgeAuthMethod = 'api-key';
    return next();
  }

  // Method 2: Try Bearer token (could be admin JWT or API key)
  const bearer = req.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (bearer) {
    // Check if bearer matches the knowledge API key
    if (KNOWLEDGE_API_KEY && bearer === KNOWLEDGE_API_KEY) {
      req.knowledgeAuthMethod = 'api-key';
      return next();
    }

    // Check if bearer is a valid admin JWT
    try {
      const decoded = jwt.verify(bearer, ADMIN_JWT_SECRET);
      req.adminId = decoded.adminId;
      req.knowledgeAuthMethod = 'admin-jwt';
      return next();
    } catch {
      // JWT verification failed — fall through to rejection
    }
  }

  // Neither method succeeded
  if (!KNOWLEDGE_API_KEY) {
    return res.status(503).json({
      success: false,
      message:
        'Knowledge API write access is disabled. Set KNOWLEDGE_API_KEY in the server .env file, or use admin JWT authentication.',
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized. Provide a valid admin token or X-Knowledge-Key.',
  });
}
