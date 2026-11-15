import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Check,
  X,
  Trash2,
  Copy,
  ArrowUpRight,
  BookOpen,
  FileCode,
  Search,
  RefreshCw,
  Info,
} from 'lucide-react';
import { AppSettings } from '../types';

interface UploadedDocument {
  id: string;
  name: string;
  content: string;
  sizeBytes: number;
  uploadedAt: number;
  summary?: string;
  keyPoints?: string[];
}

interface DocumentAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachToChat: (name: string, content: string) => void;
  settings: AppSettings;
  isOnline: boolean;
}

const DOCS_STORAGE_KEY = 'aadesh_ai_uploaded_docs_v1';

export const DocumentAssistantModal: React.FC<DocumentAssistantModalProps> = ({
  isOpen,
  onClose,
  onAttachToChat,
  settings,
  isOnline,
}) => {
  const [documents, setDocuments] = useState<UploadedDocument[]>(() => {
    try {
      const raw = localStorage.getItem(DOCS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [
      {
        id: 'doc-sample-1',
        name: 'Project_Architecture_Overview.md',
        content: `# Aadesh AI Architecture Overview\n\nAadesh AI is built with a high-performance React SPA frontend using Vite, Tailwind CSS v4, TypeScript, and Lucide icons. The backend runs on Express with Vite development middleware, integrating the official Google GenAI SDK (@google/genai) for multimodal reasoning, multilingual chat, vision analysis, and voice synthesis.`,
        sizeBytes: 420,
        uploadedAt: Date.now() - 3600000 * 2,
        summary: 'Overview of Aadesh AI architecture featuring React, Vite, Tailwind CSS, TypeScript, and Google GenAI SDK integration.',
        keyPoints: [
          'Frontend: React SPA, Vite, Tailwind CSS v4, TypeScript',
          'Backend: Express server with Vite middleware',
          'AI Engine: Official Google GenAI SDK (@google/genai)',
        ],
      },
    ];
  });

  const [activeDocId, setActiveDocId] = useState<string>(documents[0]?.id || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(documents));
    } catch {}
  }, [documents]);

  if (!isOpen) return null;

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      setToastMessage('Document files must be 500 KB or smaller.');
      setTimeout(() => setToastMessage(null), 3000);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = String(event.target?.result || '');
      const newDoc: UploadedDocument = {
        id: `doc-${Date.now()}`,
        name: file.name,
        content: text,
        sizeBytes: file.size,
        uploadedAt: Date.now(),
      };

      const nextDocs = [newDoc, ...documents];
      setDocuments(nextDocs);
      setActiveDocId(newDoc.id);
      setToastMessage(`Successfully uploaded "${file.name}"!`);
      setTimeout(() => setToastMessage(null), 2500);

      // Auto-generate initial summary if online
      await analyzeDocumentContent(newDoc.id, text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const analyzeDocumentContent = async (docId: string, contentText: string) => {
    setIsAnalyzing(true);
    try {
      if (!isOnline) {
        const sentences = contentText
          .replace(/[#*_`>]/g, '')
          .split(/(?<=[.!?।])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const summary = `[Offline Summary] ${sentences.slice(0, 2).join(' ') || contentText.slice(0, 180)}`;
        const keyPoints = sentences.slice(0, 3);
        setDocuments((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, summary, keyPoints } : d))
        );
        setIsAnalyzing(false);
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: contentText.slice(0, 8000),
          targetLanguage: settings.defaultTargetLanguage || 'ne',
          customApiKey: settings.customGeminiApiKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  summary: data.summary || 'Summary generated.',
                  keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
                }
              : d
          )
        );
      }
    } catch {
      // Fallback
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = documents.filter((d) => d.id !== id);
    setDocuments(remaining);
    if (activeDocId === id) {
      setActiveDocId(remaining[0]?.id || '');
    }
    setToastMessage('Document deleted from assistant.');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const filteredDocs = documents.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-4xl w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl purple-glow-btn flex items-center justify-center text-white font-bold shadow-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <span>AI Document Assistant</span>
                <span className="text-[10px] text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/30 uppercase font-semibold">
                  RAG &amp; Reference
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                Upload text documents, extract key insights, and reference them directly in chat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Sidebar List + Document Inspector */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Sidebar: Document List & Upload Button */}
          <div className="w-full md:w-72 border-r border-white/10 p-3 sm:p-4 flex flex-col gap-3 bg-[#090a0f]/60 overflow-hidden shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.log"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="purple-glow-btn w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Document (.txt, .md, .js...)</span>
            </button>

            {/* Search Docs */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search uploaded files..."
                aria-label="Search uploaded documents"
                className="w-full bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear document search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Document Items */}
            <div className="overflow-y-auto space-y-1.5 flex-grow pr-1">
              {filteredDocs.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">
                  No documents found. Upload one above!
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const isActive = doc.id === activeDocId;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setActiveDocId(doc.id)}
                      className={`group p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-purple-900/40 border-purple-400 text-white shadow-md'
                          : 'bg-[#131520]/80 border-white/5 text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-purple-300' : 'text-gray-400'}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{doc.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {(doc.sizeBytes / 1024).toFixed(1)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {documents.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteDoc(doc.id, e)}
                          aria-label={`Delete ${doc.name}`}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-gray-500 transition-opacity cursor-pointer shrink-0"
                          title="Delete document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Inspector: Active Document Summary, Key Points & Content Preview */}
          <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto space-y-4 flex flex-col justify-between">
            {activeDoc ? (
              <div className="space-y-4">
                {/* Active Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-black text-white truncate flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{activeDoc.name}</span>
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Uploaded {new Date(activeDoc.uploadedAt).toLocaleString()} • {(activeDoc.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onAttachToChat(activeDoc.name, activeDoc.content);
                      onClose();
                    }}
                    className="purple-glow-btn text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0 shadow-lg"
                    title="Attach document content to chat input"
                  >
                    <span>Reference in Chat</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* AI Summary Card */}
                <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/35 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-200">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>AI Executive Summary</span>
                    </span>
                    {isAnalyzing && (
                      <span className="text-[10px] text-amber-300 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Analyzing...</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-200 leading-relaxed">
                    {activeDoc.summary || (isAnalyzing ? 'Analyzing document with Gemini AI...' : 'No summary generated yet.')}
                  </p>

                  {activeDoc.keyPoints && activeDoc.keyPoints.length > 0 && (
                    <div className="pt-2 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Key Points:</span>
                      <ul className="list-disc list-inside text-xs text-gray-300 space-y-0.5 pl-1">
                        {activeDoc.keyPoints.map((kp, idx) => (
                          <li key={idx} className="leading-snug">{kp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Raw Content Preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-300 font-semibold">
                    <span>Document Content Preview</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {activeDoc.content.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <div className="relative rounded-2xl overflow-hidden border border-[#232738] bg-[#090a0f]">
                    <pre className="p-3.5 text-[11px] font-mono text-gray-200 overflow-x-auto max-h-56 scrollbar-thin whitespace-pre-wrap">
                      {activeDoc.content}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-gray-500">
                Select a document from the left or upload a new one.
              </div>
            )}

            {toastMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{toastMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-[#090a0f] flex items-center justify-between text-xs text-gray-400">
          <span>{documents.length} uploaded documents in vault</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#131520] hover:bg-white/5 border border-[#232738] text-gray-200 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
