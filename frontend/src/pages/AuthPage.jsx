import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Eye, EyeOff, UserPlus, LogIn, CheckCircle } from 'lucide-react';
import Logo from '../components/Logo';

export default function AuthPage() {
  const [tab, setTab]         = useState('login');
  const [form, setForm]       = useState({ name: '', email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();
  const from      = location.state?.from || '/';

  // Automatically redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const update = (field) => (e) => { setForm(f => ({ ...f, [field]: e.target.value })); setError(''); };

  // ── Email / Password ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (tab === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await updateProfile(user, { displayName: form.name.trim() });
        setSuccess('Account created! Signing you in...');
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setGLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(friendlyError(err.code));
      }
    } finally {
      setGLoading(false);
    }
  };

  // ── Firebase error codes → human-readable ──────────────────────────────────
  const friendlyError = (code) => {
    const map = {
      'auth/invalid-credential':       'Invalid email or password.',
      'auth/user-not-found':           'No account found with this email.',
      'auth/wrong-password':           'Incorrect password.',
      'auth/email-already-in-use':     'Email already registered. Sign in instead.',
      'auth/weak-password':            'Password must be at least 6 characters.',
      'auth/invalid-email':            'Please enter a valid email address.',
      'auth/too-many-requests':        'Too many attempts. Try again later.',
      'auth/network-request-failed':   'Network error. Check your connection.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black p-6 relative overflow-hidden">

      {/* Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

        {/* Left branding */}
        <div className="space-y-7 hidden md:block">
          <Logo size="lg" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm">
            <Sparkles className="w-4 h-4" /> Next-Gen AI Conferencing
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 leading-tight">
            Your meetings,<br />elevated. ✨
          </h1>
          <div className="space-y-3 text-sm text-gray-400">
            {['HD Video with AI auto-framing','Live noise cancellation','Host controls & waiting room','Real-time AI summaries'].map(f => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" /> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Form card */}
        <div className="bg-gray-800/60 backdrop-blur-xl border border-gray-700/50 p-8 rounded-3xl shadow-2xl">

          {/* Mobile logo */}
          <div className="mb-6 md:hidden">
            <Logo size="sm" />
          </div>

          {/* ── Google button (prominent, top) ── */}
          <button
            onClick={handleGoogle}
            disabled={gLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-800 font-semibold text-sm transition-all shadow-md mb-5"
          >
            {gLoading ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              /* Google "G" logo SVG */
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            {gLoading ? 'Signing in...' : (tab === 'login' ? 'Continue with Google' : 'Sign up with Google')}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-xs text-gray-500 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-900/60 p-1 rounded-xl mb-6 border border-gray-700/50">
            {['login','register'].map(t => (
              <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5
                  ${tab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
                {t === 'login' ? <><LogIn className="w-4 h-4" />Sign In</> : <><UserPlus className="w-4 h-4" />Sign Up</>}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-400 ml-1">Full Name</label>
                <input type="text" required value={form.name} onChange={update('name')} autoFocus={tab==='register'}
                  placeholder="e.g. Arjun Kumar"
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white placeholder-gray-600" />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-400 ml-1">Email</label>
              <input type="email" required value={form.email} onChange={update('email')} autoFocus={tab==='login'}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white placeholder-gray-600" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-400 ml-1">
                Password {tab==='register' && <span className="text-gray-600 text-xs">(min 6 chars)</span>}
              </label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} required value={form.password} onChange={update('password')}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 bg-gray-900/60 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white placeholder-gray-600" />
                <button type="button" onClick={() => setShowPwd(v=>!v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>

            {error   && <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">{error}</div>}
            {success && <div className="px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 flex-shrink-0"/>{success}</div>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Loading...</>
                : tab==='login' ? <><LogIn className="w-4 h-4"/>Sign In</> : <><UserPlus className="w-4 h-4"/>Create Account</>
              }
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-5">
            {tab==='login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={()=>{ setTab(tab==='login'?'register':'login'); setError(''); }}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              {tab==='login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
