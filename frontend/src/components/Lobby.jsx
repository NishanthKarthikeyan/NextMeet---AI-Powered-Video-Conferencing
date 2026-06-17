import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Video, Sparkles, ArrowRight, Mic, Plus, Link2, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Lobby() {
  const [searchParams] = useSearchParams();
  const invitedRoom = searchParams.get('room') || '';

  const [activeTab, setActiveTab] = useState('join');
  const [roomName, setRoomName] = useState(invitedRoom);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Firebase user: displayName (Google/register) or email prefix
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Guest';

  useEffect(() => {
    if (invitedRoom) {
      setActiveTab('join');
      setRoomName(invitedRoom);
    }
  }, [invitedRoom]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomName.trim()) {
      navigate(`/room/${roomName.trim()}?name=${encodeURIComponent(userName)}`);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    const randomRoom =
      Math.random().toString(36).substring(2, 5) + '-' +
      Math.random().toString(36).substring(2, 6) + '-' +
      Math.random().toString(36).substring(2, 5);
    navigate(`/room/${randomRoom}?name=${encodeURIComponent(userName)}&host=true`);
  };

  const handleLogout = () => { logout(); navigate('/auth'); };

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black relative overflow-hidden">

      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* ── Top Navigation ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-gray-800/60 bg-gray-900/40 backdrop-blur-md">
        {/* Logo */}
        <Logo size="sm" />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 transition-all"
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center text-xs font-bold uppercase">
              {userName.substring(0, 2)}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-200 leading-none">{userName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl py-1.5 z-50">
              <div className="px-4 py-2.5 border-b border-gray-700/60">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Backdrop to close user menu */}
      {showUserMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
      )}

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

          {/* Left: Hero */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              <span>Next-Gen AI Conferencing</span>
            </div>

            <div>
              <p className="text-indigo-400 font-medium mb-2">
                 Welcome back, {userName.split(' ')[0]}!
              </p>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                Meet Smarter,<br className="hidden md:block" /> Not Harder.
              </h1>
            </div>

            <p className="text-lg text-gray-400 max-w-md leading-relaxed">
              Experience real-time AI-powered video conferencing with live translation, auto-framing, and automatic meeting summaries.
            </p>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1"><Video className="w-4 h-4" /> 4K Ready</div>
              <div className="flex items-center gap-1"><Mic className="w-4 h-4" /> AI Noise Canceling</div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-8 rounded-3xl shadow-2xl">

            {/* Invite Banner */}
            {invitedRoom && (
              <div className="mb-6 flex items-start gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/25 rounded-2xl">
                <Link2 className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-indigo-300">You've been invited! 🎉</p>
                  <p className="text-xs text-indigo-400/70 mt-0.5">
                    Room: <span className="font-mono font-bold text-indigo-300">{invitedRoom}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex bg-gray-900/50 p-1 rounded-xl mb-8 border border-gray-700/50">
              {['join', 'create'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all
                    ${activeTab === t ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
                  {t === 'join' ? 'Join Meeting' : 'New Meeting'}
                </button>
              ))}
            </div>

            <form onSubmit={activeTab === 'join' ? handleJoin : handleCreate} className="space-y-5">

              {/* Logged-in user info (read-only) */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/40 border border-gray-700/50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                {userName.substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{userName}</p>
                  <p className="text-xs text-gray-500">Joining as this account</p>
                </div>
                <User className="w-4 h-4 text-gray-600" />
              </div>

              {/* Room Code — join tab only */}
              {activeTab === 'join' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-400 ml-1">Room Code</label>
                  <div className="relative">
                    <input
                      type="text" required
                      value={roomName}
                      onChange={(e) => !invitedRoom && setRoomName(e.target.value)}
                      placeholder="e.g. daily-standup"
                      readOnly={!!invitedRoom}
                      className={`w-full px-4 py-3 bg-gray-900/50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white placeholder-gray-600
                        ${invitedRoom ? 'border-indigo-500/40 text-indigo-300 cursor-default bg-indigo-500/5' : 'border-gray-700'}`}
                    />
                    {invitedRoom && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400/60 font-medium">Invite</span>
                    )}
                  </div>
                </div>
              )}

              <button type="submit"
                className="w-full py-4 px-6 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-indigo-500/20">
                {activeTab === 'join'
                  ? <><span>Join Meeting</span><ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
                  : <><Plus className="w-5 h-5" /><span>Start New Meeting</span></>
                }
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
