import React, { useState } from 'react';
import {
  Database,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCode,
  Check,
  Upload,
  Lock,
} from 'lucide-react';
import { generateSecureAdminBackup, verifyBackupJsonString, BackupPayload } from '../utils/backupExport';
import { getCurrentIdToken } from '../utils/firebase';
import { buildApiUrl } from '../utils/apiConfig';

interface SecureBackupCenterProps {
  userEmail: string;
}

export const SecureBackupCenter: React.FC<SecureBackupCenterProps> = ({ userEmail }) => {
  const [backingUp, setBackingUp] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [lastBackupPayload, setLastBackupPayload] = useState<BackupPayload | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(
    localStorage.getItem('aadesh_last_backup_date')
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Verification state
  const [verifyingFile, setVerifyingFile] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    errors: string[];
    stats?: any;
  } | null>(null);

  const handleCreateBackup = async () => {
    setBackingUp(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setProgressText('Verifying backend admin session...');

    try {
      // 1. Verify backend authorization first
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        throw new Error('Authentication required. Please sign in as owner admin.');
      }

      const res = await fetch(buildApiUrl('/api/admin/backup'), {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.authorized) {
        throw new Error(data.error || 'Server-side admin backup authorization failed.');
      }

      // 2. Generate backup payload
      setProgressText('Discovering Firestore collections and documents...');
      const payload = await generateSecureAdminBackup(userEmail, (txt) => setProgressText(txt));

      setLastBackupPayload(payload);
      const nowIso = new Date().toISOString();
      setLastBackupDate(nowIso);
      localStorage.setItem('aadesh_last_backup_date', nowIso);
      setSuccessMessage(
        `Successfully generated secure backup containing ${payload.metadata.totalDocuments} documents across ${payload.collectionManifest.length} collections.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Backup generation failed.');
    } finally {
      setBackingUp(false);
      setProgressText('');
    }
  };

  const handleDownloadJson = () => {
    if (!lastBackupPayload) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `aadesh-ai-backup-${dateStr}.json`;
    const jsonStr = JSON.stringify(lastBackupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUploadVerification = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerifyingFile(true);
    setVerificationResult(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const res = verifyBackupJsonString(text);
        setVerificationResult(res);
      } catch (err: any) {
        setVerificationResult({
          valid: false,
          errors: [err?.message || 'Failed to parse uploaded backup file.'],
        });
      } finally {
        setVerifyingFile(false);
      }
    };

    reader.onerror = () => {
      setVerificationResult({
        valid: false,
        errors: ['Failed to read uploaded file.'],
      });
      setVerifyingFile(false);
    };

    reader.readAsText(file);
  };

  return (
    <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-emerald-500/30 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold mb-1">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Admin-Only Backup Center · v1.0</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">Firestore JSON Backup &amp; Verification</h3>
          <p className="text-xs text-purple-200/75">
            Export application-owned collections securely with automatic secret scrubbing and zero billing upgrade requirements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl v2-neu-inset text-[11px] text-gray-300 border border-white/10">
            Last Backup: <span className="text-emerald-300 font-semibold">{lastBackupDate ? new Date(lastBackupDate).toLocaleString() : 'None yet'}</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Export Card */}
        <div className="v2-neu-inset rounded-2xl p-5 border border-white/10 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-sky-400" />
              <span>Create Manual Backup</span>
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              Discovers and exports all application-owned collections (`users`, conversations, messages, memories, tasks, analytics, settings, leaderboard). All API keys and credentials are automatically scrubbed.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {backingUp && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-sky-300">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{progressText}</span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-sky-400 h-full w-full animate-pulse" />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleCreateBackup}
                disabled={backingUp}
                className="electric-purple-btn px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {backingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                <span>{backingUp ? 'Exporting...' : 'Create Manual Backup'}</span>
              </button>

              {lastBackupPayload && (
                <button
                  onClick={handleDownloadJson}
                  className="px-4 py-2.5 rounded-xl v2-neu-inset border border-emerald-500/40 text-xs font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JSON</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Verify Card */}
        <div className="v2-neu-inset rounded-2xl p-5 border border-white/10 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Verify Backup File</span>
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              Upload any previously generated `aadesh-ai-backup-*.json` file to validate its structure, schema version, collection manifest, and document integrity.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center justify-center w-full px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-emerald-400/60 bg-black/20 text-xs font-semibold text-gray-300 cursor-pointer transition">
              <Upload className="w-4 h-4 mr-2 text-emerald-400" />
              <span>{verifyingFile ? 'Validating...' : 'Select Backup JSON File...'}</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUploadVerification}
                disabled={verifyingFile}
                className="hidden"
              />
            </label>

            {verificationResult && (
              <div
                className={`p-3 rounded-xl text-xs space-y-1.5 ${
                  verificationResult.valid
                    ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/50 border border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {verificationResult.valid ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{verificationResult.valid ? 'Backup Verification Passed' : 'Backup Verification Failed'}</span>
                </div>
                {verificationResult.valid && verificationResult.stats && (
                  <div className="text-[11px] text-emerald-300/80 space-y-0.5 pt-1">
                    <div>Project: {verificationResult.stats.projectIdentifier} (v{verificationResult.stats.schemaVersion})</div>
                    <div>Exported: {new Date(verificationResult.stats.backupTimestamp).toLocaleString()}</div>
                    <div>Total Documents: {verificationResult.stats.totalDocuments} across {verificationResult.stats.manifestCount} collections</div>
                  </div>
                )}
                {!verificationResult.valid && (
                  <ul className="list-disc list-inside text-[11px] text-rose-300 pt-1 space-y-1">
                    {verificationResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Security & Secret Protection Notice */}
      <div className="p-4 rounded-2xl v2-neu-inset border border-white/10 text-xs text-purple-200/80 flex items-start gap-3">
        <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-white">Strict Secret Protection Guarantee</span>
          <p className="text-[11px] leading-relaxed">
            API keys (Gemini, Groq, OpenRouter), Firebase credentials, passwords, and tokens are automatically scrubbed and excluded from every exported JSON file. All backups are generated on-demand client-side and downloaded directly to your secure device storage.
          </p>
        </div>
      </div>
    </div>
  );
};
