import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Check,
  ShieldCheck,
  LogOut,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  signInWithGoogle,
  registerWithEmail,
  loginWithEmail,
  resetPassword,
  updateUserProfile,
  logOut,
  formatAuthError,
} from '../utils/firebase';
import { OWNER_ADMIN_EMAIL } from '../utils/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onSignOut: () => void;
  initialMode?: 'signin' | 'register' | 'forgot' | 'profile';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onSignOut,
  initialMode = 'signin',
}) => {
  const [authMode, setAuthMode] = useState<'signin' | 'register' | 'forgot' | 'profile'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (initialMode === 'profile' && currentUser.isLoggedIn) {
        setDisplayName(currentUser.name);
        setPhotoURL(currentUser.avatarUrl || '');
        setAuthMode('profile');
      } else {
        setAuthMode(initialMode);
      }
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Google Sign-In via genuine Firebase Popup (no fake local bypass)
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      const fbUser = res.user;
      const userEmail = fbUser.email || '';
      const resolvedName = fbUser.displayName || userEmail.split('@')[0] || 'User';
      const cleanUsername = resolvedName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
      const createdAtMs = fbUser.metadata.creationTime
        ? new Date(fbUser.metadata.creationTime).getTime()
        : Date.now();

      const updatedUser: UserProfile = {
        ...currentUser,
        id: fbUser.uid,
        name: resolvedName,
        username: cleanUsername,
        email: userEmail,
        avatarUrl: fbUser.photoURL || '',
        provider: 'google',
        linkedProviders: Array.from(new Set([...currentUser.linkedProviders, 'google'])),
        isLoggedIn: true,
        role: userEmail.toLowerCase() === OWNER_ADMIN_EMAIL && fbUser.emailVerified ? 'admin' : 'user',
        createdAt: createdAtMs,
        lastActiveAt: Date.now(),
        streakDays: currentUser.streakDays || 1,
        xp: currentUser.xp || 200,
      };

      onUpdateUser(updatedUser);
      showToast(`Welcome, ${updatedUser.name}!`);
      setTimeout(onClose, 700);
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Email & Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const fbUser = await loginWithEmail(email, password);
      const emailUser = email.split('@')[0];
      const userEmail = fbUser.email || email;
      const createdAtMs = fbUser.metadata.creationTime
        ? new Date(fbUser.metadata.creationTime).getTime()
        : Date.now();

      const updatedUser: UserProfile = {
        ...currentUser,
        id: fbUser.uid,
        name: fbUser.displayName || emailUser,
        username: emailUser.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
        email: userEmail,
        avatarUrl: fbUser.photoURL || '',
        provider: 'email',
        linkedProviders: Array.from(new Set([...currentUser.linkedProviders, 'email'])),
        isLoggedIn: true,
        role: userEmail.toLowerCase() === OWNER_ADMIN_EMAIL && fbUser.emailVerified ? 'admin' : 'user',
        createdAt: createdAtMs,
        lastActiveAt: Date.now(),
        streakDays: currentUser.streakDays || 1,
        xp: currentUser.xp || 150,
      };
      onUpdateUser(updatedUser);
      showToast(`Welcome back, ${updatedUser.name}!`);
      setTimeout(onClose, 700);
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Email & Password Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const cleanName = displayName.trim() || email.split('@')[0];
      const fbUser = await registerWithEmail(email, password, cleanName);
      const cleanUser = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const updatedUser: UserProfile = {
        ...currentUser,
        id: fbUser.uid,
        name: cleanName,
        username: cleanUser || 'new_user',
        email: fbUser.email || email,
        avatarUrl: fbUser.photoURL || '',
        provider: 'email',
        linkedProviders: Array.from(new Set([...currentUser.linkedProviders, 'email'])),
        isLoggedIn: true,
        role: 'user',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        streakDays: 1,
        xp: 150,
      };
      onUpdateUser(updatedUser);
      showToast(`Account created! Welcome, ${cleanName}.`);
      setTimeout(onClose, 700);
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Password Reset
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please enter your email to receive a password reset link.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await resetPassword(email);
      showToast(`Password reset link sent to ${email}`);
      setAuthMode('signin');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Update Profile
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await updateUserProfile({
        displayName: displayName.trim() || currentUser.name,
        photoURL: photoURL.trim() || currentUser.avatarUrl,
      });
      const updatedUser: UserProfile = {
        ...currentUser,
        name: displayName.trim() || currentUser.name,
        avatarUrl: photoURL.trim() || currentUser.avatarUrl,
        lastActiveAt: Date.now(),
      };
      onUpdateUser(updatedUser);
      showToast('Profile updated successfully!');
      setTimeout(onClose, 700);
    } catch (err: any) {
      setErrorMessage(formatAuthError(err?.code || err?.message || 'Unable to update profile.'));
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Sign Out
  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await logOut();
    } catch {
      // ignore
    } finally {
      onSignOut();
      showToast('Signed out cleanly.');
      setIsLoading(false);
      setTimeout(onClose, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-md w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {authMode === 'profile'
                  ? 'Edit Your Profile'
                  : authMode === 'register'
                  ? 'Create Your Account'
                  : authMode === 'forgot'
                  ? 'Reset Password'
                  : 'Sign In to Aadesh AI'}
              </h3>
              <p className="text-[11px] text-purple-300/80">
                Aadesh AI Global Hub · Created by Aadesh Jaisi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {currentUser.isLoggedIn ? (
            <div className="p-3.5 rounded-2xl bg-[#090a0f] border border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-purple-500 to-indigo-500 shrink-0">
                  {currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-purple-900 flex items-center justify-center text-white font-bold text-sm">
                      {(currentUser.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white truncate max-w-[140px]">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-semibold capitalize">
                      {currentUser.provider}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 block truncate max-w-[180px]">
                    {currentUser.email || 'Authenticated User'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setDisplayName(currentUser.name);
                    setPhotoURL(currentUser.avatarUrl || '');
                    setAuthMode('profile');
                  }}
                  className="text-xs text-purple-300 hover:text-white bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isLoading}
                  className="text-xs text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-purple-400" />
              <span>Sign in to sync your personal conversations, voice history, and profile securely.</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="font-semibold flex-1">{errorMessage}</p>
            </div>
          )}

          {authMode === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="space-y-3 p-4 rounded-2xl bg-[#090a0f] border border-[#232738]">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[#131520] border border-[#232738] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">Profile Photo URL</label>
                <input
                  type="url"
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full bg-[#131520] border border-[#232738] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[#131520] text-gray-400 hover:text-white border border-[#232738] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 purple-glow-btn py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}

          {authMode !== 'profile' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-white text-gray-900 hover:bg-gray-100 flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-md disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-[1px] bg-white/10" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Or with Email</span>
                <div className="flex-1 h-[1px] bg-white/10" />
              </div>

              <form
                onSubmit={
                  authMode === 'signin'
                    ? handleEmailLogin
                    : authMode === 'register'
                    ? handleEmailRegister
                    : handleForgotPassword
                }
                className="space-y-3 p-4 rounded-2xl bg-[#090a0f] border border-[#232738]"
              >
                {authMode === 'register' && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-400">Your Full Name</label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your Name"
                        className="w-full bg-[#131520] border border-[#232738] rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400">Email Address</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-[#131520] border border-[#232738] rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {authMode !== 'forgot' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-gray-400">Password</label>
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMessage(null);
                            setAuthMode('forgot');
                          }}
                          className="text-[10px] text-purple-400 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#131520] border border-[#232738] rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="purple-glow-btn w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-60"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {authMode === 'signin'
                      ? 'Sign In with Email'
                      : authMode === 'register'
                      ? 'Create Account'
                      : 'Send Password Reset Link'}
                  </span>
                </button>

                <div className="text-center pt-2 space-y-1">
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setAuthMode('register');
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      Don't have an account? <span className="font-semibold underline">Register</span>
                    </button>
                  )}
                  {authMode === 'register' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setAuthMode('signin');
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      Already have an account? <span className="font-semibold underline">Sign In</span>
                    </button>
                  )}
                  {authMode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setAuthMode('signin');
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      Remember your password? <span className="font-semibold underline">Back to Sign In</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10 bg-[#090a0f]/90 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-gray-200">Aadesh AI Global Hub</span>
          </div>
          <span className="text-purple-300 font-medium">Created by Aadesh Jaisi</span>
        </div>

        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 glass-card px-4 py-2 rounded-2xl border border-purple-400 text-white text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
