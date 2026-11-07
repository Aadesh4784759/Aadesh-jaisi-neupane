import React, { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  FileCode,
  FileSpreadsheet,
  Check,
  Copy,
  X,
  Sparkles,
  ShieldCheck,
  Calendar,
  Languages,
  Eye,
} from 'lucide-react';
import { ChatSession } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ChatSession;
}

export type ExportFormat = 'txt' | 'json' | 'md';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, session }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('txt');
  const [includeTranslations, setIncludeTranslations] = useState<boolean>(true);
  const [includeGeotags, setIncludeGeotags] = useState<boolean>(true);
  const [includeTimestamps, setIncludeTimestamps] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  const targetLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === session.targetLanguage) || SUPPORTED_LANGUAGES[0];

  // Generate formatted content based on user selections
  const generatedContent = useMemo(() => {
    const safeTitle = session.title || 'Untitled Conversation';
    const messageList = session.messages || [];

    if (selectedFormat === 'json') {
      const backupData = {
        exportVersion: '2.5',
        generator: 'Aadesh AI - AI Learning Platform (Built by Aadesh Jaisi)',
        backupType: 'Local Chat Session Backup',
        exportedAt: new Date().toISOString(),
        exportedTimestamp: Date.now(),
        session: {
          id: session.id,
          title: safeTitle,
          createdAt: session.createdAt,
          createdAtFormatted: new Date(session.createdAt).toISOString(),
          updatedAt: session.updatedAt,
          targetLanguage: {
            code: session.targetLanguage,
            name: targetLangObj.name,
          },
          totalMessages: messageList.length,
          messages: messageList.map((m, idx) => ({
            index: idx + 1,
            id: m.id,
            role: m.role,
            speaker: m.role === 'user' ? 'User' : 'Aadesh AI',
            content: m.content,
            ...(includeTimestamps && {
              timestamp: m.timestamp,
              timeFormatted: new Date(m.timestamp).toISOString(),
            }),
            ...(includeTranslations && m.translation && {
              translation: m.translation,
              detectedLanguage: m.detectedLanguage,
            }),
            ...(includeGeotags && m.location && {
              location: m.location,
            }),
            ...(m.geotagInsights && { geotagInsights: m.geotagInsights }),
            ...(m.suggestedQuestions && { suggestedQuestions: m.suggestedQuestions }),
            isVoiceInput: m.isVoiceInput || false,
            sentiment: m.sentiment || 'neutral',
          })),
        },
      };
      return JSON.stringify(backupData, null, 2);
    }

    if (selectedFormat === 'txt') {
      const divider = '='.repeat(78);
      const subDivider = '-'.repeat(78);

      let text = `${divider}\n`;
      text += `AADESH AI - AI LEARNING PLATFORM CONVERSATION BACKUP\n`;
      text += `Built by Aadesh Jaisi (आदेश जैसी)\n`;
      text += `${divider}\n`;
      text += `Session Title   : ${safeTitle}\n`;
      text += `Target Language : ${targetLangObj.name} (${session.targetLanguage})\n`;
      text += `Export Date     : ${new Date().toLocaleString()}\n`;
      text += `Total Messages  : ${messageList.length}\n`;
      text += `Platform        : Aadesh AI - AI Learning Platform\n`;
      text += `${divider}\n\n`;

      messageList.forEach((m, idx) => {
        const speaker = m.role === 'user' ? '👤 USER' : '⚡ AADESH AI';
        const timeStr = includeTimestamps
          ? `[${new Date(m.timestamp).toLocaleString()}]`
          : '';

        text += `Message #${idx + 1} ${timeStr} | ${speaker}\n`;

        if (includeGeotags && m.location) {
          text += `📍 Geotag Location: ${m.location.name} (Lat: ${m.location.lat}°, Lng: ${m.location.lng}°)\n`;
        }

        if (m.isVoiceInput) {
          text += `🎙️ Input Channel  : Hands-Free Voice\n`;
        }

        text += `\n${m.content}\n`;

        if (includeTranslations && m.translation) {
          text += `\n🌐 Real-Time Translation (${targetLangObj.name}):\n`;
          text += `   ${m.translation.replace(/\n/g, '\n   ')}\n`;
          if (m.detectedLanguage) {
            text += `   (Detected source language: ${m.detectedLanguage.toUpperCase()})\n`;
          }
        }

        if (includeGeotags && m.geotagInsights) {
          text += `\n💡 Regional Insight:\n   ${m.geotagInsights}\n`;
        }

        text += `\n${subDivider}\n\n`;
      });

      text += `${divider}\n`;
      text += `End of Conversation Backup. Aadesh AI - AI Learning Platform (Built by Aadesh Jaisi).\n`;
      text += `${divider}\n`;
      return text;
    }

    // Markdown (.md)
    let md = `# Aadesh AI - AI Learning Platform Conversation Backup\n\n`;
    md += `*Built by Aadesh Jaisi (आदेश जैसी)*\n\n`;
    md += `> **Session Title:** ${safeTitle}  \n`;
    md += `> **Target Language:** ${targetLangObj.name} (\`${session.targetLanguage}\`)  \n`;
    md += `> **Export Date:** ${new Date().toLocaleString()}  \n`;
    md += `> **Total Messages:** ${messageList.length}  \n\n`;
    md += `---\n\n`;

    messageList.forEach((m, idx) => {
      const speaker = m.role === 'user' ? '👤 User' : '⚡ Aadesh AI';
      const timeStr = includeTimestamps ? ` (${new Date(m.timestamp).toLocaleTimeString()})` : '';

      md += `### #${idx + 1} ${speaker}${timeStr}\n\n`;

      if (includeGeotags && m.location) {
        md += `> 📍 **Geotagged:** ${m.location.name}  \n\n`;
      }

      md += `${m.content}\n\n`;

      if (includeTranslations && m.translation) {
        md += `**🌐 ${targetLangObj.name} Translation:**\n\n`;
        md += `> ${m.translation.replace(/\n/g, '\n> ')}\n\n`;
      }

      if (includeGeotags && m.geotagInsights) {
        md += `*💡 Regional Insight: ${m.geotagInsights}*\n\n`;
      }

      md += `---\n\n`;
    });

    return md;
  }, [
    session,
    selectedFormat,
    includeTranslations,
    includeGeotags,
    includeTimestamps,
    targetLangObj,
  ]);

  if (!isOpen) return null;

  // File download trigger
  const handleDownload = () => {
    const extension = selectedFormat;
    const mimeTypes: Record<ExportFormat, string> = {
      txt: 'text/plain;charset=utf-8',
      json: 'application/json;charset=utf-8',
      md: 'text/markdown;charset=utf-8',
    };

    const sanitizedTitle = (session.title || 'conversation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const filename = `aadesh-ai-${sanitizedTitle}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    const blob = new Blob([generatedContent], { type: mimeTypes[selectedFormat] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-2xl w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl purple-glow-btn flex items-center justify-center text-white font-bold shadow-md">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <span>Export Conversation Backup</span>
                <span className="text-[10px] text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/30 uppercase font-semibold">
                  Local Backup
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                Save "{session.title}" locally as formatted text or JSON
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-grow">
          {/* Format Selection Cards */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
              1. Choose Export File Format
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Formatted Text */}
              <button
                type="button"
                onClick={() => setSelectedFormat('txt')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedFormat === 'txt'
                    ? 'bg-purple-900/40 border-purple-400 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-[#0f111a] border-[#232738] text-gray-400 hover:text-gray-200 hover:border-purple-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <FileText className={`w-5 h-5 ${selectedFormat === 'txt' ? 'text-purple-400' : 'text-gray-400'}`} />
                  {selectedFormat === 'txt' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-xs font-bold text-white">Formatted Text</div>
                <div className="text-[10px] text-gray-400 mt-0.5">.txt plain log</div>
              </button>

              {/* JSON Backup */}
              <button
                type="button"
                onClick={() => setSelectedFormat('json')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedFormat === 'json'
                    ? 'bg-purple-900/40 border-purple-400 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-[#0f111a] border-[#232738] text-gray-400 hover:text-gray-200 hover:border-purple-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <FileCode className={`w-5 h-5 ${selectedFormat === 'json' ? 'text-purple-400' : 'text-gray-400'}`} />
                  {selectedFormat === 'json' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-xs font-bold text-white">Structured JSON</div>
                <div className="text-[10px] text-gray-400 mt-0.5">.json full data</div>
              </button>

              {/* Markdown */}
              <button
                type="button"
                onClick={() => setSelectedFormat('md')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedFormat === 'md'
                    ? 'bg-purple-900/40 border-purple-400 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-[#0f111a] border-[#232738] text-gray-400 hover:text-gray-200 hover:border-purple-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <FileSpreadsheet className={`w-5 h-5 ${selectedFormat === 'md' ? 'text-purple-400' : 'text-gray-400'}`} />
                  {selectedFormat === 'md' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-xs font-bold text-white">Markdown Doc</div>
                <div className="text-[10px] text-gray-400 mt-0.5">.md formatted</div>
              </button>
            </div>
          </div>

          {/* Metadata Inclusion Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
              2. Backup Content Options
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#090a0f] border border-[#232738] cursor-pointer hover:border-purple-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={includeTranslations}
                  onChange={(e) => setIncludeTranslations(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                <span className="text-xs text-gray-200">Include Translations</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#090a0f] border border-[#232738] cursor-pointer hover:border-purple-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={includeGeotags}
                  onChange={(e) => setIncludeGeotags(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                <span className="text-xs text-gray-200">Include Geotags</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#090a0f] border border-[#232738] cursor-pointer hover:border-purple-500/40 transition-colors">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={(e) => setIncludeTimestamps(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                <span className="text-xs text-gray-200">Include Timestamps</span>
              </label>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span>Backup Preview ({selectedFormat.toUpperCase()})</span>
              </span>
              <span className="text-[10px] text-gray-500">
                {(generatedContent.length / 1024).toFixed(1)} KB • {session.messages.length} messages
              </span>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-[#232738] bg-[#090a0f]">
              <pre className="p-3.5 text-[11px] font-mono text-purple-200/90 overflow-x-auto max-h-44 scrollbar-thin">
                {generatedContent}
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-white/10 flex items-center justify-between gap-3 bg-[#0d0f17]/90">
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-xl bg-[#131520] hover:bg-white/5 border border-[#232738] text-xs font-semibold text-gray-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Content'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#131520] hover:bg-white/5 border border-[#232738] text-xs font-medium text-gray-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="purple-glow-btn text-white text-xs font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download .{selectedFormat.toUpperCase()} File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
