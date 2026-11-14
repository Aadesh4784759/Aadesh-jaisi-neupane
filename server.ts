import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import mammoth from 'mammoth';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OWNER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'aadeshjaisi6@gmail.com').trim().toLowerCase();

function getFirebaseWebApiKey(): string {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return String(parsed.apiKey || '').trim();
    }
  } catch {}
  return String(process.env.VITE_FIREBASE_API_KEY || '').trim();
}

async function verifyOwnerFromRequest(req: Request): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  user?: { uid: string; email: string; displayName?: string; createdAt?: string };
}> {
  const authHeader = String(req.headers.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    return { ok: false, status: 401, error: 'Authentication token required for owner dashboard.' };
  }

  const firebaseApiKey = getFirebaseWebApiKey();
  if (!firebaseApiKey) {
    return { ok: false, status: 503, error: 'Firebase web configuration is unavailable on server.' };
  }

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) {
      return { ok: false, status: 401, error: 'Invalid or expired Firebase authentication session.' };
    }

    const data = await lookupRes.json();
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.email) {
      return { ok: false, status: 401, error: 'Unable to resolve authenticated account.' };
    }

    const email = String(user.email).trim().toLowerCase();
    const emailVerified = Boolean(user.emailVerified);
    if (email !== OWNER_ADMIN_EMAIL || !emailVerified) {
      return {
        ok: false,
        status: 403,
        error: 'Access restricted: Only the verified platform owner can access Admin controls.',
      };
    }

    return {
      ok: true,
      status: 200,
      user: {
        uid: String(user.localId || ''),
        email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    };
  } catch {
    return { ok: false, status: 500, error: 'Failed to verify owner credentials with authentication server.' };
  }
}

const getCliArg = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const eq = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
};

const cliPortRaw = getCliArg('--port');
const cliPort = cliPortRaw ? Number(cliPortRaw) : undefined;
const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const nginxPort = process.env.NGINX_PORT ? Number(process.env.NGINX_PORT) : undefined;
const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;

// In dev, never collide with NGINX_PORT (e.g. 8080) even if .env omits PORT
const PORT =
  (cliPort && Number.isFinite(cliPort) ? cliPort : undefined) ??
  (process.env.NODE_ENV !== 'production' && envPort && nginxPort && envPort === nginxPort
    ? defaultAppPort
    : envPort) ??
  defaultAppPort;

const HOST = getCliArg('--host') || '0.0.0.0';

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Supported active Flash models ordered by priority
const SUPPORTED_FLASH_FALLBACKS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
] as const;

const DEPRECATED_MODELS = new Set([
  'gemini-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]);

function sanitizeErrorMessage(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : (err as any)?.message
        ? String((err as any).message)
        : 'Unexpected error communicating with Gemini AI.';

  return raw
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED_API_KEY]')
    .replace(/AQ\.[0-9A-Za-z._-]{8,}/g, '[REDACTED_API_KEY]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]');
}

function sanitizeModelName(rawModel?: string): string {
  const defaultModel = 'gemini-4-hydrogen';
  if (!rawModel) return defaultModel;

  let cleaned = rawModel.trim();
  // Strip wrapping single or double quotes if present in .env
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, '').trim();
  // Strip repeated "models/" prefixes (SDK prepends models/ internally)
  cleaned = cleaned.replace(/^(?:models\/)+/i, '').trim();

  // Handle accidental slash-duplicated strings
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/').pop()?.trim() || '';
  }

  // Reject API keys accidentally placed in GEMINI_MODEL and enforce gemini-* format
  if (
    /^(?:aq\.|aiza)/i.test(cleaned) ||
    !/^gemini-[a-z0-9][a-z0-9._-]{1,48}$/i.test(cleaned)
  ) {
    return defaultModel;
  }

  if (DEPRECATED_MODELS.has(cleaned.toLowerCase())) {
    return 'gemini-4-hydrogen';
  }

  return cleaned;
}

function getCandidateModels(): string[] {
  const configured = sanitizeModelName(process.env.GEMINI_MODEL || 'gemini-4-hydrogen');
  return Array.from(new Set([configured, ...SUPPORTED_FLASH_FALLBACKS]));
}

// Shared Gemini Client with telemetry header and optional user key override
const getGeminiClient = (customKey?: string) => {
  const cleanedCustom = customKey?.trim().replace(/^['"]+|['"]+$/g, '') || '';
  const cleanedEnv = process.env.GEMINI_API_KEY?.trim().replace(/^['"]+|['"]+$/g, '') || '';
  const apiKey = cleanedCustom.length > 0 ? cleanedCustom : cleanedEnv;
  if (!apiKey) return null;

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
    ),
  ]);
}

function isAuthFailure(err: unknown): boolean {
  const msg = sanitizeErrorMessage(err).toLowerCase();
  const status = (err as any)?.status || (err as any)?.code;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission denied')
  );
}

const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

async function generateWithModelFallback(
  ai: GoogleGenAI,
  buildParams: (model: string) => Parameters<typeof ai.models.generateContent>[0],
  primaryTimeoutMs: number = 8000,
  fallbackTimeoutMs: number = 18000
): Promise<{ response: Awaited<ReturnType<typeof ai.models.generateContent>>; modelUsed: string }> {
  const candidates = getCandidateModels();
  const now = Date.now();
  const prioritized = [
    ...candidates.filter((m) => (modelCooldownUntil.get(m) ?? 0) <= now),
    ...candidates.filter((m) => (modelCooldownUntil.get(m) ?? 0) > now),
  ];

  let lastError: unknown = null;

  for (let i = 0; i < prioritized.length; i++) {
    const model = prioritized[i];
    const timeoutMs = i === 0 ? primaryTimeoutMs : fallbackTimeoutMs;
    try {
      const response = await withTimeout(
        ai.models.generateContent(buildParams(model)),
        timeoutMs
      );
      modelCooldownUntil.delete(model);
      return { response, modelUsed: model };
    } catch (err) {
      lastError = err;
      if (isAuthFailure(err)) {
        throw err;
      }
      modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
    }
  }

  throw lastError || new Error('All configured Gemini Flash models failed to respond.');
}

function extractJsonText(rawText?: string): Record<string, any> {
  if (!rawText) return {};
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function buildMemoryBlock(memoryContext?: unknown): string {
  if (!Array.isArray(memoryContext) || memoryContext.length === 0) return '';
  const items = memoryContext
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    .slice(0, 20)
    .map((m, idx) => `${idx + 1}. ${m.trim().slice(0, 300)}`);
  if (items.length === 0) return '';
  return `\n\nUSER-APPROVED PERSONALIZATION MEMORY (Respect these saved preferences & instructions):\n${items.join('\n')}`;
}

// Language map reference for system prompt
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ne: 'Nepali',
  hi: 'Hindi',
  bn: 'Bengali',
  ur: 'Urdu',
  ar: 'Arabic',
  zh: 'Mandarin Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  vi: 'Vietnamese',
  tr: 'Turkish',
  sw: 'Swahili',
  tl: 'Tagalog',
};

const PERSONA_TONES: Record<string, string> = {
  calm: 'Adopt a CALM voice persona: gentle reassurance, serene patience, and thoughtful clarity.',
  energetic: 'Adopt an ENERGETIC voice persona: upbeat motivation, enthusiasm, and lively phrasing.',
  professional: 'Adopt a PROFESSIONAL voice persona: executive polish, analytical precision, and clear insights.',
  friendly: 'Adopt a FRIENDLY voice persona: warm, welcoming, empathetic, and encouraging.',
};

// HEALTH & CONNECTION STATUS CHECK
app.get('/api/health', (req: Request, res: Response): void => {
  const customKey = (req.headers['x-gemini-api-key'] as string) || '';
  const ai = getGeminiClient(customKey);
  const candidates = getCandidateModels();

  res.json({
    status: 'ok',
    aiService: ai ? 'connected' : 'disconnected',
    isLiveAI: Boolean(ai),
    model: candidates[0],
    fallbackModels: candidates.slice(1),
    version: '2.5.0',
    platform: 'Aadesh AI Global Hub',
  });
});

// 1. CHAT & MULTIMODAL ENDPOINT (Live Google Gemini SDK)
app.post('/api/chat', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      messages = [],
      currentMessage = '',
      imageData,
      imageMimeType = 'image/jpeg',
      attachmentName,
      attachmentContent,
      targetLanguage = 'ne',
      userLanguage = 'en',
      voicePersona = 'friendly',
      location,
      memoryContext,
    } = req.body;

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body.customApiKey;
    const ai = getGeminiClient(customKey);

    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in .env or connect your key in Settings.',
        isLiveAI: false,
        retryable: true,
      });
      return;
    }

    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const personaInstruction = PERSONA_TONES[voicePersona] || PERSONA_TONES.friendly;
    const memoryBlock = buildMemoryBlock(memoryContext);

    const systemInstruction = `You are Aadesh AI ("One AI. Endless Possibilities.", created by Aadesh Jaisi), a professional global all-in-one AI assistant.
Provide accurate, natural, helpful answers including step-by-step explanations, programming assistance with clean markdown code blocks, study guidance, multilingual help, and image analysis.
Keep answers well-structured and concise for simple questions, detailed when complexity calls for it.

SUGGESTION RULE: For "suggestedQuestions", provide 3 short, context-aware follow-up action buttons tailored to this conversation (e.g., "Explain in more detail", "Give an example", "Summarize", or a specific follow-up).

User UI language: ${userLangName} (${userLanguage}).
Target translation language: ${targetLangName} (${targetLanguage}).
${location?.name ? `Current Geotag location: ${location.name} (${location.lat ?? 'N/A'}, ${location.lng ?? 'N/A'}).` : ''}
Tone requirement: ${personaInstruction}${memoryBlock}`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, any>> }> = [];

    // Cap history to last 6 turns to avoid bloated prompts
    if (Array.isArray(messages)) {
      for (const msg of messages.slice(-6)) {
        if (!msg?.content || msg.isError) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content) }],
        });
      }
    }

    const currentParts: Array<Record<string, any>> = [];
    if (imageData && typeof imageData === 'string') {
      const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
      const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType: detectedMime,
          data: cleanBase64,
        },
      });
    }

    let promptText =
      (typeof currentMessage === 'string' && currentMessage.trim()) ||
      (imageData
        ? 'Please inspect and analyze this image, translate visible text, and describe the scene.'
        : attachmentName
          ? `Please analyze the attached file (${attachmentName}).`
          : 'Hello');

    if (attachmentName && typeof attachmentContent === 'string' && attachmentContent.trim()) {
      const safeAttachment = attachmentContent.slice(0, 24000);
      promptText += `\n\n[Attached File: ${String(attachmentName).slice(0, 120)}]\n\`\`\`\n${safeAttachment}\n\`\`\``;
    }

    if (location?.name) {
      promptText += `\n[Geotag Location Context: ${location.name}]`;
    }
    currentParts.push({ text: promptText });

    // Ensure final turn is user (avoid consecutive duplicate user turn if already included in messages)
    const lastContent = contents[contents.length - 1];
    if (
      lastContent &&
      lastContent.role === 'user' &&
      lastContent.parts?.[0]?.text === currentMessage
    ) {
      contents[contents.length - 1] = { role: 'user', parts: currentParts };
    } else {
      contents.push({ role: 'user', parts: currentParts });
    }

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Accurate, helpful response in clean markdown.',
              },
              translation: {
                type: Type.STRING,
                description: `Natural translation of reply into ${targetLangName}.`,
              },
              detectedLanguage: {
                type: Type.STRING,
                description: 'ISO 639-1 code of the user input (e.g. en, ne, hi, es).',
              },
              sentiment: {
                type: Type.STRING,
                description: 'One of: positive, curious, inquiry, urgent, neutral.',
              },
              suggestedQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 or 3 short relevant follow-up questions.',
              },
              geotagInsights: {
                type: Type.STRING,
                description: 'Optional brief note if location or photo context is relevant.',
              },
            },
            required: ['reply', 'translation', 'detectedLanguage', 'sentiment', 'suggestedQuestions'],
          },
        },
      })
    );

    const latencyMs = Date.now() - startTime;
    const rawText = response.text || '';

    try {
      const parsed = extractJsonText(rawText);
      res.json({
        reply: parsed.reply || rawText,
        translation: parsed.translation || '',
        detectedLanguage: parsed.detectedLanguage || 'en',
        sentiment: parsed.sentiment || 'positive',
        suggestedQuestions:
          Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0
            ? parsed.suggestedQuestions
            : ['नेपालीमा अनुवाद गर्नुहोस् (Translate to Nepali)', 'Explain step by step in English'],
        geotagInsights: parsed.geotagInsights || undefined,
        latencyMs,
        isLiveAI: true,
        modelUsed,
      });
    } catch {
      res.json({
        reply: rawText || 'Response received.',
        translation: '',
        detectedLanguage: 'en',
        sentiment: 'neutral',
        suggestedQuestions: ['नेपालीमा अनुवाद गर्नुहोस् (Translate to Nepali)', 'Explain step by step in English'],
        latencyMs,
        isLiveAI: true,
        modelUsed,
      });
    }
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/chat:', safeError);
    const statusCode = isAuthFailure(err) ? 401 : 502;
    res.status(statusCode).json({
      error: safeError,
      latencyMs: Date.now() - startTime,
      isLiveAI: false,
      retryable: true,
    });
  }
});

// 1B. STREAMING CHAT ENDPOINT (SSE via Gemini generateContentStream)
app.post('/api/chat/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      messages = [],
      currentMessage = '',
      imageData,
      imageMimeType = 'image/jpeg',
      attachmentName,
      attachmentContent,
      targetLanguage = 'ne',
      userLanguage = 'en',
      voicePersona = 'friendly',
      location,
      memoryContext,
    } = req.body;

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body.customApiKey;
    const ai = getGeminiClient(customKey);

    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in .env or connect your key in Settings.',
        isLiveAI: false,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const personaInstruction = PERSONA_TONES[voicePersona] || PERSONA_TONES.friendly;
    const memoryBlock = buildMemoryBlock(memoryContext);

    const systemInstruction = `You are Aadesh AI ("One AI. Endless Possibilities.", built by Aadesh Jaisi).
Answer naturally and clearly in clean Markdown. Match the user's language (English, Nepali, or any requested language).
User UI language: ${userLangName} (${userLanguage}).
Target translation preference: ${targetLangName} (${targetLanguage}).
${location?.name ? `Location context: ${location.name}.` : ''}
Tone: ${personaInstruction}${memoryBlock}`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, any>> }> = [];
    if (Array.isArray(messages)) {
      for (const msg of messages.slice(-6)) {
        if (!msg?.content || msg.isError) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content) }],
        });
      }
    }

    const currentParts: Array<Record<string, any>> = [];
    if (imageData && typeof imageData === 'string') {
      const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
      const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      currentParts.push({ inlineData: { mimeType: detectedMime, data: cleanBase64 } });
    }

    let promptText =
      (typeof currentMessage === 'string' && currentMessage.trim()) ||
      (imageData ? 'Inspect and explain this image clearly.' : attachmentName ? `Analyze ${attachmentName}.` : 'Hello');

    if (attachmentName && typeof attachmentContent === 'string' && attachmentContent.trim()) {
      promptText += `\n\n[Attached File: ${String(attachmentName).slice(0, 120)}]\n\`\`\`\n${attachmentContent.slice(0, 24000)}\n\`\`\``;
    }
    if (location?.name) promptText += `\n[Geotag: ${location.name}]`;
    currentParts.push({ text: promptText });

    const lastContent = contents[contents.length - 1];
    if (lastContent && lastContent.role === 'user' && lastContent.parts?.[0]?.text === currentMessage) {
      contents[contents.length - 1] = { role: 'user', parts: currentParts };
    } else {
      contents.push({ role: 'user', parts: currentParts });
    }

    const candidates = getCandidateModels();
    let streamed = false;
    let usedModel = candidates[0];
    let lastErr: unknown = null;

    for (const model of candidates) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction },
        });
        usedModel = model;
        for await (const chunk of stream) {
          const text = chunk.text || '';
          if (text) {
            res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
          }
        }
        streamed = true;
        break;
      } catch (err) {
        lastErr = err;
        if (isAuthFailure(err)) throw err;
      }
    }

    if (!streamed) {
      throw lastErr || new Error('Streaming failed across models');
    }

    res.write(`data: ${JSON.stringify({ done: true, modelUsed: usedModel })}\n\n`);
    res.end();
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    res.write(`data: ${JSON.stringify({ error: safeError, done: true })}\n\n`);
    res.end();
  }
});

// 1C. CONTEXT-AWARE SUGGESTED REPLIES ENDPOINT
app.post('/api/chat/suggested-replies', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const {
    userMessage = '',
    aiReply = '',
    recentMessages = [],
    targetLanguage = 'ne',
    userLanguage = 'en',
    location,
    hasImage = false,
  } = req.body || {};

  const trimmedReply = String(aiReply || '').trim();
  const trimmedUserMsg = String(userMessage || '').trim();

  const buildFallbackSuggestions = (): string[] => {
    const suggestions: string[] = [
      'Explain in more detail',
      'Give a practical example',
      'Summarize the key points',
    ];
    if (location?.name) {
      suggestions.push(`Explore more about ${String(location.name).slice(0, 32)}`);
    } else if (hasImage) {
      suggestions.push('Analyze details in the image');
    } else if (targetLanguage && targetLanguage !== 'en') {
      const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
      suggestions.push(`Explain in ${targetLangName}`);
    }
    return suggestions.slice(0, 4);
  };

  if (!trimmedReply && !trimmedUserMsg) {
    res.json({
      suggestedReplies: buildFallbackSuggestions(),
      latencyMs: Date.now() - startTime,
      isFallback: true,
    });
    return;
  }

  try {
    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);

    if (!ai) {
      res.json({
        suggestedReplies: buildFallbackSuggestions(),
        latencyMs: Date.now() - startTime,
        isLiveAI: false,
        isFallback: true,
      });
      return;
    }

    const userLangName = LANGUAGE_NAMES[userLanguage] || userLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    const historySnippet = Array.isArray(recentMessages)
      ? recentMessages
          .slice(-4)
          .filter((m: any) => m?.content && !m?.isError)
          .map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${String(m.content).slice(0, 220)}`)
          .join('\n')
      : '';

    const prompt = `Generate 3 to 4 short, clickable follow-up reply buttons that the user can tap right beneath the AI assistant's latest message.
Rules:
- Each suggestion MUST be a concise natural button label/prompt (2 to 7 words max, no numbering or quotes).
- Tailor them specifically to the topic of the user's message and the assistant's reply (such as expanding a specific concept, giving a concrete example, summarizing, comparing alternatives, or exploring the location/image context if active).
- Write suggestions primarily in ${userLangName} (matching the user's language; if appropriate, one may offer ${targetLangName} translation/explanation).
${location?.name ? `- Active Geotag Location Context: ${String(location.name).slice(0, 80)}\n` : ''}${hasImage ? '- An image was shared in this turn.\n' : ''}${historySnippet ? `Recent context:\n${historySnippet}\n` : ''}
Latest User Message:
"""
${trimmedUserMsg.slice(0, 800)}
"""

Latest AI Reply:
"""
${trimmedReply.slice(0, 1600)}
"""`;

    const fastModels: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    ];

    let parsedReplies: string[] = [];
    let modelUsed = '';

    for (const candidate of fastModels) {
      try {
        const config: Record<string, any> = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedReplies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 concise, context-aware suggested follow-up reply buttons (each 2 to 7 words).',
              },
            },
            required: ['suggestedReplies'],
          },
        };
        if (candidate.model.startsWith('gemini-4') || candidate.model.startsWith('gemini-3')) {
          config.thinkingConfig = { thinkingLevel: candidate.thinkingLevel };
        }

        const response = await withTimeout(
          ai.models.generateContent({
            model: candidate.model,
            contents: prompt,
            config,
          }),
          6500
        );
        const parsed = extractJsonText(response.text);
        if (Array.isArray(parsed?.suggestedReplies)) {
          const cleaned = parsed.suggestedReplies
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 1)
            .map((item: string) => item.trim().slice(0, 72))
            .slice(0, 4);
          if (cleaned.length > 0) {
            parsedReplies = cleaned;
            modelUsed = candidate.model;
            break;
          }
        }
      } catch (err) {
        if (isAuthFailure(err)) break;
      }
    }

    res.json({
      suggestedReplies: parsedReplies.length > 0 ? parsedReplies : buildFallbackSuggestions(),
      modelUsed: modelUsed || undefined,
      isLiveAI: parsedReplies.length > 0,
      isFallback: parsedReplies.length === 0,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.json({
      suggestedReplies: buildFallbackSuggestions(),
      error: sanitizeErrorMessage(err),
      isFallback: true,
      latencyMs: Date.now() - startTime,
    });
  }
});

// Key validation route to verify a user-provided or environment API key
app.post('/api/gemini/verify-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const customKey = (req.body?.apiKey as string) || (req.headers['x-gemini-api-key'] as string);
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ valid: false, error: 'No API key provided' });
      return;
    }

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: 'Reply with {"status":"ok"}',
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
            },
            required: ['status'],
          },
        },
      }),
      12000,
      15000
    );

    res.json({ valid: true, model: modelUsed, response: response.text });
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: sanitizeErrorMessage(err) || 'Failed to authenticate with Gemini API',
    });
  }
});

// 2. DEDICATED REAL-TIME TRANSLATION & GRAMMAR ENDPOINT
app.post('/api/translate', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const {
    text,
    sourceLang = 'auto',
    targetLang,
    targetLanguage,
    mode = 'translate',
  } = req.body;
  const resolvedTargetLang = String(targetLang || targetLanguage || 'ne').trim();
  const targetLangName = LANGUAGE_NAMES[resolvedTargetLang] || resolvedTargetLang;

  if (!text || !String(text).trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  try {
    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);

    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured. Please connect your key in Settings.',
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const modeInstructions =
      mode === 'grammar'
        ? `Check grammar, spelling, and natural phrasing of the source text, provide the corrected version in "correctedText", explain key corrections concisely in "grammarNotes", and also translate the corrected text into ${targetLangName} in "translatedText".`
        : mode === 'paragraph'
          ? `Perform high-accuracy paragraph/document translation into ${targetLangName}, preserving tone, formatting, and nuance. Also note any source grammar improvements in "correctedText" if needed.`
          : `Translate the text accurately and naturally into ${targetLangName}.`;

    const prompt = `${modeInstructions}
Source language: ${sourceLang === 'auto' ? 'Detect automatically' : LANGUAGE_NAMES[sourceLang] || sourceLang}.

Text:
"""
${String(text).slice(0, 18000)}
"""`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedText: { type: Type.STRING },
              detectedSourceLang: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              culturalNote: { type: Type.STRING },
              correctedText: { type: Type.STRING },
              grammarNotes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['translatedText', 'detectedSourceLang'],
          },
        },
      }),
      10000,
      14000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      translatedText: parsed.translatedText || response.text || text,
      detectedSourceLang: parsed.detectedSourceLang || 'en',
      pronunciation: parsed.pronunciation || '',
      culturalNote: parsed.culturalNote || '',
      correctedText: parsed.correctedText || '',
      grammarNotes: Array.isArray(parsed.grammarNotes) ? parsed.grammarNotes : [],
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/translate:', safeError);
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: safeError,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 2B. CONCISE MESSAGE SUMMARIZER ENDPOINT (For Quick Context menu)
app.post('/api/summarize', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const targetLang = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';

  if (!rawText) {
    res.status(400).json({ error: 'Message text is required to generate a summary.' });
    return;
  }

  const clippedText = rawText.slice(0, 16000);

  try {
    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);

    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured. Please connect your key in Settings.',
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    const langHint = targetLang && LANGUAGE_NAMES[targetLang]
      ? `Write the summary in the primary language of the message (or provide clear clarity for a ${LANGUAGE_NAMES[targetLang]} reader if appropriate, while preserving exact key facts).`
      : 'Write the summary in the same language as the original message.';

    const prompt = `Summarize the following AI assistant message into a clear, concise summary and 2-4 crisp bullet takeaways. ${langHint} Keep all facts, numbers, and names accurate.

Message to summarize:
"""
${clippedText}
"""`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'A crisp 1 to 3 sentence concise summary of the message.',
              },
              keyPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 ultra-concise key takeaways or action points.',
              },
            },
            required: ['summary', 'keyPoints'],
          },
        },
      }),
      10000,
      14000
    );

    const parsed = extractJsonText(response.text);
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : response.text || clippedText.slice(0, 240);
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 5)
      : [];

    res.json({
      summary,
      keyPoints,
      modelUsed,
      latencyMs: Date.now() - startTime,
      originalChars: rawText.length,
    });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/summarize:', safeError);
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: safeError,
      latencyMs: Date.now() - startTime,
    });
  }
});

// 3. MEDIA GEOTAG ANALYZER ENDPOINT
app.post('/api/analyze-geotag', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageData, imageMimeType = 'image/jpeg', locationName, lat, lng } = req.body;
    if (!imageData || typeof imageData !== 'string') {
      res.status(400).json({ error: 'Image data is required' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({
        error: 'Gemini API key is not configured. Please connect your key in Settings.',
      });
      return;
    }

    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
    const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

    const prompt = `Analyze this geotagged photograph.
Location metadata: ${locationName || 'Unknown location'} (${lat ?? ''}, ${lng ?? ''}).`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: detectedMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detectedLandmark: { type: Type.STRING },
              detectedText: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              culturalSummary: { type: Type.STRING },
              suggestedTranslations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    lang: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                  required: ['lang', 'text'],
                },
              },
            },
            required: ['title', 'detectedLandmark', 'tags', 'culturalSummary'],
          },
        },
      }),
      14000,
      18000
    );

    const parsed = extractJsonText(response.text);
    res.json({ ...parsed, modelUsed });
  } catch (err: any) {
    const safeError = sanitizeErrorMessage(err);
    console.error('Error in /api/analyze-geotag:', safeError);
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: safeError,
    });
  }
});

// 4. OWNER-ONLY ADMIN VERIFICATION & OVERVIEW ENDPOINTS (Backend Token Verified)
app.post('/api/admin/verify', async (req: Request, res: Response): Promise<void> => {
  const result = await verifyOwnerFromRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ authorized: false, error: result.error });
    return;
  }
  res.json({
    authorized: true,
    owner: result.user,
  });
});

app.get('/api/admin/overview', async (req: Request, res: Response): Promise<void> => {
  const result = await verifyOwnerFromRequest(req);
  if (!result.ok) {
    res.status(result.status).json({ authorized: false, error: result.error });
    return;
  }

  const ai = getGeminiClient();
  const candidates = getCandidateModels();
  res.json({
    authorized: true,
    owner: result.user,
    serverStatus: {
      aiConfigured: Boolean(ai),
      primaryModel: candidates[0],
      fallbackModels: candidates.slice(1),
      supportedLanguagesCount: Object.keys(LANGUAGE_NAMES).length,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  });
});

// 5. IMAGE GENERATION & STUDIO ENDPOINTS
const IMAGE_MODEL_CAPABILITIES = {
  'gemini-3.1-flash-lite-image': {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Flash Lite Image (Fast)',
    description: 'High-speed raster image generation powered by Gemini 3.1 Flash Lite Image',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: [] as string[],
    supportsResolution: false,
  },
  'gemini-nano-banana-2.1': {
    id: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1 (HD)',
    description: 'Studio-quality 1K / 2K / 4K image generation powered by Gemini Nano Banana 2.1',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: ['1K', '2K', '4K'],
    supportsResolution: true,
  },
} as const;

type SupportedImageModelId = keyof typeof IMAGE_MODEL_CAPABILITIES;

const IMAGE_STYLE_DIRECTIVES: Record<string, string> = {
  Realistic: 'Photorealistic photography, natural lighting, sharp optical lens detail, true-to-life textures',
  '3D': '3D Octane studio render, volumetric lighting, smooth physically based materials, high depth',
  Cartoon: 'Vibrant stylized 2D cartoon illustration, expressive linework, rich cel shading',
  Anime: 'High-detail Japanese anime key visual artwork, crisp cel lighting, atmospheric background',
  'Digital Art': 'Modern concept digital art, dramatic lighting, intricate atmospheric composition',
  Painting: 'Fine art oil and gouache painting on textured canvas, expressive brushwork',
};

function classifyImageGenError(err: unknown): { status: number; message: string } {
  const safeMsg = sanitizeErrorMessage(err);
  const lower = safeMsg.toLowerCase();
  const rawStatus = Number((err as any)?.status || (err as any)?.code);

  if (lower.includes('timed out')) {
    return {
      status: 504,
      message: safeMsg || 'Image generation timed out. Please try a shorter prompt or retry.',
    };
  }
  if (
    rawStatus === 401 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key')
  ) {
    return {
      status: 401,
      message: 'Invalid Gemini API key. Please verify your API key configuration in Settings.',
    };
  }
  if (
    rawStatus === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('permission denied') ||
    lower.includes('billing')
  ) {
    return {
      status: 403,
      message:
        'Image generation access denied or billing required for this Gemini API key. Add a billing-enabled Gemini API key in Settings to generate images.',
    };
  }
  if (
    rawStatus === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 429,
      message:
        'Gemini image generation quota or rate limit reached. Please wait a moment or check billing/quota for your API key.',
    };
  }
  if (rawStatus === 404 || lower.includes('not found') || lower.includes('is not supported')) {
    return {
      status: 404,
      message: `Selected image model is unavailable for this API key: ${safeMsg}`,
    };
  }
  return {
    status: 502,
    message: safeMsg || 'Failed to generate image from Gemini AI.',
  };
}

const ASPECT_VIEWBOX: Record<string, { w: number; h: number }> = {
  '1:1': { w: 800, h: 800 },
  '16:9': { w: 960, h: 540 },
  '9:16': { w: 540, h: 960 },
  '4:3': { w: 800, h: 600 },
};

function sanitizeSvgMarkup(rawSvg: string, width: number, height: number): string | null {
  const match = rawSvg.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  return svg;
}

const rasterQuotaCooldownUntil = new Map<string, number>();

async function generateVectorFallbackSvg(params: {
  ai: GoogleGenAI;
  prompt: string;
  style: string;
  aspectRatio: string;
  startTime: number;
  notice: string;
}) {
  const box = ASPECT_VIEWBOX[params.aspectRatio] || ASPECT_VIEWBOX['1:1'];
  const svgPrompt = `Create an artistic SVG vector illustration (viewBox="0 0 ${box.w} ${box.h}") for: "${params.prompt}".
Visual style: ${params.style}.
Rules:
1. Output ONLY raw valid <svg viewBox="0 0 ${box.w} ${box.h}" xmlns="http://www.w3.org/2000/svg">...</svg> markup (no markdown fences or explanation).
2. Include rich <defs> gradients, atmospheric background, layered geometric/organic foreground shapes, lighting highlights, and balanced colors.
3. Keep the SVG concise (under 40 elements) and never include <script>, <foreignObject>, or external URLs.`;

  const vectorModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3.5-flash'];
  let response: Awaited<ReturnType<typeof params.ai.models.generateContent>> | null = null;
  let modelUsed = vectorModels[0];
  let lastErr: unknown = null;

  for (const model of vectorModels) {
    try {
      const res = await withTimeout(
        params.ai.models.generateContent({
          model,
          contents: svgPrompt,
          config: {
            ...(model === 'gemini-3.1-flash-lite'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
              : model.includes('gemini-4')
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        20000
      );
      response = res;
      modelUsed = model;
      break;
    } catch (err) {
      lastErr = err;
      if (isAuthFailure(err)) throw err;
    }
  }

  if (!response) {
    throw lastErr || new Error('Vector illustration fallback failed across models.');
  }

  const cleanSvg = sanitizeSvgMarkup(String(response.text || ''), box.w, box.h);
  if (!cleanSvg) {
    throw new Error('Vector illustration fallback did not return valid SVG markup.');
  }

  const svgBase64 = Buffer.from(cleanSvg, 'utf-8').toString('base64');
  return {
    ok: true as const,
    status: 200,
    imageDataUrl: `data:image/svg+xml;base64,${svgBase64}`,
    mimeType: 'image/svg+xml',
    revisedPrompt: `${params.prompt} (${params.style} vector illustration)`,
    modelUsed: `${modelUsed} (Vector Studio)`,
    aspectRatio: params.aspectRatio,
    resolution: undefined,
    style: params.style,
    isVectorFallback: true,
    fallbackNotice: params.notice,
    latencyMs: Date.now() - params.startTime,
  };
}

async function generateRasterImageWithGemini(params: {
  ai: GoogleGenAI;
  prompt: string;
  style?: string;
  aspectRatio?: string;
  resolution?: string;
  model?: string;
  hasCustomKey?: boolean;
}) {
  const startTime = Date.now();
  const cleanPrompt = String(params.prompt || '').trim().slice(0, 1500);
  if (!cleanPrompt) {
    return {
      ok: false as const,
      status: 400,
      error: 'Please enter a descriptive prompt for the image you want to generate.',
      latencyMs: Date.now() - startTime,
    };
  }

  const requestedModel = String(params.model || 'gemini-3.1-flash-lite-image').trim();
  if (!(requestedModel in IMAGE_MODEL_CAPABILITIES)) {
    return {
      ok: false as const,
      status: 400,
      error: `Unsupported image model "${requestedModel}". Supported models: ${Object.keys(IMAGE_MODEL_CAPABILITIES).join(', ')}.`,
      latencyMs: Date.now() - startTime,
    };
  }

  const primaryModelId = requestedModel as SupportedImageModelId;
  const candidateModels: SupportedImageModelId[] =
    primaryModelId === 'gemini-nano-banana-2.1'
      ? ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image']
      : [primaryModelId];

  const requestedAspect = String(params.aspectRatio || '1:1').trim();
  const cleanStyle = String(params.style || 'Realistic').trim();
  const styleDirective =
    IMAGE_STYLE_DIRECTIVES[cleanStyle] ||
    (cleanStyle && cleanStyle.toLowerCase() !== 'none' ? `${cleanStyle} style` : '');

  const finalPrompt = styleDirective
    ? `${cleanPrompt}\n\nStyle direction: ${styleDirective}.`
    : cleanPrompt;

  let lastClassified: { status: number; message: string } | null = null;
  let safeAspect = '1:1';

  for (const modelId of candidateModels) {
    const cap = IMAGE_MODEL_CAPABILITIES[modelId];
    safeAspect = (cap.aspectRatios as readonly string[]).includes(requestedAspect)
      ? requestedAspect
      : '1:1';

    if (!params.hasCustomKey && (rasterQuotaCooldownUntil.get(modelId) ?? 0) > Date.now()) {
      lastClassified = {
        status: 429,
        message: 'Gemini image generation quota or rate limit reached for raster model.',
      };
      continue;
    }

    const requestedResolution = String(params.resolution || '').trim().toUpperCase();
    const safeResolution =
      cap.supportsResolution && (cap.resolutions as readonly string[]).includes(requestedResolution)
        ? requestedResolution
        : cap.supportsResolution
        ? '1K'
        : undefined;

    const imageConfig: { aspectRatio: string; imageSize?: string } = {
      aspectRatio: safeAspect,
    };
    if (safeResolution) {
      imageConfig.imageSize = safeResolution;
    }

    try {
      const response = await withTimeout(
        params.ai.models.generateContent({
          model: modelId,
          contents: finalPrompt,
          config: {
            imageConfig,
          },
        }),
        25000
      );

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let base64Image: string | null = null;
      let mimeType = 'image/png';
      const textParts: string[] = [];

      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Image = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        } else if (typeof part.text === 'string' && part.text.trim()) {
          textParts.push(part.text.trim());
        }
      }

      if (!base64Image) {
        const note = textParts.join(' ').slice(0, 300);
        lastClassified = {
          status: 422,
          message: note
            ? `No image was returned by ${modelId}: ${note}`
            : `No image data was returned by ${modelId}. Please try rephrasing your prompt.`,
        };
        continue;
      }

      rasterQuotaCooldownUntil.delete(modelId);
      return {
        ok: true as const,
        status: 200,
        imageDataUrl: `data:${mimeType};base64,${base64Image}`,
        mimeType,
        revisedPrompt: textParts.join(' ').trim() || undefined,
        modelUsed: modelId,
        aspectRatio: safeAspect,
        resolution: safeResolution,
        style: cleanStyle,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      lastClassified = classifyImageGenError(err);
      if (!params.hasCustomKey && (lastClassified.status === 429 || lastClassified.status === 403)) {
        rasterQuotaCooldownUntil.set(modelId, Date.now() + MODEL_COOLDOWN_MS);
      }
      console.warn(`Raster image model ${modelId} unavailable (${lastClassified.status}): ${lastClassified.message}`);
      if (lastClassified.status === 401) {
        break;
      }
    }
  }

  // Automatic Free-Tier Vector Studio SVG fallback when raster models hit Free Tier quota (429) or billing gate (403)
  if (lastClassified && (lastClassified.status === 429 || lastClassified.status === 403 || lastClassified.status === 404)) {
    try {
      return await generateVectorFallbackSvg({
        ai: params.ai,
        prompt: cleanPrompt,
        style: cleanStyle,
        aspectRatio: safeAspect,
        startTime,
        notice:
          'Raster image models require paid-tier quota (current key has Free Tier limit 0). Generated a crisp Vector Studio SVG illustration instead using Gemini 4.',
      });
    } catch (svgErr: any) {
      const svgClassified = classifyImageGenError(svgErr);
      return {
        ok: false as const,
        status: svgClassified.status,
        error: svgClassified.message,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  return {
    ok: false as const,
    status: lastClassified?.status || 502,
    error: lastClassified?.message || 'Failed to generate image from Gemini AI.',
    latencyMs: Date.now() - startTime,
  };
}

app.get('/api/images/models', (_req: Request, res: Response): void => {
  res.json({
    defaultModel: 'gemini-3.1-flash-lite-image',
    models: Object.values(IMAGE_MODEL_CAPABILITIES),
  });
});

app.post('/api/images/generate', async (req: Request, res: Response): Promise<void> => {
  const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
  const ai = getGeminiClient(customKey);
  if (!ai) {
    res.status(400).json({
      ok: false,
      error: 'Gemini API key is not configured on the server or in Settings.',
    });
    return;
  }

  const result = await generateRasterImageWithGemini({
    ai,
    prompt: req.body?.prompt,
    style: req.body?.style,
    aspectRatio: req.body?.aspectRatio,
    resolution: req.body?.resolution,
    model: req.body?.model,
    hasCustomKey: Boolean(typeof customKey === 'string' && customKey.trim()),
  });

  if (!result.ok) {
    res.status(result.status).json({
      ok: false,
      error: result.error,
      latencyMs: result.latencyMs,
    });
    return;
  }

  res.json(result);
});

app.post('/api/studio/image', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      task = 'describe',
      prompt = '',
      imageData,
      imageMimeType = 'image/jpeg',
      targetLanguage = 'en',
      style,
      aspectRatio,
      resolution,
      model,
    } = req.body;

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    if (task === 'generate-image') {
      const result = await generateRasterImageWithGemini({
        ai,
        prompt,
        style,
        aspectRatio,
        resolution,
        model,
        hasCustomKey: Boolean(typeof customKey === 'string' && customKey.trim()),
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error, latencyMs: result.latencyMs });
        return;
      }
      res.json(result);
      return;
    }

    if (task === 'generate-svg') {
      if (!String(prompt).trim()) {
        res.status(400).json({ error: 'Please describe the artwork or diagram you want to generate.' });
        return;
      }

      const svgPrompt = `Create a rich, crisp, standalone SVG illustration (viewBox="0 0 800 500") representing: "${String(prompt).slice(0, 600)}".
Use clean gradients, layered geometric and organic paths, balanced colors, and zero external images or scripts.`;

      const { response, modelUsed } = await generateWithModelFallback(
        ai,
        (model) => ({
          model,
          contents: svgPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                svgMarkup: { type: Type.STRING, description: 'Complete valid <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">...</svg> code' },
                palette: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'description', 'svgMarkup'],
            },
          },
        }),
        14000,
        20000
      );

      const parsed = extractJsonText(response.text);
      res.json({
        ...parsed,
        modelUsed,
        latencyMs: Date.now() - startTime,
      });
      return;
    }

    if (!imageData || typeof imageData !== 'string') {
      res.status(400).json({ error: 'Image upload is required for visual analysis.' });
      return;
    }

    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : imageMimeType;
    const cleanBase64 = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';

    const taskPrompts: Record<string, string> = {
      describe: `Provide a thorough, structured visual description of this image in ${langName}. Include scene composition, subjects, mood, colors, and context.`,
      ocr: `Extract ALL visible text from this image accurately, preserving line breaks and structure. Also provide a ${langName} translation if the text is in another language.`,
      screenshot: `Analyze this UI or code screenshot carefully: explain what the screen shows, identify errors or UX/code issues if any, and suggest concrete improvements.`,
      'edit-plan': `Provide creative and technical image editing suggestions (lighting, framing, color grading, crop, contrast, CSS filter values) tailored to this photo and the user's goal: "${prompt || 'Make it look studio-grade'}".`,
    };

    const instruction = `${taskPrompts[task] || taskPrompts.describe}\nAdditional user prompt: ${prompt || 'None'}`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: detectedMime, data: cleanBase64 } },
            { text: instruction },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING, description: 'Markdown formatted detailed analysis' },
              extractedText: { type: Type.STRING, description: 'All OCR text found in the image, or empty string if none' },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              editSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['analysis', 'extractedText', 'highlights'],
          },
        },
      }),
      14000,
      20000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 6. CODING LAB ENDPOINT (HTML, CSS, JS, Python, SQL)
app.post('/api/coding', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      language = 'javascript',
      mode = 'explain',
      code = '',
      prompt = '',
      memoryContext,
    } = req.body;

    if (!String(code).trim() && !String(prompt).trim()) {
      res.status(400).json({ error: 'Please enter a prompt or code snippet.' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const systemInstruction = `You are Aadesh AI Coding Lab, a senior software architect and patient coding mentor supporting HTML, CSS, JavaScript, Python, and SQL.${memoryBlock}`;

    const userInstruction = `Language: ${language}
Mode: ${mode} (explain | debug | review | build | lesson)
User goal / question: ${prompt || 'Analyze and improve the code.'}

Source Code:
\`\`\`${language}
${String(code).slice(0, 24000)}
\`\`\`

If language is html, css, or javascript and mode is "build" or "lesson", also populate runnable "htmlCode", "cssCode", and "jsCode" for live preview where helpful.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: userInstruction,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              explanation: { type: Type.STRING, description: 'Clear Markdown explanation, bug fixes, or beginner-friendly lesson' },
              code: { type: Type.STRING, description: 'Clean improved or generated primary code' },
              htmlCode: { type: Type.STRING },
              cssCode: { type: Type.STRING },
              jsCode: { type: Type.STRING },
              tips: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'explanation', 'code', 'tips'],
          },
        },
      }),
      14000,
      20000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 7. STUDY HUB ENDPOINT (Notes, MCQ Quizzes, Practice Tests, Math, English/Nepali)
app.post('/api/study', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      mode = 'notes',
      topic = '',
      language = 'bilingual',
      questionCount = 5,
      extraContext = '',
      memoryContext,
    } = req.body;

    if (!String(topic).trim()) {
      res.status(400).json({ error: 'Please provide a topic or math problem to study.' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const count = Math.max(3, Math.min(10, Number(questionCount) || 5));
    const langInstruction =
      language === 'ne'
        ? 'Respond primarily in natural Nepali (नेपाली) with key English technical terms in parentheses.'
        : language === 'en'
          ? 'Respond in clear English.'
          : 'Provide clear English study material AND helpful Nepali (नेपाली) explanations/summary so learners master concepts in both languages.';

    const memoryBlock = buildMemoryBlock(memoryContext);
    const prompt = `Mode: ${mode}
Topic / Problem: ${String(topic).slice(0, 2000)}
Additional instructions: ${String(extraContext).slice(0, 2000)}
${langInstruction}${memoryBlock}

If mode is "mcq", "practice_test", or "exam_prep", generate ${count} well-crafted multiple choice questions with 4 options each, the 0-based correctIndex, an explanation, and a brief Nepali hint. Even for "notes", "math", or "english_nepali", include 3 quick check questions so the student can test understanding.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              notesMarkdown: { type: Type.STRING, description: 'Detailed study notes, math step-by-step solution, or exam prep guide in Markdown' },
              nepaliSummary: { type: Type.STRING, description: 'Concise Nepali explanation of the core concept' },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    nepaliHint: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctIndex', 'explanation'],
                },
              },
            },
            required: ['title', 'notesMarkdown', 'nepaliSummary', 'questions'],
          },
        },
      }),
      15000,
      22000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 8. PDF & DOCUMENT AI ENDPOINT (PDF, DOCX, CSV, TXT, MD, JSON)
app.post('/api/document', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      fileName = 'document.txt',
      mimeType = 'text/plain',
      fileBase64 = '',
      textContent = '',
      task = 'summary',
      question = '',
      targetLanguage = 'en',
    } = req.body;

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const lowerName = String(fileName).toLowerCase();
    const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx');

    const parts: Array<Record<string, any>> = [];
    let extractedPreview = '';

    if (isPdf && fileBase64) {
      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: cleanBase64,
        },
      });
      extractedPreview = `PDF document attached (${fileName})`;
    } else if (isDocx && fileBase64) {
      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = (result.value || '').trim();
      if (!extractedText) {
        res.status(400).json({ error: 'Could not extract readable text from this DOCX file.' });
        return;
      }
      extractedPreview = extractedText.slice(0, 4000);
      parts.push({
        text: `[DOCX File: ${fileName}]\n${extractedText.slice(0, 32000)}`,
      });
    } else {
      const rawText = String(textContent || '').trim();
      if (!rawText) {
        res.status(400).json({ error: 'Please upload a readable PDF, DOCX, CSV, TXT, JSON, or Markdown file.' });
        return;
      }
      extractedPreview = rawText.slice(0, 4000);
      parts.push({
        text: `[Document: ${fileName}]\n${rawText.slice(0, 32000)}`,
      });
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const taskPrompt =
      task === 'qa'
        ? `Answer this specific question about the attached document accurately in ${langName}: "${question || 'What is the main topic?'}"`
        : task === 'extract'
          ? `Extract all important entities, dates, numbers, metrics, action items, and key data points from this document in ${langName}.`
          : `Summarize this document clearly in ${langName}, including an executive overview and bullet takeaways.`;

    parts.push({ text: taskPrompt });

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING, description: 'Markdown formatted answer or summary' },
              keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              wordCountEstimate: { type: Type.INTEGER },
            },
            required: ['answer', 'keyFacts'],
          },
        },
      }),
      16000,
      24000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      answer: parsed.answer || response.text || '',
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      wordCountEstimate: parsed.wordCountEstimate || 0,
      extractedPreview,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 9. WEB SEARCH & RESEARCH ENDPOINT (Google Search + URL Context Grounding)
app.post('/api/research', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      query: researchQuery = '',
      mode = 'search',
      urls = [],
      targetLanguage = 'en',
    } = req.body;

    if (!String(researchQuery).trim() && (!Array.isArray(urls) || urls.length === 0)) {
      res.status(400).json({ error: 'Please enter a research topic, claim to fact-check, or webpage URL.' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const cleanUrls = Array.isArray(urls)
      ? urls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 4)
      : [];

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const modeDirectives: Record<string, string> = {
      search: `Perform live web research using Google Search. Provide a well-structured, up-to-date answer in ${langName} with citations and clear takeaways.`,
      webpage: `Analyze and summarize the provided webpage URL(s) clearly in ${langName}, highlighting key facts and insights.`,
      factcheck: `Fact-check the claim using current web sources. State clearly whether it is Supported, Partially True, Disputed, or False, and explain the evidence in ${langName}.`,
      compare: `Compare multiple perspectives and authoritative sources on this topic in ${langName}. Present a structured Markdown comparison table or bullet breakdown.`,
    };

    const fullPrompt = `${modeDirectives[mode] || modeDirectives.search}

Query / Claim: ${String(researchQuery).slice(0, 2000)}
${cleanUrls.length > 0 ? `Reference URLs:\n${cleanUrls.join('\n')}` : ''}`;

    const tools: Array<Record<string, any>> =
      cleanUrls.length > 0 ? [{ urlContext: {} }, { googleSearch: {} }] : [{ googleSearch: {} }];

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          tools,
        },
      }),
      16000,
      24000
    );

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceMap = new Map<string, { title: string; uri: string }>();
    for (const chunk of chunks) {
      const web = (chunk as any)?.web;
      if (web?.uri && !sourceMap.has(web.uri)) {
        sourceMap.set(web.uri, {
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    res.json({
      answer: response.text || 'Research complete.',
      sources: Array.from(sourceMap.values()),
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 10. VIDEO ASSISTANT ENDPOINT (Video understanding, summaries, SRT subtitles, transcript & scripts)
app.post('/api/video', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      task = 'summarize',
      prompt = '',
      transcriptText = '',
      videoData = '',
      videoMimeType = 'video/mp4',
      targetLanguage = 'en',
    } = req.body;

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    if (!videoData && !String(transcriptText).trim() && !String(prompt).trim()) {
      res.status(400).json({ error: 'Upload a short video clip or enter a transcript, topic, or script prompt.' });
      return;
    }

    const parts: Array<Record<string, any>> = [];
    if (videoData && typeof videoData === 'string') {
      const mimeMatch = videoData.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : videoMimeType;
      const cleanBase64 = videoData.replace(/^data:video\/[a-zA-Z0-9.+-]+;base64,/, '');
      parts.push({ inlineData: { mimeType: detectedMime, data: cleanBase64 } });
    }

    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    parts.push({
      text: `You are Aadesh AI Video Assistant.
Task: ${task} (understand | summarize | subtitles | transcribe | script).
Target language: ${langName}.
User instructions/topic: ${String(prompt).slice(0, 2000)}
${transcriptText ? `\nProvided Transcript/Notes:\n${String(transcriptText).slice(0, 18000)}` : ''}

Return a helpful summary, cleaned speech transcript (if applicable), valid SRT subtitle cues with timestamps (00:00:00,000 --> 00:00:04,000), a production-ready video script (if requested or helpful), and key visual/audio highlights.`,
    });

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              transcript: { type: Type.STRING },
              subtitlesSrt: { type: Type.STRING },
              script: { type: Type.STRING },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'highlights'],
          },
        },
      }),
      18000,
      26000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 11. PERSONAL AI ASSISTANT ENDPOINT (Daily Planner, Task Breakdown, Email & Writing Drafter)
app.post('/api/assistant', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      mode = 'daily_plan',
      prompt = '',
      existingTasks = [],
      memoryContext,
      targetLanguage = 'en',
    } = req.body;

    if (!String(prompt).trim() && (!Array.isArray(existingTasks) || existingTasks.length === 0)) {
      res.status(400).json({ error: 'Please describe your schedule, goal, or email draft request.' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const langName = LANGUAGE_NAMES[targetLanguage] || 'English';
    const tasksSummary = Array.isArray(existingTasks)
      ? existingTasks
          .slice(0, 15)
          .map((t: any) => `- [${t.completed ? 'x' : ' '}] ${t.title} (${t.priority || 'medium'}${t.dueTime ? `, ${t.dueTime}` : ''})`)
          .join('\n')
      : '';

    const fullPrompt = `You are Aadesh AI Personal Productivity Assistant. Respond in ${langName}.${memoryBlock}
Mode: ${mode} (daily_plan | task_breakdown | email_draft | writing)
User request: ${String(prompt).slice(0, 3000)}
${tasksSummary ? `\nCurrent User Tasks:\n${tasksSummary}` : ''}

Provide structured Markdown output in "content", plus an optional "emailSubject" (for email_draft), and 2-5 actionable "suggestedTasks" that the user can optionally add to their planner.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              emailSubject: { type: Type.STRING },
              suggestedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    category: { type: Type.STRING },
                    dueTime: { type: Type.STRING },
                  },
                  required: ['title', 'priority', 'category'],
                },
              },
            },
            required: ['title', 'content', 'suggestedTasks'],
          },
        },
      }),
      12000,
      18000
    );

    const parsed = extractJsonText(response.text);
    res.json({
      ...parsed,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// 12. AI AGENT HUB ENDPOINT (Multi-step Planning + Explicit Approval Actions)
app.post('/api/agent', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const {
      agentType = 'research',
      goal = '',
      memoryContext,
      context = '',
    } = req.body;

    if (!String(goal).trim()) {
      res.status(400).json({ error: 'Please specify a goal for the agent.' });
      return;
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
    const ai = getGeminiClient(customKey);
    if (!ai) {
      res.status(400).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const memoryBlock = buildMemoryBlock(memoryContext);
    const agentRoles: Record<string, string> = {
      research: 'Research Agent — synthesizes structured investigation plans, questions, and source checklists.',
      study: 'Study Agent — builds multi-step mastery schedules, concept breakdowns, and active recall drills.',
      coding: 'Coding Agent — architects modular software plans, code templates, testing strategies, and refactoring steps.',
      writing: 'Writing Agent — plans outlines, drafts polished copy, and refines tone and clarity.',
      translation: 'Translation Agent — handles bilingual English/Nepali & global localization workflows with cultural nuance.',
      productivity: 'Productivity Agent — decomposes big goals into timed sprints, task queues, and follow-up drafts.',
    };

    const fullPrompt = `You are the ${agentRoles[agentType] || agentRoles.research}${memoryBlock}
Goal: ${String(goal).slice(0, 2500)}
${context ? `Additional Context: ${String(context).slice(0, 2000)}` : ''}

Create a clear 3 to 5 step execution plan with substantive Markdown output for each step, AND propose 1 to 3 optional actions in "proposedActions" (types allowed: "save_memory", "create_task", "draft_email", "download_file") that MUST wait for explicit user approval before taking effect.`;

    const { response, modelUsed } = await generateWithModelFallback(
      ai,
      (model) => ({
        model,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              agentName: { type: Type.STRING },
              summary: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    output: { type: Type.STRING },
                  },
                  required: ['stepNumber', 'title', 'detail', 'output'],
                },
              },
              proposedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    content: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['id', 'type', 'title', 'description', 'content'],
                },
              },
            },
            required: ['agentName', 'summary', 'steps', 'proposedActions'],
          },
        },
      }),
      15000,
      22000
    );

    const parsed = extractJsonText(response.text);
    const normalizedActions = Array.isArray(parsed.proposedActions)
      ? parsed.proposedActions.map((a: any, idx: number) => ({
          id: a.id || `act-${Date.now()}-${idx}`,
          type: ['save_memory', 'create_task', 'draft_email', 'download_file', 'open_url'].includes(a.type)
            ? a.type
            : 'create_task',
          title: a.title || 'Proposed Action',
          description: a.description || '',
          payload: {
            content: String(a.content || a.title || ''),
            subject: String(a.subject || ''),
            category: String(a.category || 'preference'),
          },
        }))
      : [];

    res.json({
      agentName: parsed.agentName || 'Aadesh AI Agent',
      summary: parsed.summary || '',
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s: any, idx: number) => ({
            stepNumber: s.stepNumber || idx + 1,
            title: s.title || `Step ${idx + 1}`,
            detail: s.detail || '',
            output: s.output || '',
            status: 'completed',
          }))
        : [],
      proposedActions: normalizedActions,
      modelUsed,
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    res.status(isAuthFailure(err) ? 401 : 502).json({
      error: sanitizeErrorMessage(err),
      latencyMs: Date.now() - startTime,
    });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    const candidates = getCandidateModels();
    console.log(`Aadesh AI server active on http://${HOST}:${PORT} (primary model: ${candidates[0]})`);
  });
}

startServer();
