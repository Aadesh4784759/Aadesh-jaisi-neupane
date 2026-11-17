import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, X, Check, Eye, ExternalLink } from 'lucide-react';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'privacy';
  onAgreeAndClose?: () => void;
  showAgreeButton?: boolean;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms',
  onAgreeAndClose,
  showAgreeButton = false,
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aadesh AI Terms of Service and Privacy Policy"
    >
      <div
        className="glass-card rounded-3xl max-w-2xl w-full border border-purple-500/40 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden bg-[#0d091e]/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white truncate">
                Aadesh AI Legal &amp; Compliance Hub
              </h3>
              <p className="text-[11px] text-purple-300/80">
                Created by Aadesh Jaisi • Last Updated: November 2026
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-5 pt-3 pb-1 border-b border-white/10 bg-[#090614]/80 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`min-h-[38px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'purple-glow-btn text-white'
                : 'text-purple-200/70 hover:text-white bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`min-h-[38px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'purple-glow-btn text-white'
                : 'text-purple-200/70 hover:text-white bg-white/5'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-purple-100/90 leading-relaxed font-normal">
          {activeTab === 'terms' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/30">
                <h4 className="font-bold text-white text-sm mb-1">Welcome to Aadesh AI</h4>
                <p className="text-purple-200/80">
                  By registering, accessing, or utilizing Aadesh AI, you agree to comply with and be bound by these Terms of Service. Please read them thoroughly.
                </p>
              </div>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300">
                  1. Acceptance of Terms &amp; Eligibility
                </h5>
                <p>
                  Aadesh AI is a global, multilingual multimodal AI platform designed for productivity, research, coding, language translation, document intelligence, and cross-device collaboration. You must be at least 13 years of age (or the minimum legal age required in your jurisdiction) to create an account. By registering, you confirm that your account information is accurate and that you will maintain the security of your credentials.
                </p>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300">
                  2. Google Gemini AI Engine &amp; Service Expectations
                </h5>
                <p>
                  Aadesh AI integrates state-of-the-art Google Gemini models for live reasoning, vision, and natural language understanding. While our models provide high accuracy, AI outputs should be evaluated for critical legal, medical, or financial matters. You agree not to use Aadesh AI for:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-purple-200/80">
                  <li>Generating unlawful, harassing, defamatory, or harmful content.</li>
                  <li>Circumventing security or attempting unauthorized access to server infrastructure.</li>
                  <li>Automated scraping or denial-of-service attempts against our API gateway.</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300">
                  3. User Ownership &amp; Intellectual Property
                </h5>
                <p>
                  You retain full ownership of all prompts, documents, images, and files you upload to Aadesh AI. Aadesh AI does not claim ownership over your generated content. We grant you a worldwide, non-exclusive license to utilize and commercialize outputs produced through your authenticated account.
                </p>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300">
                  4. Smart On-Demand Permissions Policy
                </h5>
                <p>
                  Aadesh AI strictly adheres to an explicit on-demand permission model:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-purple-200/80">
                  <li><strong className="text-white">Microphone:</strong> Requested only when you explicitly tap the Voice Assistant or voice input button. Never recorded in the background.</li>
                  <li><strong className="text-white">Camera:</strong> Requested only when opening the Camera Scanner or Photo capture interface.</li>
                  <li><strong className="text-white">Location / GPS:</strong> Requested only when you explicitly click "Allow &amp; Detect Location" in the Location Sharing map tool. Automatic region detection is based on regional headers without GPS tracking.</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300">
                  5. Account Termination &amp; Right to Erasure
                </h5>
                <p>
                  You may export your conversation archives or delete your account at any time directly through Settings. Upon deletion, your Firestore records, chat histories, and profile metadata are permanently purged.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30">
                <h4 className="font-bold text-white text-sm mb-1">Privacy Commitment</h4>
                <p className="text-cyan-200/80">
                  We believe your private thoughts, files, and queries belong solely to you. Aadesh AI never sells user data to advertisers or third-party brokers.
                </p>
              </div>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-cyan-300">
                  1. Information We Collect
                </h5>
                <p>When you register and use Aadesh AI, we collect:</p>
                <ul className="list-disc pl-5 space-y-1 text-purple-200/80">
                  <li><strong className="text-white">Authentication Data:</strong> User ID (UID), Email address, display name, and Google profile photo URL (`photoURL`) when signing in with Google.</li>
                  <li><strong className="text-white">Conversations &amp; Memory:</strong> Your chat messages, media attachments, and optional AI memory items stored securely in your private Firebase Firestore collection.</li>
                  <li><strong className="text-white">Preferences:</strong> Selected theme (Dark Galaxy, Pure Light, Ocean Blue, etc.), default language, voice speed, and country flag.</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-cyan-300">
                  2. Google Sign-In &amp; Profile Photo Integration
                </h5>
                <p>
                  When signing in via Google, we request standard public profile scopes (email, name, picture). Your real Google avatar is automatically displayed in the application header and profile without asking you to re-upload photos manually. We never access your Google Drive or external files without explicit OAuth authorization.
                </p>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-cyan-300">
                  3. Storage &amp; Encryption
                </h5>
                <p>
                  All network communication between your browser and Aadesh AI servers is encrypted using modern TLS/HTTPS. Database records are protected by strict Firebase Security Rules that ensure only you can read or write your personal conversations.
                </p>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-cyan-300">
                  4. Cookies &amp; Local Storage
                </h5>
                <p>
                  We use secure browser LocalStorage and SessionStorage solely for offline caching, theme persistence, and active session tokens. We do not use third-party tracking cookies or ad network pixels.
                </p>
              </section>

              <section className="space-y-1.5">
                <h5 className="font-bold text-white text-xs uppercase tracking-wide text-cyan-300">
                  5. Contact &amp; Data Inquiries
                </h5>
                <p>
                  If you have questions about our terms, privacy practices, or wish to request immediate data deletion, reach out to our team at <a href="mailto:aadeshjaisi6@gmail.com" className="text-cyan-300 underline font-semibold">aadeshjaisi6@gmail.com</a>.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-[#090614]/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-purple-300/70 text-center sm:text-left">
            By using Aadesh AI, you consent to encrypted storage and Google Gemini processing.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-gray-200 cursor-pointer"
            >
              Close
            </button>
            {showAgreeButton && (
              <button
                type="button"
                onClick={() => {
                  onAgreeAndClose?.();
                  onClose();
                }}
                className="flex-1 sm:flex-none purple-glow-btn min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>I Agree to Terms &amp; Privacy</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
