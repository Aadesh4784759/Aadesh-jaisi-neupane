import { ChatMessage, ChatSession, GeotaggedMedia } from '../types';

export type ChatExportScope = 'current' | 'all';
export type ChatExportFormat = 'json' | 'md' | 'txt' | 'pdf';

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

export function formatChatHistoryAsMarkdown(options: ChatExportOptions): string {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);

  const lines: string[] = [
    '# Aadesh AI Global Hub — Chat Sessions Backup',
    '',
    `> **Account:** ${options.userName || 'Guest Explorer'}  `,
    `> **Backup Scope:** ${options.scope === 'current' ? 'Current Session' : 'All Chat Sessions'}  `,
    `> **Exported At:** ${new Date().toISOString()}  `,
    `> **Total Sessions:** ${sessions.length}  `,
    `> **Total Messages:** ${totalMessages}`,
    '',
    '---',
    '',
  ];

  sessions.forEach((session, sIdx) => {
    const safeTitle = (session.title || 'Untitled Conversation').replace(/\r?\n/g, ' ');
    lines.push(`## ${sIdx + 1}. ${safeTitle}`);
    lines.push('');
    lines.push(`- **Session ID:** \`${session.id}\``);
    lines.push(`- **Target Language:** \`${session.targetLanguage || 'ne'}\``);
    lines.push(`- **Created:** ${formatTimestamp(session.createdAt)}`);
    lines.push(`- **Last Updated:** ${formatTimestamp(session.updatedAt)}`);
    lines.push(`- **Messages:** ${session.messages.length}`);
    lines.push('');

    if (session.messages.length === 0) {
      lines.push('*No messages recorded in this session yet.*');
      lines.push('');
      lines.push('---');
      lines.push('');
      return;
    }

    session.messages.forEach((msg, mIdx) => {
      const speaker =
        msg.role === 'user'
          ? msg.senderName || options.userName || 'You'
          : msg.role === 'participant'
          ? msg.senderName || 'Participant'
          : 'Aadesh AI';

      const metaTags: string[] = [];
      if (msg.isPinned) metaTags.push('Pinned');
      if (msg.isVoiceInput) metaTags.push('Voice');
      if (msg.attachmentName) metaTags.push(`Attachment: ${msg.attachmentName}`);
      if (msg.imageUrl) metaTags.push('Image Attached');
      if (msg.location?.name) metaTags.push(`Location: ${msg.location.name}`);
      if (msg.feedback) metaTags.push(`Feedback: ${msg.feedback === 'up' ? 'Helpful' : 'Not Helpful'}`);
      if (msg.isOffline) metaTags.push('Offline');

      lines.push(`### #${mIdx + 1} ${speaker} · ${formatTimestamp(msg.timestamp)}`);
      if (metaTags.length > 0) {
        lines.push(`*${metaTags.join(' | ')}*`);
      }
      lines.push('');
      lines.push(msg.content || '*(Empty message)*');
      lines.push('');

      if (msg.translation) {
        lines.push(
          `**Translation (${msg.translationLanguage || session.targetLanguage || 'target'}):**`
        );
        lines.push('');
        lines.push(`> ${msg.translation.replace(/\n/g, '\n> ')}`);
        lines.push('');
      }

      if (msg.geotagInsights) {
        lines.push(`*Regional Context: ${msg.geotagInsights}*`);
        lines.push('');
      }
    });

    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

export function buildChatExport(options: ChatExportOptions): ChatExportResult {
  const sessions = getTargetSessions(options.scope, options.currentSession, options.allSessions);
  const messageCount = sessions.reduce((sum, s) => sum + s.messages.length, 0);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const scopeSlug =
    options.scope === 'current'
      ? `session-${sanitizeFilenameSlug(options.currentSession.title)}`
      : 'all-conversations';

  const ext = options.format === 'json' ? 'json' : options.format === 'md' ? 'md' : 'txt';
  const filename = `aadesh-ai-${scopeSlug}-${dateStamp}.${ext}`;

  const content =
    options.format === 'json'
      ? formatChatHistoryAsJson(options)
      : options.format === 'md'
      ? formatChatHistoryAsMarkdown(options)
      : formatChatHistoryAsText(options);

  const mimeType =
    options.format === 'json'
      ? 'application/json;charset=utf-8'
      : options.format === 'md'
      ? 'text/markdown;charset=utf-8'
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

export async function downloadChatHistoryFileAsync(
  options: ChatExportOptions
): Promise<ChatExportResult> {
  if (options.format === 'pdf') {
    const { downloadChatHistoryPdf } = await import('./exportPdf');
    return downloadChatHistoryPdf(options);
  }
  return downloadChatHistoryFile(options);
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

