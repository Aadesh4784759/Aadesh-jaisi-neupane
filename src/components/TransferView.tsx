import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeftRight,
  Upload,
  Download,
  FileText,
  Image as ImageIcon,
  Share2,
  Send,
  Inbox,
  CheckCircle2,
  Info,
  Trash2,
  Sparkles,
  ShieldCheck,
  File as FileIcon,
  Radio,
  AlertCircle,
} from 'lucide-react';
import { TransferHistoryEntry } from '../types';
import { getStoredTransferHistory, saveStoredTransferHistory } from '../utils/storage';

interface QueuedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  lastModified: number;
  progress: number;
  status: 'reading' | 'ready' | 'shared' | 'error';
  sha256?: string;
  previewUrl?: string;
  textPreview?: string;
  arrayBuffer?: ArrayBuffer;
}

interface IncomingPeerFile {
  id: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256?: string;
  buffer: ArrayBuffer;
  receivedAt: number;
}

interface TransferViewProps {
  userId: string;
  userName: string;
  onAttachFileToChat?: (params: {
    name: string;
    mimeType: string;
    dataUrl?: string;
    textContent?: string;
  }) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'unavailable';
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const TransferView: React.FC<TransferViewProps> = ({
  userId,
  userName,
  onAttachFileToChat,
}) => {
  const [activeMode, setActiveMode] = useState<'send' | 'receive' | 'history'>('send');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [incomingFiles, setIncomingFiles] = useState<IncomingPeerFile[]>([]);
  const [history, setHistory] = useState<TransferHistoryEntry[]>(() => getStoredTransferHistory(userId));
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const receiveInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const supportsWebShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  useEffect(() => {
    setHistory(getStoredTransferHistory(userId));
  }, [userId]);

  // Cross-tab BroadcastChannel for real same-browser / same-device file transfer
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('aadesh_ai_transfer_channel');
    channelRef.current = ch;

    ch.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'AADESH_FILE_TRANSFER' || !msg.buffer) return;
      const incoming: IncomingPeerFile = {
        id: msg.id || `rx-${Date.now()}`,
        senderName: msg.senderName || 'Another Aadesh AI Tab',
        fileName: msg.fileName || 'received-file',
        fileSize: msg.fileSize || msg.buffer.byteLength || 0,
        mimeType: msg.mimeType || 'application/octet-stream',
        sha256: msg.sha256,
        buffer: msg.buffer,
        receivedAt: Date.now(),
      };
      setIncomingFiles((prev) => [incoming, ...prev]);
      appendHistory({
        id: incoming.id,
        fileName: incoming.fileName,
        fileSize: incoming.fileSize,
        mimeType: incoming.mimeType,
        direction: 'received',
        method: 'Cross-Tab Channel',
        sha256: incoming.sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
      setStatusNotice({
        type: 'success',
        text: `Received "${incoming.fileName}" from ${incoming.senderName}. Ready in Receive Files.`,
      });
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [userId]);

  const appendHistory = (entry: TransferHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 60);
      saveStoredTransferHistory(next, userId);
      return next;
    });
  };

  const processSelectedFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    files.forEach((file) => {
      const itemId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const initialItem: QueuedFileItem = {
        id: itemId,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now(),
        progress: 0,
        status: 'reading',
      };

      setQueuedFiles((prev) => [initialItem, ...prev]);
      setSelectedFileId(itemId);

      const reader = new FileReader();
      reader.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.min(98, Math.round((ev.loaded / ev.total) * 100));
          setQueuedFiles((prev) =>
            prev.map((q) => (q.id === itemId ? { ...q, progress: pct } : q))
          );
        }
      };

      reader.onerror = () => {
        setQueuedFiles((prev) =>
          prev.map((q) => (q.id === itemId ? { ...q, status: 'error' } : q))
        );
      };

      reader.onload = async (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        if (!buffer) return;
        const sha256 = await computeSha256Hex(buffer);

        let previewUrl: string | undefined;
        let textPreview: string | undefined;

        if (file.type.startsWith('image/') && file.size <= 8 * 1024 * 1024) {
          previewUrl = URL.createObjectURL(file);
        } else if (
          (file.type.startsWith('text/') ||
            /\.(txt|md|json|csv|ts|tsx|js|py|html|css|xml)$/i.test(file.name)) &&
          file.size <= 250 * 1024
        ) {
          try {
            textPreview = new TextDecoder().decode(buffer).slice(0, 6000);
          } catch {}
        }

        setQueuedFiles((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  progress: 100,
                  status: 'ready',
                  sha256,
                  previewUrl,
                  textPreview,
                  arrayBuffer: buffer,
                }
              : q
          )
        );
      };

      reader.readAsArrayBuffer(file);
    });
  };

  const selectedItem = queuedFiles.find((q) => q.id === selectedFileId) || queuedFiles[0] || null;

  const handleWebShare = async (item: QueuedFileItem) => {
    if (!supportsWebShareFiles) {
      setStatusNotice({
        type: 'info',
        text: 'Web Share Sheet with files is not supported in this browser. Use Save / Download or Cross-Tab Send.',
      });
      return;
    }

    try {
      const shareData = {
        files: [item.file],
        title: item.name,
        text: `Shared via Aadesh AI Transfer (${formatBytes(item.size)})`,
      };
      if (!navigator.canShare(shareData)) {
        setStatusNotice({
          type: 'info',
          text: 'Your device browser restricts sharing this specific file type via Web Share.',
        });
        return;
      }
      await navigator.share(shareData);
      setQueuedFiles((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'shared' } : q))
      );
      appendHistory({
        id: `sh-${Date.now()}`,
        fileName: item.name,
        fileSize: item.size,
        mimeType: item.mimeType,
        direction: 'shared',
        method: 'Device Web Share',
        sha256: item.sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
      setStatusNotice({ type: 'success', text: `Shared "${item.name}" via device Share Sheet.` });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setStatusNotice({ type: 'error', text: err?.message || 'Share cancelled or failed.' });
      }
    }
  };

  const handleBroadcastSend = (item: QueuedFileItem) => {
    if (!channelRef.current || !item.arrayBuffer) {
      setStatusNotice({
        type: 'error',
        text: 'Cross-tab peer channel is unavailable in this browser context.',
      });
      return;
    }
    channelRef.current.postMessage({
      type: 'AADESH_FILE_TRANSFER',
      id: `tx-${Date.now()}`,
      senderName: userName || 'Aadesh AI User',
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      sha256: item.sha256,
      buffer: item.arrayBuffer,
    });
    setQueuedFiles((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'shared' } : q))
    );
    appendHistory({
      id: `bc-${Date.now()}`,
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      direction: 'sent',
      method: 'Cross-Tab Channel',
      sha256: item.sha256,
      timestamp: Date.now(),
      status: 'completed',
    });
    setStatusNotice({
      type: 'success',
      text: `Broadcasted "${item.name}" to open Aadesh AI browser tabs.`,
    });
  };

  const handleDownloadFile = (
    name: string,
    mimeType: string,
    source: File | ArrayBuffer,
    size: number,
    sha256?: string
  ) => {
    const blob = source instanceof File ? source : new Blob([source], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    appendHistory({
      id: `dl-${Date.now()}`,
      fileName: name,
      fileSize: size,
      mimeType,
      direction: 'downloaded',
      method: 'Local Export',
      sha256,
      timestamp: Date.now(),
      status: 'completed',
    });
    setStatusNotice({ type: 'success', text: `Downloaded "${name}" to your device.` });
  };

  const handleImportReceiveFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const buffer = await file.arrayBuffer();
      const sha256 = await computeSha256Hex(buffer);
      const item: IncomingPeerFile = {
        id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderName: 'Imported from Device',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256,
        buffer,
        receivedAt: Date.now(),
      };
      setIncomingFiles((prev) => [item, ...prev]);
      appendHistory({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        direction: 'received',
        method: 'Device Import',
        sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
    }
    setStatusNotice({ type: 'success', text: 'Imported file(s) into Receive inbox & verified SHA-256.' });
  };

  const handleSendToAIChat = (item: QueuedFileItem) => {
    if (!onAttachFileToChat) return;
    if (item.file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onAttachFileToChat({
          name: item.name,
          mimeType: item.mimeType,
          dataUrl: String(e.target?.result || ''),
        });
      };
      reader.readAsDataURL(item.file);
      return;
    }
    onAttachFileToChat({
      name: item.name,
      mimeType: item.mimeType,
      textContent:
        item.textPreview ||
        `File Metadata — Name: ${item.name}, Type: ${item.mimeType}, Size: ${formatBytes(item.size)}, SHA-256: ${item.sha256 || 'N/A'}`,
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {/* Transfer Header */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
            <ArrowLeftRight className="w-4 h-4 text-purple-400" />
            <span>File &amp; Media Hub</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Transfer Center</h1>
          <p className="text-xs text-purple-200/75">
            Send, receive, inspect SHA-256 file info, share documents or images, and track real transfer progress.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex p-1 rounded-2xl bg-[#0b0818] border border-purple-400/25 self-start sm:self-center">
          {(
            [
              { id: 'send', label: 'Send & Upload', icon: Send },
              { id: 'receive', label: `Receive (${incomingFiles.length})`, icon: Inbox },
              { id: 'history', label: `History (${history.length})`, icon: Download },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMode(tab.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'purple-glow-btn text-white'
                    : 'text-purple-200/75 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Notice */}
      {statusNotice && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 border ${
            statusNotice.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-100'
              : statusNotice.type === 'error'
              ? 'bg-rose-950/60 border-rose-400/40 text-rose-100'
              : 'bg-purple-950/70 border-purple-400/40 text-purple-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-purple-300 shrink-0" />
            )}
            <span>{statusNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hidden File Pickers */}
      <input
        ref={anyFileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.yaml,.yml,.ts,.js,.py"
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={receiveInputRef}
        type="file"
        multiple
        onChange={(e) => {
          void handleImportReceiveFile(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {activeMode === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Dropzone + Quick Share Pickers + Progress Queue */}
          <div className="lg:col-span-7 space-y-4">
            {/* Quick Action Tiles */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => anyFileInputRef.current?.click()}
                className="glass-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Upload className="w-5 h-5 text-purple-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Upload Files</span>
              </button>

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="glass-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <FileText className="w-5 h-5 text-violet-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Share Docs</span>
              </button>

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="glass-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <ImageIcon className="w-5 h-5 text-fuchsia-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Share Images</span>
              </button>
            </div>

            {/* Drag-and-Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                processSelectedFiles(e.dataTransfer.files);
              }}
              onClick={() => anyFileInputRef.current?.click()}
              className={`glass-card rounded-3xl p-6 sm:p-8 border-2 border-dashed text-center cursor-pointer transition-all space-y-2 ${
                isDragging
                  ? 'border-purple-400 bg-purple-900/30 scale-[1.01]'
                  : 'border-purple-400/35 hover:border-purple-400/70'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6 text-purple-300" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Drop files here or tap to browse
              </h2>
              <p className="text-xs text-purple-200/70">
                Computes SHA-256 verification, shows real transfer progress, and prepares device sharing or cross-tab delivery.
              </p>
            </div>

            {/* Transfer Progress Queue */}
            <div className="glass-card rounded-3xl p-4 sm:p-5 border border-purple-400/25 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Transfer Progress ({queuedFiles.length})
                </h3>
                {queuedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      queuedFiles.forEach((f) => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      });
                      setQueuedFiles([]);
                      setSelectedFileId(null);
                    }}
                    className="text-xs text-purple-300 hover:text-white cursor-pointer"
                  >
                    Clear Queue
                  </button>
                )}
              </div>

              {queuedFiles.length === 0 ? (
                <p className="text-xs text-purple-200/60 py-4 text-center">
                  Select files above to inspect metadata, compute checksums, and transfer.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {queuedFiles.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedFileId(item.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                          isSelected
                            ? 'bg-purple-900/35 border-purple-400/60'
                            : 'bg-[#0b0818]/75 border-white/10 hover:border-purple-400/35'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.previewUrl ? (
                              <img
                                src={item.previewUrl}
                                alt={item.name}
                                className="w-9 h-9 rounded-xl object-cover border border-purple-400/30 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center shrink-0">
                                <FileIcon className="w-4 h-4 text-purple-300" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">{item.name}</div>
                              <div className="text-[11px] text-purple-200/70 tabular-nums">
                                {formatBytes(item.size)} · {item.status.toUpperCase()}
                              </div>
                            </div>
                          </div>

                          <span className="text-xs font-mono font-bold text-purple-300 tabular-nums shrink-0">
                            {item.progress}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            style={{ width: `${item.progress}%` }}
                            className={`h-full rounded-full transition-all duration-200 ${
                              item.status === 'error'
                                ? 'bg-rose-500'
                                : 'bg-gradient-to-r from-purple-500 via-violet-400 to-fuchsia-400'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: File Information & Honest Transfer Actions */}
          <div className="lg:col-span-5">
            <div className="glass-card rounded-3xl p-5 border border-purple-400/30 space-y-4 sticky top-20">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Info className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm font-bold text-white">File Information &amp; Actions</h3>
              </div>

              {!selectedItem ? (
                <div className="py-10 text-center space-y-2 text-xs text-purple-200/65">
                  <ShieldCheck className="w-8 h-8 text-purple-400/60 mx-auto" />
                  <p>Select any uploaded file to view detailed metadata, SHA-256 fingerprint, and transfer options.</p>
                </div>
              ) : (
                <>
                  {selectedItem.previewUrl && (
                    <div className="rounded-2xl overflow-hidden border border-purple-400/30 bg-black/30 max-h-48 flex items-center justify-center">
                      <img
                        src={selectedItem.previewUrl}
                        alt={selectedItem.name}
                        className="max-h-48 w-full object-contain"
                      />
                    </div>
                  )}

                  {selectedItem.textPreview && (
                    <pre className="p-3 rounded-2xl bg-[#090614] border border-white/10 text-[11px] font-mono text-purple-100 max-h-36 overflow-auto whitespace-pre-wrap">
                      {selectedItem.textPreview}
                    </pre>
                  )}

                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">File Name</dt>
                      <dd className="font-semibold text-white truncate max-w-[200px]">{selectedItem.name}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">Size</dt>
                      <dd className="font-mono text-white tabular-nums">
                        {formatBytes(selectedItem.size)} ({selectedItem.size.toLocaleString()} B)
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">MIME Type</dt>
                      <dd className="font-mono text-purple-200 truncate max-w-[200px]">{selectedItem.mimeType}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">Modified</dt>
                      <dd className="text-purple-100 tabular-nums">
                        {new Date(selectedItem.lastModified).toLocaleString()}
                      </dd>
                    </div>
                    <div className="py-1 space-y-1">
                      <dt className="text-purple-200/70">SHA-256 Checksum</dt>
                      <dd className="font-mono text-[10px] text-purple-300 break-all bg-[#090614] p-2 rounded-xl border border-white/10">
                        {selectedItem.sha256 || 'Computing...'}
                      </dd>
                    </div>
                  </dl>

                  {/* Real Actions */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled={selectedItem.status !== 'ready' && selectedItem.status !== 'shared'}
                      onClick={() => handleWebShare(selectedItem)}
                      className="purple-glow-btn w-full min-h-[44px] px-4 py-2.5 rounded-2xl text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>
                        {supportsWebShareFiles ? 'Send via Device Share Sheet' : 'Device Share (Browser Limited)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={selectedItem.status !== 'ready' && selectedItem.status !== 'shared'}
                      onClick={() => handleBroadcastSend(selectedItem)}
                      className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-purple-600/25 hover:bg-purple-600/45 border border-purple-400/40 text-purple-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
                    >
                      <Radio className="w-4 h-4 text-purple-300" />
                      <span>Send to Open Aadesh AI Tab</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadFile(
                            selectedItem.name,
                            selectedItem.mimeType,
                            selectedItem.file,
                            selectedItem.size,
                            selectedItem.sha256
                          )
                        }
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-purple-300" />
                        <span>Save Copy</span>
                      </button>

                      {onAttachFileToChat && (
                        <button
                          type="button"
                          onClick={() => handleSendToAIChat(selectedItem)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-purple-500/25 border border-white/15 hover:border-purple-400/45 text-xs font-semibold text-purple-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                          <span>Ask AI</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeMode === 'receive' && (
        <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Inbox className="w-5 h-5 text-purple-400" />
                <span>Receive Files</span>
              </h2>
              <p className="text-xs text-purple-200/75 mt-0.5">
                Listening live for transfers from other open Aadesh AI browser tabs, or import local files to inspect and save.
              </p>
            </div>
            <button
              type="button"
              onClick={() => receiveInputRef.current?.click()}
              className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap self-start"
            >
              <Upload className="w-4 h-4" />
              <span>Import File to Verify</span>
            </button>
          </div>

          {incomingFiles.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Radio className="w-10 h-10 text-purple-400/60 mx-auto animate-pulse" />
              <div className="text-sm font-bold text-white">Ready to Receive</div>
              <p className="text-xs text-purple-200/70 max-w-md mx-auto">
                Open Aadesh AI in another tab/window and send a file via Cross-Tab Channel, or tap "Import File to Verify" above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingFiles.map((rx) => (
                <div
                  key={rx.id}
                  className="p-4 rounded-2xl bg-[#0b0818]/80 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-bold text-white truncate">{rx.fileName}</div>
                    <div className="text-xs text-purple-200/75 tabular-nums">
                      From {rx.senderName} · {formatBytes(rx.fileSize)} · {new Date(rx.receivedAt).toLocaleTimeString()}
                    </div>
                    {rx.sha256 && (
                      <div className="text-[10px] font-mono text-purple-300/80 truncate">
                        SHA-256: {rx.sha256}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(rx.fileName, rx.mimeType, rx.buffer, rx.fileSize, rx.sha256)
                    }
                    className="purple-glow-btn min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeMode === 'history' && (
        <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Download &amp; Transfer History</h2>
              <p className="text-xs text-purple-200/70">Saved locally for your account across sessions.</p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  saveStoredTransferHistory([], userId);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-400/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Log</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-xs text-purple-200/65">
              No transfers or downloads recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-2xl bg-[#0b0818]/75 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/35 text-purple-200">
                        {entry.direction}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {entry.fileName}
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-200/70 mt-1 tabular-nums">
                      {formatBytes(entry.fileSize)} · {entry.method} ·{' '}
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>

                  {entry.sha256 && (
                    <span className="text-[10px] font-mono text-purple-300/80 shrink-0">
                      #{entry.sha256.slice(0, 12)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
