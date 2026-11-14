import { jsPDF } from 'jspdf';
import { ChatMessage, ChatSession, GeotaggedMedia } from '../types';

export type ChatExportScope = 'current' | 'all';
export type ChatExportFormat = 'json' | 'txt' | 'pdf';

export interface ChatExportOptions {
  scope: ChatExportScope;
  format: ChatExportFormat;
  currentSession: ChatSession;
  allSessions: ChatSession[];
  userName?: string;
}

export interface ChatExportResult {
  filename: string;
  content: string;
  mimeType: string;
  sessionCount: number;
  messageCount: number;
  byteSize: number;
}

function getTargetSessions(
  scope: ChatExportScope,
  currentSession: ChatSession,
  allSessions: ChatSession[]
): ChatSession[] {
  if (scope === 'current') {
    return [currentSession];
  }
  return allSessions.length > 0 ? allSessions : [currentSession];
}

function sanitizeFilenameSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'session'
  );
}

function formatTimestamp(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return 'Unknown time';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

const PDF_REACTION_LABELS: Record<string, string> = {
  '👍': '[+1]',
  '❤️': '[Heart]',
  '😂': '[Laugh]',
  '😮': '[Wow]',
  '🔥': '[Fire]',
  '👏': '[Clap]',
};

function sanitizePdfText(raw: string): string {
  if (!raw) return '';
  let text = raw
    // Convert markdown links [label](url) -> label (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Normalize common emojis/symbols that Helvetica WinAnsi drops
    .replace(/👍/g, '[+1]')
    .replace(/❤️/g, '[Heart]')
    .replace(/😂/g, '[Laugh]')
    .replace(/😮/g, '[Wow]')
    .replace(/🔥/g, '[Fire]')
    .replace(/👏/g, '[Clap]')
    .replace(/⚡/g, '*')
    .replace(/🌐/g, '[Global]')
    .replace(/📍/g, '[Location]')
    .replace(/🎙️/g, '[Voice]')
    .replace(/💾/g, '[Local]');

  // Replace unsupported surrogate-pair / non-WinAnsi symbols cleanly so jsPDF doesn't garble spacing
  text = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  text = text.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
  return text;
}

export function formatChatHistoryAsJson(options: ChatExportOptions): string {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);

  const payload = {
    platform: 'Aadesh AI Global Hub',
    creator: 'Aadesh Jaisi',
    exportedAt: new Date().toISOString(),
    exportedBy: options.userName || 'Guest Explorer',
    scope: options.scope,
    sessionCount: sessions.length,
    totalMessages,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      targetLanguage: session.targetLanguage,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messageCount: session.messages.length,
      messages: session.messages.map((msg: ChatMessage) => ({
        id: msg.id,
        role: msg.role,
        ...(msg.senderName ? { senderName: msg.senderName } : {}),
        timestamp: new Date(msg.timestamp).toISOString(),
        content: msg.content,
        ...(msg.translation ? { translation: msg.translation } : {}),
        ...(msg.translationLanguage ? { translationLanguage: msg.translationLanguage } : {}),
        ...(msg.detectedLanguage ? { detectedLanguage: msg.detectedLanguage } : {}),
        ...(msg.sentiment ? { sentiment: msg.sentiment } : {}),
        ...(msg.attachmentName ? { attachmentName: msg.attachmentName } : {}),
        ...(msg.location ? { location: msg.location } : {}),
        ...(msg.geotagInsights ? { geotagInsights: msg.geotagInsights } : {}),
        ...(msg.feedback ? { feedback: msg.feedback } : {}),
        ...(msg.reactions && Object.keys(msg.reactions).length > 0 ? { reactions: msg.reactions } : {}),
        ...(msg.isPinned ? { isPinned: true } : {}),
        ...(msg.isVoiceInput ? { isVoiceInput: true } : {}),
        ...(msg.isOffline ? { isOffline: true } : {}),
        ...(msg.imageUrl ? { hasImageAttachment: true } : {}),
      })),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

export function formatChatHistoryAsText(options: ChatExportOptions): string {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);
  const divider = '='.repeat(68);
  const subDivider = '-'.repeat(68);

  const lines: string[] = [
    divider,
    'AADESH AI GLOBAL HUB — CHAT HISTORY BACKUP',
    'Created by Aadesh Jaisi',
    divider,
    `Exported At   : ${new Date().toISOString()}`,
    `Account       : ${options.userName || 'Guest Explorer'}`,
    `Backup Scope  : ${options.scope === 'current' ? 'Current Session' : 'All Conversations'}`,
    `Sessions      : ${sessions.length}`,
    `Total Messages: ${totalMessages}`,
    '',
  ];

  sessions.forEach((session, sIdx) => {
    lines.push(divider);
    lines.push(`SESSION ${sIdx + 1}: ${session.title || 'Untitled Conversation'}`);
    lines.push(`Session ID     : ${session.id}`);
    lines.push(`Target Language: ${session.targetLanguage || 'ne'}`);
    lines.push(`Created        : ${formatTimestamp(session.createdAt)}`);
    lines.push(`Last Updated   : ${formatTimestamp(session.updatedAt)}`);
    lines.push(`Messages       : ${session.messages.length}`);
    lines.push(subDivider);

    if (session.messages.length === 0) {
      lines.push('(No messages in this conversation yet.)');
      lines.push('');
      return;
    }

    session.messages.forEach((msg, mIdx) => {
      const speaker =
        msg.role === 'user'
          ? (msg.senderName || 'USER').toUpperCase()
          : msg.role === 'participant'
          ? (msg.senderName || 'PARTICIPANT').toUpperCase()
          : 'AADESH AI';
      const tags: string[] = [];
      if (msg.isPinned) tags.push('Pinned');
      if (msg.isVoiceInput) tags.push('Voice');
      if (msg.attachmentName) tags.push(`File: ${msg.attachmentName}`);
      if (msg.imageUrl) tags.push('Image Attached');
      if (msg.location?.name) tags.push(`Location: ${msg.location.name}`);
      if (msg.detectedLanguage) tags.push(`Lang: ${msg.detectedLanguage}`);
      if (msg.feedback) tags.push(`Feedback: ${msg.feedback === 'up' ? 'Helpful' : 'Not Helpful'}`);
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        const reactionSummary = Object.entries(msg.reactions)
          .filter(([, count]) => count > 0)
          .map(([emoji, count]) => `${emoji}${count}`)
          .join(' ');
        if (reactionSummary) tags.push(`Reactions: ${reactionSummary}`);
      }
      if (msg.isOffline) tags.push('Offline');

      lines.push(
        `[${mIdx + 1}] ${speaker} • ${formatTimestamp(msg.timestamp)}${
          tags.length > 0 ? ` (${tags.join(' | ')})` : ''
        }`
      );
      lines.push(msg.content || '');

      if (msg.translation) {
        lines.push('');
        lines.push(`  [Translation (${msg.translationLanguage || session.targetLanguage || 'target'})]:`);
        lines.push(`  ${msg.translation.replace(/\n/g, '\n  ')}`);
      }

      if (msg.geotagInsights) {
        lines.push(`  [Geotag Insights]: ${msg.geotagInsights}`);
      }

      lines.push('');
    });
  });

  lines.push(divider);
  lines.push('End of Aadesh AI Global Hub Backup');
  lines.push(divider);

  return lines.join('\n');
}

function generateChatHistoryPdf(options: Omit<ChatExportOptions, 'format'>): {
  doc: jsPDF;
  filename: string;
  sessionCount: number;
  messageCount: number;
  byteSize: number;
} {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const scopeSlug =
    options.scope === 'current'
      ? `session-${sanitizeFilenameSlug(options.currentSession.title)}`
      : 'all-conversations';
  const filename = `aadesh-ai-${scopeSlug}-${dateStamp}.pdf`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 16;

  let y = 0;

  const drawTopBanner = () => {
    // Dark navy header bar
    doc.setFillColor(15, 19, 36);
    doc.rect(0, 0, pageWidth, 26, 'F');
    // Purple accent underline
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 26, pageWidth, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('Aadesh AI Global Hub', margin, 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(196, 181, 253);
    doc.text('Conversation Transcript & Local Backup', margin, 18.5);

    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Created by Aadesh Jaisi', pageWidth - margin, 11.5, { align: 'right' });
    doc.text(dateStamp, pageWidth - margin, 18.5, { align: 'right' });

    y = 35;
  };

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      y = 16;
    }
  };

  drawTopBanner();

  // Summary Metadata Card
  doc.setFillColor(245, 243, 255);
  doc.setDrawColor(196, 181, 253);
  doc.roundedRect(margin, y, contentWidth, 22, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(76, 29, 149);
  doc.text('BACKUP SUMMARY', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const scopeLabel = options.scope === 'current' ? 'Current Session' : 'All Conversations';
  doc.text(
    sanitizePdfText(`Account: ${options.userName || 'Guest Explorer'}   |   Scope: ${scopeLabel}`),
    margin + 4,
    y + 12
  );
  doc.text(
    `Sessions: ${sessions.length}   |   Messages: ${totalMessages}   |   Exported: ${formatTimestamp(Date.now())}`,
    margin + 4,
    y + 17.5
  );

  y += 29;

  // Iterate Sessions
  sessions.forEach((session, sIdx) => {
    ensureSpace(22);

    // Session Header Bar
    doc.setFillColor(30, 27, 75);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    const sessionTitle = sanitizePdfText(
      `Session ${sIdx + 1}: ${session.title || 'Untitled Conversation'}`
    );
    const truncatedTitle = sessionTitle.length > 72 ? sessionTitle.slice(0, 69) + '...' : sessionTitle;
    doc.text(truncatedTitle, margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(196, 181, 253);
    doc.text(
      sanitizePdfText(
        `Target Language: ${session.targetLanguage || 'ne'}   |   Messages: ${session.messages.length}   |   Updated: ${formatTimestamp(session.updatedAt)}`
      ),
      margin + 4,
      y + 11.2
    );

    y += 18;

    if (session.messages.length === 0) {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('(No messages recorded in this session yet.)', margin + 3, y + 4);
      y += 10;
      return;
    }

    session.messages.forEach((msg, mIdx) => {
      const isAI = msg.role === 'model';
      const isParticipant = msg.role === 'participant';
      const speakerLabel = isAI
        ? 'AADESH AI'
        : isParticipant
        ? sanitizePdfText((msg.senderName || 'PARTICIPANT').toUpperCase())
        : sanitizePdfText((msg.senderName || options.userName || 'YOU').toUpperCase());

      const tags: string[] = [];
      if (msg.isPinned) tags.push('Pinned');
      if (msg.isVoiceInput) tags.push('Voice');
      if (msg.attachmentName) tags.push(`File: ${msg.attachmentName}`);
      if (msg.imageUrl) tags.push('Image');
      if (msg.location?.name) tags.push(`Loc: ${msg.location.name}`);
      if (msg.feedback) tags.push(`Feedback: ${msg.feedback === 'up' ? 'Helpful' : 'Needs work'}`);
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        const reactStr = Object.entries(msg.reactions)
          .filter(([, count]) => count > 0)
          .map(([emoji, count]) => `${PDF_REACTION_LABELS[emoji] || emoji}x${count}`)
          .join(' ');
        if (reactStr) tags.push(reactStr);
      }

      const bodyLines = doc.splitTextToSize(
        sanitizePdfText(msg.content || '(Empty message)'),
        contentWidth - 8
      ) as string[];
      const transLines = msg.translation
        ? (doc.splitTextToSize(sanitizePdfText(msg.translation), contentWidth - 12) as string[])
        : [];
      const insightLines = msg.geotagInsights
        ? (doc.splitTextToSize(
            sanitizePdfText(`Regional Context: ${msg.geotagInsights}`),
            contentWidth - 10
          ) as string[])
        : [];

      // Ensure at least header + first few lines fit before starting a block
      ensureSpace(16);

      // Message Speaker Header
      const accentRgb: [number, number, number] = isAI
        ? [109, 40, 217]
        : isParticipant
        ? [5, 150, 105]
        : [79, 70, 229];

      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
      doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.rect(margin, y, 1.8, 6.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.text(`${mIdx + 1}. ${speakerLabel}`, margin + 4, y + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const rightMeta = sanitizePdfText(
        `${formatTimestamp(msg.timestamp)}${tags.length > 0 ? `  [${tags.join(' | ')}]` : ''}`
      );
      doc.text(rightMeta.slice(0, 74), pageWidth - margin - 2, y + 4.5, { align: 'right' });

      y += 9;

      // Render Body Lines line-by-line with page break support
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);

      bodyLines.forEach((line) => {
        ensureSpace(5);
        doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.setLineWidth(0.5);
        doc.line(margin + 0.9, y - 3, margin + 0.9, y + 1.5);
        doc.text(line, margin + 4, y);
        y += 4.6;
      });

      // Render Translation if present
      if (transLines.length > 0) {
        y += 1.5;
        ensureSpace(9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(109, 40, 217);
        doc.text(
          sanitizePdfText(
            `Translation (${msg.translationLanguage || session.targetLanguage || 'target'}):`
          ),
          margin + 5,
          y
        );
        y += 4.2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(67, 56, 202);
        transLines.forEach((tLine) => {
          ensureSpace(4.8);
          doc.setDrawColor(167, 139, 250);
          doc.setLineWidth(0.4);
          doc.line(margin + 4, y - 3, margin + 4, y + 1.3);
          doc.text(tLine, margin + 6.5, y);
          y += 4.5;
        });
      }

      // Render Geotag Insights if present
      if (insightLines.length > 0) {
        y += 1;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.2);
        doc.setTextColor(71, 85, 105);
        insightLines.forEach((iLine) => {
          ensureSpace(4.5);
          doc.text(iLine, margin + 5, y);
          y += 4.2;
        });
      }

      y += 4;
    });

    y += 4;
  });

  // Add page footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Aadesh AI Global Hub  •  Created by Aadesh Jaisi', margin, pageHeight - 6.5);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, { align: 'right' });
  }

  const byteSize = doc.output('arraybuffer').byteLength;
  return {
    doc,
    filename,
    sessionCount: sessions.length,
    messageCount: totalMessages,
    byteSize,
  };
}

export function buildChatExport(options: ChatExportOptions): ChatExportResult {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const messageCount = sessions.reduce((sum, s) => sum + s.messages.length, 0);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const scopeSlug =
    options.scope === 'current'
      ? `session-${sanitizeFilenameSlug(options.currentSession.title)}`
      : 'all-conversations';

  if (options.format === 'pdf') {
    const pdf = generateChatHistoryPdf(options);
    return {
      filename: pdf.filename,
      content: '',
      mimeType: 'application/pdf',
      sessionCount: pdf.sessionCount,
      messageCount: pdf.messageCount,
      byteSize: pdf.byteSize,
    };
  }

  const ext = options.format === 'json' ? 'json' : 'txt';
  const filename = `aadesh-ai-${scopeSlug}-${dateStamp}.${ext}`;

  const content =
    options.format === 'json'
      ? formatChatHistoryAsJson(options)
      : formatChatHistoryAsText(options);

  const mimeType =
    options.format === 'json'
      ? 'application/json;charset=utf-8'
      : 'text/plain;charset=utf-8';

  const byteSize = new Blob([content], { type: mimeType }).size;

  return {
    filename,
    content,
    mimeType,
    sessionCount: sessions.length,
    messageCount,
    byteSize,
  };
}

export function downloadChatHistoryFile(options: ChatExportOptions): ChatExportResult {
  if (options.format === 'pdf') {
    const pdf = generateChatHistoryPdf(options);
    pdf.doc.save(pdf.filename);
    return {
      filename: pdf.filename,
      content: '',
      mimeType: 'application/pdf',
      sessionCount: pdf.sessionCount,
      messageCount: pdf.messageCount,
      byteSize: pdf.byteSize,
    };
  }

  const result = buildChatExport(options);
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}

export type BulkExportFormat = 'json' | 'csv';

export interface BulkExportOptions {
  format: BulkExportFormat;
  sessions: ChatSession[];
  mediaItems: GeotaggedMedia[];
  userName?: string;
}

export interface BulkExportResult {
  filename: string;
  content: string;
  mimeType: string;
  sessionCount: number;
  messageCount: number;
  mediaCount: number;
  byteSize: number;
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatBulkExportAsJson(options: BulkExportOptions): string {
  const totalMessages = options.sessions.reduce((sum, s) => sum + s.messages.length, 0);

  const payload = {
    platform: 'Aadesh AI Global Hub',
    creator: 'Aadesh Jaisi',
    exportType: 'full_bulk_backup',
    exportedAt: new Date().toISOString(),
    exportedBy: options.userName || 'Guest Explorer',
    summary: {
      totalSessions: options.sessions.length,
      totalMessages,
      totalMediaItems: options.mediaItems.length,
    },
    chatHistory: options.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      targetLanguage: session.targetLanguage,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      messageCount: session.messages.length,
      messages: session.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        ...(msg.senderName ? { senderName: msg.senderName } : {}),
        timestamp: new Date(msg.timestamp).toISOString(),
        content: msg.content,
        ...(msg.translation ? { translation: msg.translation } : {}),
        ...(msg.translationLanguage ? { translationLanguage: msg.translationLanguage } : {}),
        ...(msg.detectedLanguage ? { detectedLanguage: msg.detectedLanguage } : {}),
        ...(msg.sentiment ? { sentiment: msg.sentiment } : {}),
        ...(msg.attachmentName ? { attachmentName: msg.attachmentName } : {}),
        ...(msg.location ? { location: msg.location } : {}),
        ...(msg.geotagInsights ? { geotagInsights: msg.geotagInsights } : {}),
        ...(msg.feedback ? { feedback: msg.feedback } : {}),
        ...(msg.reactions && Object.keys(msg.reactions).length > 0 ? { reactions: msg.reactions } : {}),
        ...(msg.isPinned ? { isPinned: true } : {}),
        ...(msg.isVoiceInput ? { isVoiceInput: true } : {}),
        ...(msg.isOffline ? { isOffline: true } : {}),
        ...(msg.imageUrl ? { hasImageAttachment: true } : {}),
      })),
    })),
    mediaMetadata: options.mediaItems.map((media) => ({
      id: media.id,
      title: media.title,
      type: media.type,
      timestamp: new Date(media.timestamp).toISOString(),
      location: media.location,
      ...(media.caption ? { caption: media.caption } : {}),
      ...(media.translatedCaptions ? { translatedCaptions: media.translatedCaptions } : {}),
      tags: media.tags || [],
      ...(media.detectedLandmark ? { detectedLandmark: media.detectedLandmark } : {}),
      ...(media.detectedText ? { detectedText: media.detectedText } : {}),
      mediaSourceType: media.mediaUrl?.startsWith('data:') ? 'embedded_data_url' : 'external_url',
      ...(media.mediaUrl && !media.mediaUrl.startsWith('data:') ? { mediaUrl: media.mediaUrl } : {}),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

export function formatBulkExportAsCsv(options: BulkExportOptions): string {
  const headers = [
    'recordType',
    'recordId',
    'sessionId',
    'sessionTitle',
    'timestamp',
    'speakerOrMediaType',
    'languageOrCountry',
    'locationOrAttachment',
    'contentOrCaption',
    'translationOrTags',
    'extraMetadata',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  options.sessions.forEach((session) => {
    if (session.messages.length === 0) {
      rows.push(
        [
          'chat_session',
          session.id,
          session.id,
          session.title,
          new Date(session.createdAt).toISOString(),
          'session',
          session.targetLanguage || 'ne',
          '',
          '(Empty conversation)',
          '',
          `updatedAt=${new Date(session.updatedAt).toISOString()}`,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      return;
    }

    session.messages.forEach((msg) => {
      const extras: string[] = [];
      if (msg.isPinned) extras.push('pinned=true');
      if (msg.isVoiceInput) extras.push('voice=true');
      if (msg.feedback) extras.push(`feedback=${msg.feedback}`);
      if (msg.sentiment) extras.push(`sentiment=${msg.sentiment}`);
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        extras.push(`reactions=${JSON.stringify(msg.reactions)}`);
      }
      if (msg.geotagInsights) extras.push(`insights=${msg.geotagInsights}`);

      const speaker =
        msg.role === 'model'
          ? 'Aadesh AI'
          : msg.senderName || (msg.role === 'participant' ? 'Participant' : 'User');

      rows.push(
        [
          'chat_message',
          msg.id,
          session.id,
          session.title,
          new Date(msg.timestamp).toISOString(),
          speaker,
          msg.detectedLanguage || session.targetLanguage || '',
          msg.location?.name || msg.attachmentName || '',
          msg.content,
          msg.translation || '',
          extras.join(' | '),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    });
  });

  options.mediaItems.forEach((media) => {
    const extras: string[] = [];
    if (media.detectedLandmark) extras.push(`landmark=${media.detectedLandmark}`);
    if (media.detectedText) extras.push(`text=${media.detectedText}`);
    if (media.location) {
      extras.push(`coords=${media.location.lat},${media.location.lng}`);
    }

    rows.push(
      [
        'media_metadata',
        media.id,
        '',
        media.title,
        new Date(media.timestamp).toISOString(),
        media.type,
        media.location?.country || '',
        media.location?.name || '',
        media.caption || '',
        (media.tags || []).join('; '),
        extras.join(' | '),
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  return '\uFEFF' + rows.join('\r\n');
}

export function downloadBulkBackupFile(options: BulkExportOptions): BulkExportResult {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const messageCount = options.sessions.reduce((sum, s) => sum + s.messages.length, 0);
  const ext = options.format === 'csv' ? 'csv' : 'json';
  const filename = `aadesh-ai-bulk-backup-${dateStamp}.${ext}`;
  const content =
    options.format === 'csv'
      ? formatBulkExportAsCsv(options)
      : formatBulkExportAsJson(options);
  const mimeType =
    options.format === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/json;charset=utf-8';

  const blob = new Blob([content], { type: mimeType });
  const byteSize = blob.size;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    filename,
    content,
    mimeType,
    sessionCount: options.sessions.length,
    messageCount,
    mediaCount: options.mediaItems.length,
    byteSize,
  };
}

