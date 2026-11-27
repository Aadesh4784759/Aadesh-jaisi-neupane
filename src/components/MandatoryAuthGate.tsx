import React, { useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  LogOut,
  KeyRound,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  formatAuthError,
  loginWithEmail,
  logOut,
  refreshCurrentUserVerification,
  registerWithEmail,
  resendVerificationEmail,
  resetPassword,
  signInWithGoogle,
} from '../utils/firebase';
import { BrandLogo } from './BrandLogo';
import { TermsPrivacyModal } from './TermsPrivacyModal';

export type AuthGateStage = 'login' | 'signup' | 'verify-email' | 'forgot-password';

interface MandatoryAuthGateProps {
  firebaseUser: FirebaseUser | null;
  onVerifiedComplete: (user: FirebaseUser) => void;
}

export const MandatoryAuthGate: React.FC<MandatoryAuthGateProps> = ({
  firebaseUser,
  onVerifiedComplete,
}) => {
  const initialStage: AuthGateStage =
    firebaseUser && !firebaseUser.emailVerified ? 'verify-email' : 'login';

  const [stage, setStage] = useState<AuthGateStage>(initialStage);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(firebaseUser?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');

  // Sync stage cleanly if Firebase auth transitions to an unverified user
  useEffect(() => {
    if (firebaseUser && !firebaseUser.emailVerified) {
      setStage('verify-email');
      if (firebaseUser.email) {
        setEmail(firebaseUser.email);
      }
    } else if (!firebaseUser) {
      setStage((prev) => (prev === 'verify-email' ? 'login' : prev));
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const switchStage = (nextStage: AuthGateStage) => {
    setStage(nextStage);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleGoogleAuth = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const cred = await signInWithGoogle();
      if (cred.user) {
        if (cred.user.emailVerified) {
          onVerifiedComplete(cred.user);
        } else {
          setStage('verify-email');
          setInfoMessage('Google sign-in completed. Please verify your email address to proceed.');
        }
      }
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address (for example, name@example.com).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const signedInUser = await loginWithEmail(cleanEmail, password);
      if (!signedInUser.emailVerified) {
        setStage('verify-email');
        setInfoMessage(
          'Your account exists, but your email is not verified yet. Please verify your email to unlock the AI Dashboard.'
        );
        return;
      }
      onVerifiedComplete(signedInUser);
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanEmail || !password) {
      setErrorMessage('Please fill in your full name, email address, and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address (for example, name@example.com).');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter carefully.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage('Please read and agree to the Terms of Service and Privacy Policy to register.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await registerWithEmail(cleanEmail, password, cleanName);
      setResendCooldown(30);
      setStage('verify-email');
      setInfoMessage(
        `Account created! We sent a verification link to ${cleanEmail}. Verify your email first, then continue to your AI Dashboard.`
      );
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const refreshed = await refreshCurrentUserVerification();
      if (!refreshed) {
        setStage('login');
        setErrorMessage('Session expired. Please sign in again after verifying your email.');
        return;
      }
      if (refreshed.emailVerified) {
        onVerifiedComplete(refreshed);
      } else {
        setErrorMessage(
          'Email is not verified yet. Open the verification link in your inbox (or spam folder), then click Check Verification Again.'
        );
      }
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await resendVerificationEmail();
      setResendCooldown(30);
      setInfoMessage(
        `A fresh verification email has been sent to ${firebaseUser?.email || email}. Check inbox and spam.`
      );
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchOrBackToLogin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await logOut();
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
      setPassword('');
      setConfirmPassword('');
      setStage('login');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid registered email address.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await resetPassword(cleanEmail);
      setInfoMessage(
        `Password reset email sent to ${cleanEmail}. Follow the link in your inbox, then return here to sign in.`
      );
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen min-h-[100dvh] w-full bg-[#090a0f] text-gray-100 flex flex-col items-center px-4 py-8 relative"
      role="main"
      aria-label="Aadesh AI Authentication"
    >
      {/* Subtle Ambient Background Gradient */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-32 left-1/4 w-[420px] h-[420px] rounded-full bg-purple-600/15 blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 w-[420px] h-[420px] rounded-full bg-cyan-500/12 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-5 my-auto">
        {/* Official Aadesh AI Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="mx-auto flex justify-center">
            <BrandLogo size="lg" animated={true} />
          </div>
          <div>
            <div className="inline-flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">
                Aadesh <span className="text-gradient">AI</span>
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/20 border border-purple-400/40 text-purple-200">
                Live AI
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Verified account required • Private encrypted workspace &amp; history
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="glass-card rounded-3xl border border-purple-500/35 shadow-2xl p-5 sm:p-6 space-y-5">
          {/* Top Mode Tabs (only shown during Login / Sign Up) */}
          {(stage === 'login' || stage === 'signup') && (
            <div
              className="grid grid-cols-2 p-1 rounded-xl bg-[#090a0f] border border-[#232738]"
              role="tablist"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={stage === 'login'}
                onClick={() => switchStage('login')}
                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  stage === 'login'
                    ? 'bg-purple-600/40 text-white border border-purple-400/50 shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={stage === 'signup'}
                onClick={() => switchStage('signup')}
                className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  stage === 'signup'
                    ? 'bg-purple-600/40 text-white border border-purple-400/50 shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* First-Time Onboarding Flow Step Indicator */}
          {stage === 'verify-email' && (
            <div className="p-3 rounded-2xl bg-[#090a0f]/90 border border-cyan-500/35 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                Verification Flow
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <Check className="w-3 h-3" />
                  <span>Sign Up</span>
                </span>
                <span className="text-gray-600">→</span>
                <span className="inline-flex items-center gap-1 text-cyan-200 underline decoration-cyan-400/70 underline-offset-4">
                  <span>Email Verification</span>
                </span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-400">AI Dashboard</span>
              </div>
            </div>
          )}

          {/* Feedback Banners */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/45 text-xs text-rose-200 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-950/55 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
          {/* STAGE 1: LOGIN FORM */}
          {stage === 'login' && (
            <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300">Password</label>
                  <button
                    type="button"
                    onClick={() => switchStage('forgot-password')}
                    className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="purple-glow-btn w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Login to AI Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STAGE 2: SIGN UP FORM */}
          {stage === 'signup' && (
            <form onSubmit={handleSignupSubmit} noValidate className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 block">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 block">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 block">
                  Password (min. 6 characters)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 block">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              {/* Explicit Terms of Service & Privacy Policy Agreement */}
              <div className="flex items-start gap-2.5 pt-1 pb-1">
                <input
                  type="checkbox"
                  id="gate-terms-checkbox"
                  required
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[#232738] bg-[#090a0f] accent-purple-600 shrink-0 cursor-pointer"
                />
                <label
                  htmlFor="gate-terms-checkbox"
                  className="text-[11px] text-gray-300 leading-snug cursor-pointer select-none"
                >
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTermsModalTab('terms');
                      setIsTermsModalOpen(true);
                    }}
                    className="text-purple-300 hover:text-white underline font-semibold cursor-pointer"
                  >
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTermsModalTab('privacy');
                      setIsTermsModalOpen(true);
                    }}
                    className="text-purple-300 hover:text-white underline font-semibold cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                  .
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="purple-glow-btn w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Sign Up &amp; Verify Email</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STAGE 3: EMAIL VERIFICATION */}
          {stage === 'verify-email' && (
            <div className="space-y-4">
              <div className="text-center space-y-2 py-2">
                <div className="w-12 h-12 rounded-2xl bg-cyan-950/70 border border-cyan-400/40 flex items-center justify-center mx-auto text-cyan-300">
                  <Mail className="w-6 h-6" />
                </div>
                <h2 className="text-base font-extrabold text-white">Verify Your Email Address</h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="font-bold text-cyan-200 break-all">
                    {firebaseUser?.email || email}
                  </span>
                  . Click the link in your inbox, then continue to your AI Dashboard.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCheckVerification}
                  className="purple-glow-btn w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Checking Verification Status...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>I&apos;ve Verified — Continue to Dashboard</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || resendCooldown > 0}
                  onClick={handleResendVerification}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/40 text-xs font-semibold text-purple-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {resendCooldown > 0
                      ? `Resend Verification Email (${resendCooldown}s)`
                      : 'Resend Verification Email'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSwitchOrBackToLogin}
                  className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-white/5 border border-white/10 text-xs font-semibold text-gray-300 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Back to Login / Use Another Account</span>
                </button>
              </div>
            </div>
          )}

          {/* STAGE 4: FORGOT PASSWORD / RESET */}
          {stage === 'forgot-password' && (
            <form onSubmit={handleResetPasswordSubmit} noValidate className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-purple-400" />
                  <span>Reset Your Password</span>
                </h2>
                <p className="text-xs text-gray-400">
                  Enter your account email and we will send a secure password reset link via Firebase Authentication.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="purple-glow-btn w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <span>Send Password Reset Link</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => switchStage('login')}
                className="w-full py-2 text-xs font-semibold text-purple-300 hover:text-white cursor-pointer"
              >
                ← Back to Login
              </button>
            </form>
          )}
            </motion.div>
          </AnimatePresence>

          {/* Google Sign-In Divider & Button */}
          {(stage === 'login' || stage === 'signup') && (
            <>
              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-white/10" />
                <span className="px-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Or continue with
                </span>
                <div className="flex-grow border-t border-white/10" />
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGoogleAuth}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </>
          )}
        </div>

        {/* Footer Security Note */}
        <div className="text-center text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Protected by Firebase Auth &amp; Server-Verified Sessions • Created by Aadesh Jaisi</span>
        </div>
      </div>

      {/* Terms of Service & Privacy Policy Modal */}
      <TermsPrivacyModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        initialTab={termsModalTab}
        showAgreeButton={stage === 'signup'}
        onAgreeAndClose={() => setAgreedToTerms(true)}
      />
    </div>
  );
};
