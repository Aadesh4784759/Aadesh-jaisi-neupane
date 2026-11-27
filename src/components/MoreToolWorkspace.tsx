import React, { useState, useRef } from 'react';
import {
  FileText,
  Mail,
  Inbox,
  PenTool,
  SpellCheck,
  AlignLeft,
  Sparkles,
  Copy,
  Check,
  Send,
  Volume2,
  Upload,
  RefreshCw,
  AlertCircle,
  Code2,
  GraduationCap,
  Search,
  ScanText,
  ExternalLink,
  Download,
} from 'lucide-react';
import { AppSettings } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import { getAuthHeaders } from '../utils/firebase';
import { voiceAssistant } from '../utils/speech';
import { MarkdownRenderer } from './MarkdownRenderer';

export type MoreWorkspaceToolId =
  | 'doc-translate'
  | 'email-write'
  | 'email-assist'
  | 'writing-assist'
  | 'grammar'
  | 'summarizer'
  | 'extra-tools';

interface MoreToolWorkspaceProps {
  toolId: MoreWorkspaceToolId;
  settings: AppSettings;
  isOnline: boolean;
  onSendToChat: (text: string) => void;
  onOpenScanner: () => void;
  onRecordTranslationMetric?: (langA: string, langB: string, latencyMs: number) => void;
}

async function extractReadableTextFromFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer });
      if (res.value?.trim()) return res.value.trim();
    } catch {}
  }

  if (lower.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const rawStr = new TextDecoder('latin1').decode(buffer);
    const extracted = Array.from(rawStr.matchAll(/\(([^()]{3,200})\)/g))
      .map((m) => m[1].replace(/\\[nrt]/g, ' ').trim())
      .filter((s) => /[a-zA-Z0-9\u0900-\u097F]{2,}/.test(s))
      .slice(0, 400)
      .join(' ');
    if (extracted.trim().length > 20) {
      return extracted.trim();
    }
    return `Uploaded PDF "${file.name}" (${Math.round(file.size / 1024)} KB). Paste specific PDF paragraphs below or use Document Scanner on mobile/desktop for scanned pages.`;
  }

  return await file.text();
}

export const MoreToolWorkspace: React.FC<MoreToolWorkspaceProps> = ({
  toolId,
  settings,
  isOnline,
  onSendToChat,
  onOpenScanner,
  onRecordTranslationMetric,
}) => {
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [targetLang, setTargetLang] = useState(settings.defaultTargetLanguage || 'ne');
  const [tone, setTone] = useState('professional');
  const [format, setFormat] = useState('article');
  const [emailAction, setEmailAction] = useState<'reply' | 'summarize' | 'tasks' | 'polish'>('reply');
  const [extraMode, setExtraMode] = useState<'code' | 'study' | 'research'>('code');
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputTitle, setOutputTitle] = useState('');
  const [outputText, setOutputText] = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const content = await extractReadableTextFromFile(file);
      setLoadedFileName(file.name);
      setInputA(content.slice(0, 16000));
    } catch {
      setError('Could not read text from the selected document.');
    }
    e.target.value = '';
  };

  const handleCopyOutput = () => {
    const full = outputTitle ? `${outputTitle}\n\n${outputText}` : outputText;
    if (!full) return;
    navigator.clipboard.writeText(full);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadOutput = () => {
    const full = [outputTitle, outputText, keyPoints.length ? `\nKey Points:\n- ${keyPoints.join('\n- ')}` : '']
      .filter(Boolean)
      .join('\n\n');
    const blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aadesh-ai-${toolId}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSpeakOutput = () => {
    if (!outputText) return;
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang);
    voiceAssistant.speak(outputText, langObj?.speechCode || 'en-US');
  };

  const runTool = async () => {
    setError(null);
    setOutputTitle('');
    setOutputText('');
    setKeyPoints([]);

    if (!inputA.trim()) {
      setError('Please enter or upload content before running this tool.');
      return;
    }

    if (!isOnline) {
      setError('You are currently offline. Connect to the internet to run AI tools.');
      return;
    }

    setIsLoading(true);
    const started = Date.now();
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const activeProvider = settings.aiProvider || 'gemini';
      const activeModel =
        activeProvider === 'openrouter'
          ? settings.openRouterModel || settings.aiModel
          : settings.aiModel;

      if (toolId === 'doc-translate') {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: inputA.slice(0, 12000),
            sourceLang: 'auto',
            targetLang,
            aiProvider: activeProvider,
            aiModel: activeModel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Document translation failed.');
        const targetLangName = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang)?.name || targetLang;
        setOutputTitle(`Translated Document (${targetLangName})`);
        setOutputText(data.translatedText || '');
        if (data.culturalNote) setKeyPoints([data.culturalNote]);
        onRecordTranslationMetric?.('auto', targetLang, data.latencyMs || Date.now() - started);
      } else if (toolId === 'email-write') {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'email_draft',
            targetLanguage: targetLang,
            prompt: `Write a complete, polished email.\nRecipient / Context: ${inputB || 'General recipient'}\nTone: ${tone}\nPurpose & Key Details:\n${inputA}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Email generation failed.');
        setOutputTitle(data.emailSubject ? `Subject: ${data.emailSubject}` : data.title || 'Email Draft');
        setOutputText(data.content || '');
      } else if (toolId === 'email-assist') {
        const actionDesc: Record<typeof emailAction, string> = {
          reply: 'Draft a thoughtful, ready-to-send reply to this email',
          summarize: 'Summarize this email thread concisely with key dates and asks',
          tasks: 'Extract every action item, owner, and deadline from this email',
          polish: 'Rewrite and polish this email draft for maximum clarity and professionalism',
        };
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'email_draft',
            targetLanguage: targetLang,
            prompt: `${actionDesc[emailAction]}.\nPreferred Tone: ${tone}\n${inputB ? `Extra instructions: ${inputB}\n` : ''}\nOriginal Email Content:\n"""\n${inputA}\n"""`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Email Assistant failed.');
        setOutputTitle(data.emailSubject ? `Subject: ${data.emailSubject}` : data.title || 'Email Assistant Output');
        setOutputText(data.content || '');
      } else if (toolId === 'writing-assist') {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'writing',
            targetLanguage: targetLang,
            prompt: `Format: ${format}\nTone: ${tone}\n${inputB ? `Audience / Constraints: ${inputB}\n` : ''}Topic / Prompt:\n${inputA}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'AI Writing Assistant failed.');
        setOutputTitle(data.title || 'Written Draft');
        setOutputText(data.content || '');
      } else if (toolId === 'grammar') {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [],
            targetLanguage: targetLang,
            userLanguage: settings.uiLanguage,
            aiProvider: activeProvider,
            aiModel: activeModel,
            currentMessage: `Fix all grammar, spelling, punctuation, and clarity issues in the text below using a "${tone}" style. Format your response cleanly with:\n1. **Corrected Text**\n2. **Key Improvements Made** (concise bullet list)\n\nText to correct:\n"""\n${inputA}\n"""`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Grammar correction failed.');
        setOutputTitle('Corrected Text & Notes');
        setOutputText(data.reply || '');
      } else if (toolId === 'summarizer') {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: inputA.slice(0, 16000),
            targetLanguage: targetLang,
            aiProvider: activeProvider,
            aiModel: activeModel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Summarization failed.');
        setOutputTitle('Concise Summary');
        setOutputText(data.summary || '');
        if (Array.isArray(data.keyPoints)) setKeyPoints(data.keyPoints);
      } else if (toolId === 'extra-tools') {
        if (extraMode === 'code') {
          const res = await fetch('/api/coding', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              prompt: inputA,
              code: inputB,
              language: 'TypeScript / Python / JS',
              task: 'generate_or_debug',
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Coding assistant failed.');
          setOutputTitle('Code & Engineering Solution');
          setOutputText(
            [
              data.explanation || data.reply || '',
              data.code ? `\`\`\`\n${data.code}\n\`\`\`` : '',
            ]
              .filter(Boolean)
              .join('\n\n')
          );
          if (Array.isArray(data.tips)) setKeyPoints(data.tips);
        } else if (extraMode === 'study') {
          const res = await fetch('/api/study', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              topic: inputA,
              mode: 'notes',
              language: targetLang === 'ne' ? 'bilingual' : 'en',
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Study assistant failed.');
          setOutputTitle(data.title || 'Study Notes');
          setOutputText(data.content || data.summary || '');
          if (Array.isArray(data.keyPoints)) setKeyPoints(data.keyPoints);
        } else {
          const res = await fetch('/api/research', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              query: inputA,
              targetLanguage: targetLang,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Web research failed.');
          setOutputTitle('Live Research Brief');
          setOutputText(data.answer || data.reply || '');
          if (Array.isArray(data.sources)) {
            setKeyPoints(
              data.sources.slice(0, 5).map((s: any) => `${s.title || 'Source'}: ${s.uri || ''}`)
            );
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to process request right now.');
    } finally {
      setIsLoading(false);
    }
  };

  const toneOptions = ['professional', 'friendly', 'persuasive', 'concise', 'academic'];

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.docx,.pdf,.rtf"
        onChange={handleLoadDocument}
        className="hidden"
      />

      {/* Tool Sub-controls */}
      {toolId === 'extra-tools' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setExtraMode('code')}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              extraMode === 'code'
                ? 'bg-purple-600/45 border-purple-400 text-white'
                : 'bg-[#120d26] border-white/10 text-purple-200 hover:border-purple-400/40'
            }`}
          >
            <Code2 className="w-4 h-4 text-sky-300" />
            <span>Code Helper</span>
          </button>
          <button
            type="button"
            onClick={() => setExtraMode('study')}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              extraMode === 'study'
                ? 'bg-purple-600/45 border-purple-400 text-white'
                : 'bg-[#120d26] border-white/10 text-purple-200 hover:border-purple-400/40'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-emerald-300" />
            <span>Study Notes</span>
          </button>
          <button
            type="button"
            onClick={() => setExtraMode('research')}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              extraMode === 'research'
                ? 'bg-purple-600/45 border-purple-400 text-white'
                : 'bg-[#120d26] border-white/10 text-purple-200 hover:border-purple-400/40'
            }`}
          >
            <Search className="w-4 h-4 text-amber-300" />
            <span>Web Research</span>
          </button>
          <button
            type="button"
            onClick={onOpenScanner}
            className="min-h-[44px] px-3 py-2 rounded-xl border bg-cyan-950/50 hover:bg-cyan-900/60 border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ScanText className="w-4 h-4" />
            <span>Doc Scanner OCR</span>
          </button>
        </div>
      )}

      {/* Configuration Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block mb-1">
            Output Language
          </label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full bg-[#120e24] border border-white/15 focus:border-purple-400 rounded-xl px-3 py-2 text-xs text-white outline-none"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-[#120e24] text-white">
                {l.flag} {l.name} ({l.nativeName})
              </option>
            ))}
          </select>
        </div>

        {(toolId === 'email-write' ||
          toolId === 'email-assist' ||
          toolId === 'writing-assist' ||
          toolId === 'grammar') && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block mb-1">
              Tone &amp; Style
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full bg-[#120e24] border border-white/15 focus:border-purple-400 rounded-xl px-3 py-2 text-xs text-white outline-none capitalize"
            >
              {toneOptions.map((tOpt) => (
                <option key={tOpt} value={tOpt} className="bg-[#120e24] text-white capitalize">
                  {tOpt}
                </option>
              ))}
            </select>
          </div>
        )}

        {(toolId === 'doc-translate' || toolId === 'summarizer') && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-400/35 text-xs font-bold text-purple-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-purple-300" />
              <span>{loadedFileName ? `Loaded: ${loadedFileName}` : 'Upload DOCX / TXT / PDF'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Mode Specific Inputs */}
      {toolId === 'email-assist' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { id: 'reply', label: 'Draft Reply' },
            { id: 'summarize', label: 'Summarize Thread' },
            { id: 'tasks', label: 'Action Items' },
            { id: 'polish', label: 'Polish Email' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setEmailAction(opt.id as typeof emailAction)}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                emailAction === opt.id
                  ? 'bg-purple-600/45 border-purple-400 text-white'
                  : 'bg-[#120e24] border-white/10 text-purple-200 hover:border-purple-400/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {toolId === 'writing-assist' && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {['article', 'social post', 'report', 'essay', 'story', 'product copy'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`min-h-[36px] px-2 py-1.5 rounded-xl text-[11px] font-semibold capitalize border cursor-pointer ${
                format === f
                  ? 'bg-purple-600/45 border-purple-400 text-white'
                  : 'bg-[#120e24] border-white/10 text-purple-200 hover:border-purple-400/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {(toolId === 'email-write' ||
        toolId === 'email-assist' ||
        toolId === 'writing-assist' ||
        (toolId === 'extra-tools' && extraMode === 'code')) && (
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block mb-1">
            {toolId === 'email-write'
              ? 'Recipient / Subject Context (Optional)'
              : toolId === 'email-assist'
              ? 'Reply Instructions (Optional)'
              : toolId === 'writing-assist'
              ? 'Target Audience / Key Constraints (Optional)'
              : 'Existing Code Snippet (Optional)'}
          </label>
          <input
            type="text"
            value={inputB}
            onChange={(e) => setInputB(e.target.value)}
            placeholder={
              toolId === 'email-write'
                ? 'e.g. Hiring Manager at TechCorp — Follow-up after interview'
                : toolId === 'email-assist'
                ? 'e.g. Accept the Tuesday meeting and ask for the agenda'
                : toolId === 'writing-assist'
                ? 'e.g. 500 words for startup founders'
                : 'Paste code snippet or error trace...'
            }
            className="w-full bg-[#120e24] border border-white/15 focus:border-purple-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-300/40 outline-none"
          />
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block mb-1">
          {toolId === 'doc-translate'
            ? 'Document Text to Translate'
            : toolId === 'email-write'
            ? 'What should this email communicate?'
            : toolId === 'email-assist'
            ? 'Paste Received Email or Thread'
            : toolId === 'writing-assist'
            ? 'Topic & Instructions'
            : toolId === 'grammar'
            ? 'Text to Check & Correct'
            : toolId === 'summarizer'
            ? 'Text or Article to Summarize'
            : extraMode === 'code'
            ? 'Describe the program or bug to solve'
            : extraMode === 'study'
            ? 'Study topic or concept'
            : 'Research question'}
        </label>
        <textarea
          rows={5}
          value={inputA}
          onChange={(e) => setInputA(e.target.value)}
          placeholder="Type, paste, or upload content here..."
          className="w-full bg-[#120e24] border border-white/15 focus:border-purple-400 rounded-2xl p-3.5 text-xs sm:text-sm text-white placeholder-purple-300/40 outline-none resize-y leading-relaxed"
        />
      </div>

      {error && (
        <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500/45 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTool}
          disabled={isLoading}
          className="purple-glow-btn min-h-[44px] px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-55"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>
            {isLoading
              ? 'Processing with Gemini...'
              : toolId === 'doc-translate'
              ? 'Translate Document'
              : toolId === 'email-write'
              ? 'Generate Email Draft'
              : toolId === 'email-assist'
              ? 'Run Email Assistant'
              : toolId === 'writing-assist'
              ? 'Generate Content'
              : toolId === 'grammar'
              ? 'Fix Grammar & Style'
              : toolId === 'summarizer'
              ? 'Summarize Text'
              : 'Run AI Tool'}
          </span>
        </button>

        {inputA.trim() && (
          <button
            type="button"
            onClick={() => {
              setInputA('');
              setInputB('');
              setLoadedFileName(null);
              setOutputTitle('');
              setOutputText('');
              setKeyPoints([]);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-purple-200 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Result Output Card */}
      {(outputText || keyPoints.length > 0) && (
        <div className="p-4 rounded-2xl bg-[#0e0a20]/90 border border-purple-400/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              {toolId === 'email-write' && <Mail className="w-4 h-4 text-purple-300" />}
              {toolId === 'email-assist' && <Inbox className="w-4 h-4 text-purple-300" />}
              {toolId === 'writing-assist' && <PenTool className="w-4 h-4 text-purple-300" />}
              {toolId === 'grammar' && <SpellCheck className="w-4 h-4 text-emerald-300" />}
              {toolId === 'summarizer' && <AlignLeft className="w-4 h-4 text-amber-300" />}
              {toolId === 'doc-translate' && <FileText className="w-4 h-4 text-teal-300" />}
              <span>{outputTitle || 'AI Output'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyOutput}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-purple-600/40 border border-white/15 text-[11px] font-semibold text-purple-100 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleSpeakOutput}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-purple-600/40 border border-white/15 text-[11px] font-semibold text-purple-100 flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Listen</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadOutput}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-purple-600/40 border border-white/15 text-[11px] font-semibold text-purple-100 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>

              {(toolId === 'email-write' || toolId === 'email-assist') && (
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    outputTitle.replace(/^Subject:\s*/i, '')
                  )}&body=${encodeURIComponent(outputText)}`}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-[11px] font-semibold text-emerald-200 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Email App</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => onSendToChat(outputTitle ? `${outputTitle}\n\n${outputText}` : outputText)}
                className="px-2.5 py-1.5 rounded-xl bg-purple-600/45 hover:bg-purple-500/60 border border-purple-400/50 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Send to Chat</span>
              </button>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-gray-100 leading-relaxed max-h-64 overflow-y-auto pr-1">
            <MarkdownRenderer content={outputText} />
          </div>

          {keyPoints.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                Highlights &amp; Notes
              </div>
              <ul className="space-y-1 text-xs text-purple-100/90 list-disc pl-4">
                {keyPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
