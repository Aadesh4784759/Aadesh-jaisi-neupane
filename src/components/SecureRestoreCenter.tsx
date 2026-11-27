import React, { useState } from 'react';
import {
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Lock,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { verifyBackupJsonString } from '../utils/backupExport';
import {
  RestoreMode,
  DryRunStats,
  RestoreExecutionResult,
  performDryRunPreview,
  executeSecureRestore,
} from '../utils/backupRestore';
import { getCurrentIdToken } from '../utils/firebase';
import { buildApiUrl } from '../utils/apiConfig';

interface SecureRestoreCenterProps {
  userEmail: string;
}

export const SecureRestoreCenter: React.FC<SecureRestoreCenterProps> = ({ userEmail }) => {
  const [uploadedPayload, setUploadedPayload] = useState<any | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [restoreMode, setRestoreMode] = useState<RestoreMode>('missing_only');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [dryRunRunning, setDryRunRunning] = useState(false);
  const [dryRunStats, setDryRunStats] = useState<DryRunStats | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreProgressText, setRestoreProgressText] = useState('');
  const [executionResult, setExecutionResult] = useState<RestoreExecutionResult | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileError(null);
    setUploadedPayload(null);
    setDryRunStats(null);
    setExecutionResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const verification = verifyBackupJsonString(text);
        if (!verification.valid) {
          setFileError(verification.errors.join('; '));
          return;
        }

        const parsed = JSON.parse(text);
        setUploadedPayload(parsed);
        // Default select all collections
        if (parsed?.collectionManifest) {
          setSelectedCollections(parsed.collectionManifest);
        }
      } catch (err: any) {
        setFileError(err?.message || 'Failed to parse backup JSON file.');
      }
    };
    reader.onerror = () => setFileError('Failed to read uploaded backup file.');
    reader.readAsText(file);
  };

  const handleRunDryRun = async () => {
    if (!uploadedPayload) return;
    setDryRunRunning(true);
    setFileError(null);
    try {
      const stats = await performDryRunPreview(uploadedPayload, selectedCollections, restoreMode);
      setDryRunStats(stats);
    } catch (err: any) {
      setFileError(err?.message || 'Dry-run preview failed.');
    } finally {
      setDryRunRunning(false);
    }
  };

  const handleToggleCollectionSelection = (colPath: string) => {
    setSelectedCollections((prev) =>
      prev.includes(colPath) ? prev.filter((p) => p !== colPath) : [...prev, colPath]
    );
  };

  const handleInitiateRestore = () => {
    if (confirmationInput.trim() !== 'RESTORE') {
      setFileError('You must type RESTORE in uppercase to confirm database restoration.');
      return;
    }
    setConfirmModalOpen(false);
    executeRestoreProcess();
  };

  const executeRestoreProcess = async () => {
    setRestoring(true);
    setExecutionResult(null);
    setRestoreProgressText('Verifying admin security session...');

    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) throw new Error('Authentication required.');

      const res = await fetch(buildApiUrl('/api/admin/backup'), {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.authorized) {
        throw new Error(data.error || 'Server-side admin authorization failed.');
      }

      setRestoreProgressText('Executing secure restore batches...');
      const result = await executeSecureRestore(
        uploadedPayload,
        selectedCollections,
        restoreMode,
        (txt) => setRestoreProgressText(txt)
      );

      setExecutionResult(result);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        restoredCount: 0,
        skippedCount: 0,
        failedCount: 1,
        errors: [err?.message || 'Restore execution failed.'],
      });
    } finally {
      setRestoring(false);
      setRestoreProgressText('');
      setConfirmationInput('');
    }
  };

  return (
    <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-amber-500/30 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-bold mb-1">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Secure Restore Center · Admin Only</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">Firestore Recovery &amp; Restore Studio</h3>
          <p className="text-xs text-purple-200/75">
            Safely restore verified application-owned JSON backups with dry-run previews, granular collection selection, and strict write guards.
          </p>
        </div>

        <div className="px-3 py-1.5 rounded-xl v2-neu-inset text-[11px] text-gray-300 border border-white/10 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Operator: {userEmail}</span>
        </div>
      </div>

      {fileError && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Step 1: Upload Backup File */}
      <div className="v2-neu-inset rounded-2xl p-5 border border-white/10 space-y-4">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <FileCode className="w-4 h-4 text-amber-400" />
          <span>Step 1: Upload Verified Aadesh AI Backup JSON</span>
        </h4>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <label className="flex-1 flex items-center justify-center px-4 py-3.5 rounded-xl border border-dashed border-white/20 hover:border-amber-400/60 bg-black/20 text-xs font-semibold text-gray-300 cursor-pointer transition">
            <Upload className="w-4 h-4 mr-2 text-amber-400" />
            <span>{fileName ? `Selected: ${fileName}` : 'Choose Backup JSON File...'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {uploadedPayload && (
            <div className="px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Backup verified (v{uploadedPayload.metadata?.schemaVersion} · {uploadedPayload.metadata?.totalDocuments} docs)</span>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Choose Restore Mode & Scope */}
      {uploadedPayload && (
        <div className="v2-neu-card rounded-2xl p-5 border border-purple-500/30 space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-sky-400" />
            <span>Step 2: Configure Restore Mode &amp; Scope</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setRestoreMode('missing_only')}
              className={`p-3.5 rounded-xl border text-left text-xs space-y-1 cursor-pointer transition ${
                restoreMode === 'missing_only'
                  ? 'bg-sky-500/20 border-sky-400 text-white'
                  : 'v2-neu-inset border-white/10 text-gray-300 hover:border-white/20'
              }`}
            >
              <div className="font-bold">A. Missing Only (Safe)</div>
              <div className="text-[11px] text-gray-400">Restores only documents absent from current Firestore. Never overwrites existing records.</div>
            </button>

            <button
              onClick={() => setRestoreMode('selected_collections')}
              className={`p-3.5 rounded-xl border text-left text-xs space-y-1 cursor-pointer transition ${
                restoreMode === 'selected_collections'
                  ? 'bg-sky-500/20 border-sky-400 text-white'
                  : 'v2-neu-inset border-white/10 text-gray-300 hover:border-white/20'
              }`}
            >
              <div className="font-bold">B. Selected Collections</div>
              <div className="text-[11px] text-gray-400">Choose specific collections to include in the dry-run and restore operation.</div>
            </button>

            <button
              onClick={() => setRestoreMode('full_restore')}
              className={`p-3.5 rounded-xl border text-left text-xs space-y-1 cursor-pointer transition ${
                restoreMode === 'full_restore'
                  ? 'bg-rose-950/40 border-rose-500/50 text-white'
                  : 'v2-neu-inset border-white/10 text-gray-300 hover:border-white/20'
              }`}
            >
              <div className="font-bold text-rose-300">C. Full Restore (Merge)</div>
              <div className="text-[11px] text-gray-400">Merges and updates all backup documents across collections. Requires explicit typed confirmation.</div>
            </button>
          </div>

          {restoreMode === 'selected_collections' && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs font-bold text-gray-300">Select Collections to Include:</div>
              <div className="flex flex-wrap gap-2">
                {uploadedPayload.collectionManifest.map((colPath: string) => (
                  <button
                    key={colPath}
                    onClick={() => handleToggleCollectionSelection(colPath)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border cursor-pointer transition ${
                      selectedCollections.includes(colPath)
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'v2-neu-inset border-white/10 text-gray-400'
                    }`}
                  >
                    {colPath} ({selectedCollections.includes(colPath) ? 'Included' : 'Excluded'})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleRunDryRun}
              disabled={dryRunRunning || (restoreMode === 'selected_collections' && selectedCollections.length === 0)}
              className="electric-purple-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {dryRunRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{dryRunRunning ? 'Running Dry-Run Analysis...' : 'Run Dry-Run Preview'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Dry-Run Preview Results */}
      {dryRunStats && (
        <div className="v2-neu-inset rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Step 3: Dry-Run Preview Analysis</span>
            </h4>
            <span className="text-xs text-sky-300 font-semibold tabular-nums">
              Estimated Writes: {dryRunStats.estimatedWrites}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl v2-neu-card border border-white/10 space-y-1">
              <div className="text-gray-400">Total Backup Docs</div>
              <div className="text-lg font-black text-white tabular-nums">{dryRunStats.totalBackupDocs}</div>
            </div>
            <div className="p-3 rounded-xl v2-neu-card border border-emerald-500/30 space-y-1">
              <div className="text-emerald-300">New (To Create)</div>
              <div className="text-lg font-black text-emerald-400 tabular-nums">{dryRunStats.newDocsCount}</div>
            </div>
            <div className="p-3 rounded-xl v2-neu-card border border-amber-500/30 space-y-1">
              <div className="text-amber-300">Existing (To Change)</div>
              <div className="text-lg font-black text-amber-400 tabular-nums">{dryRunStats.existingDocsCount}</div>
            </div>
            <div className="p-3 rounded-xl v2-neu-card border border-white/10 space-y-1">
              <div className="text-gray-400">Skipped</div>
              <div className="text-lg font-black text-gray-300 tabular-nums">{dryRunStats.skippedDocsCount}</div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold text-gray-300">Collection Breakdown:</div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {dryRunStats.collectionsSummary.map((col) => (
                <div
                  key={col.collectionPath}
                  className="p-2.5 rounded-xl v2-neu-card border border-white/10 text-xs flex items-center justify-between"
                >
                  <span className="font-mono text-gray-200">{col.collectionPath}</span>
                  <div className="flex items-center gap-3 text-[11px] tabular-nums">
                    <span className="text-gray-400">Backup: {col.backupCount}</span>
                    <span className="text-emerald-400">New: {col.newCount}</span>
                    <span className="text-amber-400">Change: {col.existingCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-white/15 flex items-center justify-between">
            <div className="text-xs text-amber-300">
              Ready to execute restore? No changes have been made yet.
            </div>
            <button
              onClick={() => setConfirmModalOpen(true)}
              className="electric-purple-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
            >
              Proceed to Final Confirmation
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="v2-neu-card rounded-3xl p-6 sm:p-8 max-w-md w-full border border-rose-500/50 space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h4 className="text-lg font-black text-white">Final Restore Confirmation</h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                You are about to write <span className="text-emerald-400 font-bold">{dryRunStats?.estimatedWrites || 0} documents</span> to Firestore using mode <span className="text-sky-400 font-bold uppercase">{restoreMode}</span>.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-300 block">
                Type <span className="font-mono font-bold text-rose-400">RESTORE</span> in uppercase to unlock:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="Type RESTORE here..."
                className="w-full v2-neu-inset border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl v2-neu-inset border border-white/10 text-xs font-bold text-gray-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateRestore}
                disabled={confirmationInput.trim() !== 'RESTORE'}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-50 transition"
              >
                Execute Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restoring Progress Overlay */}
      {restoring && (
        <div className="p-6 rounded-2xl v2-neu-inset border border-sky-400/40 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
          <div className="text-sm font-bold text-white">{restoreProgressText}</div>
          <div className="text-xs text-gray-400">Writing batches to Firestore safely...</div>
        </div>
      )}

      {/* Step 4: Execution Report */}
      {executionResult && (
        <div className="v2-neu-card rounded-2xl p-5 border border-emerald-500/40 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Restore Execution Report</span>
            </h4>
            <span className="text-xs text-gray-400 tabular-nums">
              Completed at {new Date(executionResult.completedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl v2-neu-inset border border-white/10 space-y-1">
              <div className="text-gray-400">Status</div>
              <div className={`text-sm font-bold ${executionResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {executionResult.success ? 'SUCCESS' : 'COMPLETED WITH ERRORS'}
              </div>
            </div>
            <div className="p-3 rounded-xl v2-neu-inset border border-emerald-500/30 space-y-1">
              <div className="text-emerald-300">Successfully Restored</div>
              <div className="text-lg font-black text-emerald-400 tabular-nums">{executionResult.restoredCount}</div>
            </div>
            <div className="p-3 rounded-xl v2-neu-inset border border-white/10 space-y-1">
              <div className="text-gray-400">Skipped</div>
              <div className="text-lg font-black text-gray-300 tabular-nums">{executionResult.skippedCount}</div>
            </div>
            <div className="p-3 rounded-xl v2-neu-inset border border-rose-500/30 space-y-1">
              <div className="text-rose-300">Failed</div>
              <div className="text-lg font-black text-rose-400 tabular-nums">{executionResult.failedCount}</div>
            </div>
          </div>

          {executionResult.errors.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-xs font-bold text-rose-300">Error Details:</div>
              <div className="max-h-32 overflow-y-auto p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 space-y-1">
                {executionResult.errors.map((err, idx) => (
                  <div key={idx} className="font-mono">{err}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
