import { AIMemoryItem, ChatMessage, MemoryCategory } from '../types';
import { sanitizeProviderSecretText } from './aiProviders';

export interface MemoryCategoryMeta {
  id: MemoryCategory;
  label: string;
  description: string;
}

export const POWER_MEMORY_CATEGORIES: MemoryCategoryMeta[] = [
  { id: 'identity', label: 'Identity', description: 'Name, nickname, role & background' },
  { id: 'preference', label: 'Preferences', description: 'Style, formatting, tone & workflow likes' },
  { id: 'goal', label: 'Goals', description: 'Learning, career & personal milestones' },
  { id: 'project', label: 'Projects', description: 'Ongoing apps, builds & work in progress' },
  { id: 'interest', label: 'Interests', description: 'Hobbies, topics & curiosities' },
  { id: 'comedy', label: 'Comedy & Humor', description: 'Funny moments & humor preferences' },
  { id: 'instruction', label: 'Instructions', description: 'Standing rules for how Aadesh AI replies' },
  { id: 'fact', label: 'Facts', description: 'Useful long-term context across sessions' },
  { id: 'conversation', label: 'Key Chats', description: 'Important takeaways worth remembering' },
];

export const ALL_MEMORY_CATEGORY_IDS: MemoryCategory[] = POWER_MEMORY_CATEGORIES.map((c) => c.id);

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'have', 'what',
  'when', 'where', 'which', 'about', 'into', 'just', 'like', 'some', 'more',
  'will', 'would', 'could', 'should', 'please', 'tell', 'give', 'make', 'here',
  'there', 'they', 'them', 'then', 'than', 'very', 'really', 'only', 'also',
  'remember', 'save', 'memory', 'forget', 'aadesh',
]);

/**
 * Returns true if text looks like it contains API keys, tokens, passwords, PINs, or payment secrets.
 * Secret credentials must NEVER be stored in Power Memory or Firestore.
 */
export function containsSecretOrCredential(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  const scrubbed = sanitizeProviderSecretText(raw);
  if (scrubbed !== raw) return true;

  const secretPatterns: RegExp[] = [
    /\bAIza[0-9A-Za-z\-_]{20,}\b/,
    /\bgsk_[0-9A-Za-z]{16,}\b/,
    /\bsk-or-v1-[0-9A-Za-z]{16,}\b/,
    /\bsk-[0-9A-Za-z]{20,}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:my\s+)?(?:password|passcode|pin\s*code|api\s*key|secret\s*key|access\s*token|refresh\s*token|private\s*key|cvv|otp)\s*(?:is|=|:)\s*\S+/i,
    /\b(?:\d[ -]*?){13,19}\b/, // Credit card length digit sequences
  ];

  return secretPatterns.some((re) => re.test(raw));
}

/**
 * Checks whether content includes sensitive or private personal data requiring explicit user confirmation.
 */
export function classifyMemorySensitivity(text: string): {
  isSensitive: boolean;
  reason?: string;
} {
  const clean = String(text || '').trim();
  if (!clean) return { isSensitive: false };

  const sensitiveChecks: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
      reason: 'contains a phone number',
    },
    {
      pattern: /\b(?:my\s+email\s+is|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i,
      reason: 'contains an email address',
    },
    {
      pattern: /\b(?:home\s+address|street\s+address|live\s+at\s+\d+|apartment\s+#?\d+)\b/i,
      reason: 'contains physical address details',
    },
    {
      pattern: /\b(?:medical|diagnosis|medication|therapy|depression|anxiety|illness|hospital|blood\s+type|allerg(?:y|ic))\b/i,
      reason: 'contains health or medical details',
    },
    {
      pattern: /\b(?:salary|income|bank\s+balance|debt|tax\s+id|passport|citizenship\s+number|ssn|social\s+security)\b/i,
      reason: 'contains financial or government ID details',
    },
    {
      pattern: /\b(?:born\s+on|birthday\s+is|my\s+age\s+is|\bi\s+am\s+\d{1,2}\s+years?\s+old)\b/i,
      reason: 'contains personal age or birth details',
    },
  ];

  for (const check of sensitiveChecks) {
    if (check.pattern.test(clean)) {
      return { isSensitive: true, reason: check.reason };
    }
  }
  return { isSensitive: false };
}

export function extractMemoryKeywords(text: string): string[] {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 10);
}

export function inferMemoryCategory(text: string): MemoryCategory {
  const lower = String(text || '').toLowerCase();
  if (/\b(my name is|call me|nickname|i am a |i work as|pronouns)\b/.test(lower)) {
    return 'identity';
  }
  if (/\b(joke|funny|humor|comedy|roast|meme|hilarious|sarcasm|pun|standup)\b/.test(lower)) {
    return 'comedy';
  }
  if (/\b(building|working on|my project|my app|developing|side project|startup|repo)\b/.test(lower)) {
    return 'project';
  }
  if (/\b(my goal|aiming to|want to become|preparing for|exam|milestone|dream is|learn to)\b/.test(lower)) {
    return 'goal';
  }
  if (/\b(always respond|reply with|keep answers|never use|format|instruction|rule)\b/.test(lower)) {
    return 'instruction';
  }
  if (/\b(hobby|hobbies|interested in|love watching|love playing|fan of|passion|music|anime|cricket|football)\b/.test(lower)) {
    return 'interest';
  }
  if (/\b(prefer|favorite|favourite|i like|i love|i dislike|hate when)\b/.test(lower)) {
    return 'preference';
  }
  return 'fact';
}

export interface ExplicitMemoryCommandResult {
  action: 'remember' | 'forget';
  content: string;
  usesPreviousTurnFallback: boolean;
}

/**
 * Detects explicit "Remember this", "Save this memory", and "Forget this" commands.
 */
export function detectExplicitMemoryCommand(
  rawText: string,
  previousUserOrModelText?: string
): ExplicitMemoryCommandResult | null {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const forgetMatch = text.match(
    /^(?:please\s+)?(?:forget\s+(?:this|that|about)?|delete\s+(?:this\s+)?memor(?:y|ies)|remove\s+(?:this\s+)?memor(?:y|ies)|erase\s+(?:this\s+)?memor(?:y|ies))[:\s,-]*(.*)$/i
  );
  if (forgetMatch) {
    const rest = (forgetMatch[1] || '').trim();
    const fallback = String(previousUserOrModelText || '').trim();
    const resolved = rest && !/^(this|that|it|memory)$/i.test(rest) ? rest : fallback || rest || 'this';
    return {
      action: 'forget',
      content: resolved,
      usesPreviousTurnFallback: !rest || /^(this|that|it|memory)$/i.test(rest),
    };
  }

  const rememberMatch = text.match(
    /^(?:please\s+)?(?:remember\s+(?:this|that)?|save\s+(?:this\s+)?(?:to\s+)?memor(?:y|ies)|add\s+(?:this\s+)?to\s+memor(?:y|ies)|keep\s+in\s+mind(?:\s+that)?)[:\s,-]*(.*)$/i
  );
  if (rememberMatch) {
    const rest = (rememberMatch[1] || '').trim();
    const usesPrev = !rest || /^(this|that|it)$/i.test(rest);
    const resolved = usesPrev ? String(previousUserOrModelText || '').trim() : rest;
    if (!resolved) return null;
    return {
      action: 'remember',
      content: resolved.slice(0, 600),
      usesPreviousTurnFallback: usesPrev,
    };
  }

  return null;
}

function tokenOverlapRatio(a: string, b: string): number {
  const tokA = new Set(extractMemoryKeywords(a));
  const tokB = new Set(extractMemoryKeywords(b));
  if (tokA.size === 0 || tokB.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  }
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  return shared / Math.min(tokA.size, tokB.size);
}

export function isDuplicateMemory(candidateContent: string, existing: AIMemoryItem[]): boolean {
  const normCandidate = candidateContent.trim().toLowerCase();
  if (!normCandidate) return true;
  return existing.some((item) => {
    const normExisting = item.content.trim().toLowerCase();
    if (normExisting === normCandidate) return true;
    return tokenOverlapRatio(normCandidate, normExisting) >= 0.8;
  });
}

export interface SmartMemoryCandidate {
  content: string;
  category: MemoryCategory;
  keywords: string[];
  isSensitive: boolean;
  sensitivityReason?: string;
  blockedSecret?: boolean;
  source: 'smart_auto' | 'command';
}

/**
 * Automatically identifies useful long-term facts/preferences/goals/projects/comedy preferences
 * from natural conversation turns without inventing facts or storing secrets.
 */
export function detectSmartAutoMemoryCandidate(
  userText: string,
  existingMemories: AIMemoryItem[]
): SmartMemoryCandidate | null {
  const raw = String(userText || '').trim();
  if (!raw || raw.length < 8 || raw.length > 600) return null;

  // Never auto-extract pure questions or general troubleshooting commands
  if (raw.endsWith('?') && !/\b(remember|save this)\b/i.test(raw)) return null;
  if (/^(what|how|why|when|where|who|can you|could you|explain|write|fix|debug|translate)\b/i.test(raw)) {
    return null;
  }

  if (containsSecretOrCredential(raw)) {
    return {
      content: '',
      category: 'fact',
      keywords: [],
      isSensitive: true,
      sensitivityReason: 'Secrets, passwords, and API keys cannot be saved to Power Memory.',
      blockedSecret: true,
      source: 'smart_auto',
    };
  }

  const triggerPatterns: Array<{ re: RegExp; category: MemoryCategory }> = [
    { re: /\b(?:my name is|call me|people call me|my nickname is)\s+([A-Za-z0-9][A-Za-z0-9\s.'-]{1,40})/i, category: 'identity' },
    { re: /\b(?:i'?m|i am)\s+(?:building|creating|developing|working on)\s+(.{4,160})/i, category: 'project' },
    { re: /\b(?:my goal is|i want to become|i'?m preparing for|i am studying for)\s+(.{4,160})/i, category: 'goal' },
    { re: /\b(?:i prefer|i always like|my favorite|my favourite|i love jokes about|i enjoy comedy)\b(.{3,160})/i, category: 'preference' },
    { re: /\b(?:make me laugh|funny moment|inside joke|my humor style|love dark humor|love dad jokes|love puns)\b(.{0,160})/i, category: 'comedy' },
    { re: /\b(?:my hobby is|my hobbies are|i'?m really into|i am passionate about)\s+(.{3,140})/i, category: 'interest' },
    { re: /\b(?:always reply in|always answer with|from now on\s+(?:use|keep|reply))\s+(.{4,160})/i, category: 'instruction' },
  ];

  const matched = triggerPatterns.find((p) => p.re.test(raw));
  if (!matched) return null;

  // Use concise sentence cleanly
  const firstSentence = raw.split(/(?<=[.!])\s+/)[0]?.trim() || raw;
  const candidateContent = firstSentence.slice(0, 260);
  if (isDuplicateMemory(candidateContent, existingMemories)) return null;

  const category =
    matched.category === 'preference' && /\b(joke|comedy|humor|funny|pun)\b/i.test(candidateContent)
      ? 'comedy'
      : matched.category;

  const sensitivity = classifyMemorySensitivity(candidateContent);
  return {
    content: candidateContent,
    category,
    keywords: extractMemoryKeywords(candidateContent),
    isSensitive: sensitivity.isSensitive,
    sensitivityReason: sensitivity.reason,
    source: 'smart_auto',
  };
}

export function findMatchingMemoriesToForget(
  queryText: string,
  memories: AIMemoryItem[]
): AIMemoryItem[] {
  if (memories.length === 0) return [];
  const cleanQuery = String(queryText || '').trim();
  if (!cleanQuery || /^(this|that|it|everything|last memory)$/i.test(cleanQuery)) {
    // When user says "Forget this" without specific noun, target the single most recent memory safely
    const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted[0] ? [sorted[0]] : [];
  }

  const queryKeywords = new Set(extractMemoryKeywords(cleanQuery));
  const lowerQuery = cleanQuery.toLowerCase();

  const scored = memories
    .map((m) => {
      const lowerContent = m.content.toLowerCase();
      let score = 0;
      if (lowerContent.includes(lowerQuery)) score += 10;
      const memKeywords = m.keywords && m.keywords.length > 0 ? m.keywords : extractMemoryKeywords(m.content);
      for (const kw of memKeywords) {
        if (queryKeywords.has(kw)) score += 3;
      }
      return { mem: m, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.mem.updatedAt - a.mem.updatedAt);

  return scored.slice(0, 3).map((s) => s.mem);
}

/**
 * Selects only the most relevant approved memories for the current conversation turn
 * so unrelated memories are NOT sent to the AI provider.
 */
export function retrieveRelevantMemories(params: {
  queryText: string;
  recentMessages?: Pick<ChatMessage, 'role' | 'content'>[];
  memories: AIMemoryItem[];
  maxItems?: number;
}): {
  selectedMemories: AIMemoryItem[];
  formattedContext: string[];
} {
  const { queryText, recentMessages = [], memories, maxItems = 6 } = params;
  const approved = memories.filter(
    (m) => m.approved && m.content.trim().length > 0 && !containsSecretOrCredential(m.content)
  );
  if (approved.length === 0) {
    return { selectedMemories: [], formattedContext: [] };
  }

  const recentUserContext = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => m.content)
    .join(' ');
  const combinedQuery = `${queryText || ''} ${recentUserContext}`.trim();
  const queryLower = combinedQuery.toLowerCase();
  const queryTokens = new Set(extractMemoryKeywords(combinedQuery));

  const isMemoryRecallQuery =
    /\b(what do you (?:know|remember) about me|who am i|my name|my goals|my project|my hobbies|my preferences|remind me)\b/i.test(
      queryText || ''
    );

  const scored = approved
    .map((mem) => {
      const memKeywords = mem.keywords && mem.keywords.length > 0 ? mem.keywords : extractMemoryKeywords(mem.content);
      let keywordHits = 0;
      for (const kw of memKeywords) {
        if (queryTokens.has(kw)) keywordHits++;
      }

      // Standing rules/identity apply broadly when relevant or recalled, whereas topical memories require actual relevance
      let categoryBoost = 0;
      if (mem.category === 'instruction') categoryBoost = 2;
      else if (mem.category === 'identity') categoryBoost = 1.5;

      if (mem.category === 'comedy' && /\b(joke|funny|laugh|humor|comedy|roast|story|cheer me up|bored)\b/.test(queryLower)) {
        categoryBoost += 4;
      }
      if (mem.category === 'project' && /\b(code|app|project|build|deploy|bug|feature|work|startup)\b/.test(queryLower)) {
        categoryBoost += 2.5;
      }
      if (mem.category === 'goal' && /\b(goal|plan|learn|study|roadmap|career|exam|habit)\b/.test(queryLower)) {
        categoryBoost += 2.5;
      }
      if (isMemoryRecallQuery) {
        categoryBoost += 3;
      }

      const relevanceScore = keywordHits * 4 + categoryBoost;
      return { mem, relevanceScore, keywordHits };
    })
    // Exclude purely unrelated topical items when there is zero keyword overlap and zero contextual match
    .filter((entry) => entry.relevanceScore >= 1.5 || isMemoryRecallQuery)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || b.mem.updatedAt - a.mem.updatedAt)
    .slice(0, maxItems);

  const selectedMemories = scored.map((s) => s.mem);
  const formattedContext = selectedMemories.map((m) => `[${m.category}] ${m.content.trim()}`);
  return { selectedMemories, formattedContext };
}

export function getLastMemoryUpdatedAt(memories: AIMemoryItem[]): number | null {
  if (!Array.isArray(memories) || memories.length === 0) return null;
  let latest = 0;
  for (const m of memories) {
    if (typeof m.updatedAt === 'number' && m.updatedAt > latest) {
      latest = m.updatedAt;
    }
  }
  return latest > 0 ? latest : null;
}

export function formatMemoryUpdatedTimestamp(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return 'Never updated';
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}
