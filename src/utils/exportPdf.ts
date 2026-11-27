import { jsPDF } from 'jspdf';
import type { ChatExportOptions, ChatExportResult } from './exportHistory';

function getTargetSessions(
  scope: ChatExportOptions['scope'],
  currentSession: ChatExportOptions['currentSession'],
  allSessions: ChatExportOptions['allSessions']
) {
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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
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

  text = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  text = text.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
  return text;
}

export function downloadChatHistoryPdf(
  options: Omit<ChatExportOptions, 'format'>
): ChatExportResult {
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
    doc.setFillColor(15, 19, 36);
    doc.rect(0, 0, pageWidth, 26, 'F');
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

  sessions.forEach((session, sIdx) => {
    ensureSpace(22);

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

      ensureSpace(16);

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
  doc.save(filename);

  return {
    filename,
    content: '',
    mimeType: 'application/pdf',
    sessionCount: sessions.length,
    messageCount: totalMessages,
    byteSize,
  };
}
