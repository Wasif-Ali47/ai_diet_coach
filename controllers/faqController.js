import OpenAI from 'openai';
import { getMergedKnowledgeText } from '../services/knowledgeStoreService.js';

const MAX_HISTORY_MESSAGES = 10;

let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

/**
 * POST /api/faq/chat
 *
 * Public endpoint — no auth required.
 * Answers questions strictly based on the knowledge base managed by the admin.
 * Falls back gracefully if OpenAI is not configured.
 *
 * Body: { messages: [{ role: "user"|"assistant", content: string }] }
 * Response: { reply: string }
 */
export async function faqChat(req, res) {
  try {
    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide a non-empty "messages" array.',
      });
    }

    // Validate each message
    for (const m of messages) {
      if (!m?.role || !m?.content || typeof m.content !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Each message must have "role" and "content" (string).',
        });
      }
      if (!['user', 'assistant'].includes(m.role)) {
        return res.status(400).json({
          success: false,
          message: 'Message role must be "user" or "assistant".',
        });
      }
    }

    const openai = getOpenAI();
    if (!openai) {
      return res.json({
        success: true,
        reply:
          'The AI assistant is currently unavailable. Please try again later or contact support.',
      });
    }

    // Fetch current knowledge base (curated by admin via uni_admin)
    const knowledgeText = await getMergedKnowledgeText();

    const systemPrompt = knowledgeText?.trim()
      ? `You are a helpful diet and nutrition assistant for the AI Diet Coach app — a personalized meal planning app for people managing diabetes and other dietary needs.

Answer questions ONLY based on the following curated knowledge base. If the user asks something that is not covered in the knowledge base, say so clearly and suggest they consult their doctor or dietitian. Do not make up information.

Keep answers concise, practical, and friendly.

--- KNOWLEDGE BASE ---
${knowledgeText}
--- END OF KNOWLEDGE BASE ---`
      : `You are a helpful diet and nutrition assistant for the AI Diet Coach app — a personalized meal planning app for people managing diabetes and other dietary needs.

No specific knowledge base has been configured yet. Provide general, responsible dietary guidance and recommend users consult their doctor or dietitian for personalized advice.`;

    // Keep only the most recent messages to avoid large token usage
    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 600,
      temperature: 0.4,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!reply) {
      return res.status(502).json({
        success: false,
        message: 'Received an empty response from the AI. Please try again.',
      });
    }

    return res.json({ success: true, reply });
  } catch (err) {
    console.error('[faqChat] error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Failed to process your question. Please try again.',
    });
  }
}
