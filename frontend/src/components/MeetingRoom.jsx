import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RoomEvent } from 'livekit-client';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  PreJoin,
} from '@livekit/components-react';
import {
  Users, Bot, Shield, MicOff, UserX, Lock, Unlock,
  PhoneOff, Crown, Volume2, VolumeX, Bell, Check, X,
  Clock, Send, WifiOff, Copy, Settings, PenTool, Clapperboard,
} from 'lucide-react';
import Logo from './Logo';
import SettingsModal from './SettingsModal';
import Whiteboard from './Whiteboard';
import CameraDirector from './CameraDirector';
import '@livekit/components-styles';

// ─── Status types ─────────────────────────────────────────────────────────────
// 'loading' | 'locked' | 'requesting' | 'waiting' | 'rejected' | 'ready' | 'error'

export default function MeetingRoom() {
  const { roomName } = useParams();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === 'true';
  const navigate = useNavigate();
  const { user, getToken } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDirector, setShowDirector] = useState(false);

  const participantName = user?.displayName || user?.email?.split('@')[0] || searchParams.get('name') || 'Guest';

  const [status, setStatus] = useState('loading'); // see types above
  const [preJoinChoices, setPreJoinChoices] = useState(null); // stores user's mic/cam choices
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [joinRequests, setJoinRequests] = useState([]); // host side notifications
  const [copied, setCopied] = useState(false);
  const hostWsRef = useRef(null);
  const waitingWsRef = useRef(null);

  // 🔒 Guard: must be logged in (ProtectedRoute handles this, but double-check)
  useEffect(() => {
    if (!user) navigate('/auth', { replace: true });
  }, [user, navigate]);

  // ── Fetch LiveKit token ──────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!participantName) return;
    const fetchToken = async () => {
      try {
        const authToken = await getToken();   // Fresh Firebase ID token
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('http://localhost:8000/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ room_name: roomName, participant_name: participantName, is_host: isHost }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.status === 423) { setStatus('locked'); return; }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || `Server error ${response.status}`);
        }
        const data = await response.json();
        if (!data.token) throw new Error('No token received');
        setToken(data.token);
        setStatus('ready');
      } catch (err) {
        setErrorMsg(err.message);
        setStatus('error');
      }
    };
    fetchToken();
  }, [roomName, participantName, isHost, getToken]);

  // ── Host WebSocket (receive join requests) ───────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isHost || status !== 'ready') return;
    const ws = new WebSocket(`ws://localhost:8000/ws/host/${roomName}`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'join_request') {
        setJoinRequests(prev => {
          if (prev.find(r => r.id === data.request_id)) return prev;
          return [...prev, { id: data.request_id, name: data.participant }];
        });
      }
    };
    hostWsRef.current = ws;
    return () => {
      ws.close();
      hostWsRef.current = null;
    };
  }, [isHost, status, roomName]);

  // ── Send join request (participant → host) ───────────────────────────────────
  const sendJoinRequest = useCallback(() => {
    setStatus('requesting');
    const ws = new WebSocket(
      `ws://localhost:8000/ws/join-request/${roomName}?name=${encodeURIComponent(participantName)}`
    );
    let pollInterval = null;

    ws.onopen = () => {
      setStatus('waiting');
      // Poll backend every 2s to check if host accepted/rejected in Firestore
      pollInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'poll' }));
        }
      }, 2000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'accepted') {
        clearInterval(pollInterval);
        setToken(data.token);
        setStatus('ready');
        ws.close();
      } else if (data.type === 'rejected') {
        clearInterval(pollInterval);
        setStatus('rejected');
        ws.close();
      }
    };
    ws.onerror = () => {
      clearInterval(pollInterval);
      setStatus('locked');
    };
    ws.onclose = () => {
      clearInterval(pollInterval);
      if (waitingWsRef.current === ws) waitingWsRef.current = null;
    };
    waitingWsRef.current = ws;
  }, [roomName, participantName]);


  const cancelRequest = useCallback(() => {
    if (waitingWsRef.current) {
      try { waitingWsRef.current.send(JSON.stringify({ type: 'cancel' })); } catch (_) {}
      waitingWsRef.current.close();
    }
    setStatus('locked');
  }, []);

  const copyRoomCode = useCallback(() => {
    navigator.clipboard.writeText(roomName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomName]);

  // ── Host: accept / reject ─────────────────────────────────────────────────────
  const acceptRequest = useCallback((requestId) => {
    if (hostWsRef.current?.readyState === WebSocket.OPEN) {
      hostWsRef.current.send(JSON.stringify({ type: 'accept', request_id: requestId }));
    }
    setJoinRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const rejectRequest = useCallback((requestId) => {
    if (hostWsRef.current?.readyState === WebSocket.OPEN) {
      hostWsRef.current.send(JSON.stringify({ type: 'reject', request_id: requestId }));
    }
    setJoinRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // ── Pre-room screens ─────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-5 max-w-md text-center p-8 bg-gray-800 rounded-2xl border border-red-500/30">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
            <WifiOff className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Failed to Join 😔</h2>
          <p className="text-red-400 text-sm font-mono bg-red-500/10 px-4 py-2 rounded-lg">{errorMsg}</p>
          <button onClick={() => navigate('/')} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center p-8 bg-gray-800 rounded-3xl border border-amber-500/20 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Room Locked 🔒</h2>
            <p className="text-gray-400 text-sm">
              The room <span className="text-indigo-300 font-medium">{roomName}</span> is currently locked by the host.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Send a join request — you can enter once the host accepts it!
            </p>
          </div>
          <button
            onClick={sendJoinRequest}
            className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Send className="w-4 h-4" /> Send Join Request
          </button>
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'requesting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">Connecting...</p>
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center p-8 bg-gray-800 rounded-3xl border border-indigo-500/20 shadow-2xl">
          {/* Animated waiting icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center">
              <Clock className="w-9 h-9 text-indigo-400" />
            </div>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping absolute" />
              <span className="w-2 h-2 rounded-full bg-amber-300" />
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Waiting for Host...</h2>
            <p className="text-gray-400 text-sm">
              You have sent a join request as <span className="text-indigo-300 font-semibold">{participantName}</span>.
            </p>
            <p className="text-gray-500 text-xs mt-2">Please wait until the host accepts it 🙏</p>
          </div>
          {/* Animated dots */}
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <button
            onClick={cancelRequest}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Cancel Request
          </button>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center p-8 bg-gray-800 rounded-3xl border border-red-500/20 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Request Rejected 😔</h2>
            <p className="text-gray-400 text-sm">The host has rejected your join request.</p>
          </div>
          <button onClick={() => navigate('/')} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">Joining Room...</p>
        </div>
      </div>
    );
  }

  // ── PRE-JOIN SCREEN ──────────────────────────────────────────────────────────
  if (status === 'ready' && !preJoinChoices) {
    return (
      <div className="h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative" data-lk-theme="default">
        <div className="absolute top-8 left-8">
          <Logo />
        </div>
        
        <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl border border-white/5 max-w-xl w-full">
          <h2 className="text-2xl font-bold text-center mb-6 text-white">Device Check</h2>
          <PreJoin
            defaults={{ audioEnabled: true, videoEnabled: true }}
            onSubmit={(values) => setPreJoinChoices(values)}
            onValidate={() => true}
          />
        </div>
      </div>
    );
  }

  // ── status === 'ready' → render room ─────────────────────────────────────────
  return (
    <div className="h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-950 to-black flex flex-col" data-lk-theme="default">
      {/* Top Bar - Glassmorphism */}
      <div className="h-auto md:h-16 py-3 md:py-0 border-b border-white/5 bg-gray-900/40 backdrop-blur-2xl flex flex-col md:flex-row items-center justify-between px-4 md:px-6 z-20 relative gap-3 shadow-xl shadow-black/20">
        <div className="flex items-center gap-3">
          <Logo size="sm" withText={false} />
          <div className="flex items-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-xl border border-gray-700/50">
            <h1 className="font-semibold text-lg text-white leading-none">{roomName}</h1>
            <button
              onClick={copyRoomCode}
              title="Copy Room Code"
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {isHost && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
              <Crown className="w-3 h-3" /> HOST
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowDirector(true)} 
            className="p-1.5 rounded-lg bg-gray-800/50 hover:bg-pink-600/50 text-pink-400 hover:text-white transition-colors border border-pink-500/30 shadow-lg"
            title="AI Camera Director"
          >
            <Clapperboard className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowWhiteboard(true)} 
            className="p-1.5 rounded-lg bg-gray-800/50 hover:bg-indigo-600/50 text-indigo-400 hover:text-white transition-colors border border-indigo-500/30 shadow-lg"
            title="Collaborative Whiteboard"
          >
            <PenTool className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowSettings(true)} 
            className="p-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700/50"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="px-3 py-1 bg-red-500/10 text-red-400 text-sm font-medium rounded-full flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Live
          </div>
          <button 
            onClick={() => setShowLeaveConfirm(true)} 
            className="px-4 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white text-sm font-medium transition-all shadow-lg hover:shadow-red-500/25"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-200">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <PhoneOff className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Leave Meeting?</h2>
            <p className="text-gray-400 text-sm mb-6">Are you sure you want to leave this meeting?</p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors border border-gray-700"
              >
                Cancel
              </button>
              <button 
                onClick={() => navigate('/')}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-lg shadow-red-500/20"
              >
                Yes, Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <LiveKitRoom
        video={preJoinChoices?.videoEnabled ?? true}
        audio={preJoinChoices?.audioEnabled ?? true}
        token={token}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL}
        onDisconnected={() => navigate('/')}
        className="flex-1 flex flex-col md:flex-row overflow-hidden relative"
      >
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showWhiteboard && <Whiteboard onClose={() => setShowWhiteboard(false)} />}
        {showDirector && <CameraDirector onClose={() => setShowDirector(false)} />}
        
        {/* 📡 Listens for host commands and executes them */}
        <RoomEventHandler onLeave={() => navigate('/')} />

        {/* Host join-request notification overlay */}
        {isHost && joinRequests.length > 0 && (
          <JoinRequestNotifications
            requests={joinRequests}
            onAccept={acceptRequest}
            onReject={rejectRequest}
          />
        )}

        {/* Main Video */}
        <div className="flex-1 relative">
          <VideoConference />
          <RoomAudioRenderer />
        </div>

        {/* Sidebar */}
        <Sidebar isHost={isHost} onEndMeeting={() => navigate('/')} roomName={roomName} joinRequestCount={joinRequests.length} />
      </LiveKitRoom>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROOM EVENT HANDLER  — Receives host commands and acts on them
   Must be rendered INSIDE <LiveKitRoom> to use hooks
───────────────────────────────────────────────────────────────────────────── */
function RoomEventHandler({ onLeave }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    if (!room || !localParticipant) return;

    const handleData = async (payload, participant) => {
      // Ignore data from yourself (host doesn't get their own commands)
      if (participant?.identity === localParticipant.identity) return;

      let msg;
      try { msg = JSON.parse(new TextDecoder().decode(payload)); }
      catch (_) { return; }

      switch (msg.type) {
        case 'mute_all':
          // Don't mute the host themselves
          try {
            await localParticipant.setMicrophoneEnabled(false);
            showToast('🔇 You have been muted by the host');
          } catch (e) { console.error('Mute failed', e); }
          break;

        case 'mute_request':
          if (msg.target === localParticipant.identity) {
            try {
              await localParticipant.setMicrophoneEnabled(false);
              showToast('🔇 You have been muted by the host');
            } catch (e) { console.error('Mute failed', e); }
          }
          break;

        case 'unmute_all':
          try {
            await localParticipant.setMicrophoneEnabled(true);
            showToast('🔊 You have been unmuted by the host');
          } catch (e) { console.error('Unmute failed', e); }
          break;

        case 'kick':
          if (msg.target === localParticipant.identity) {
            showToast('🚫 You have been removed by the host');
            setTimeout(() => { room.disconnect(); onLeave(); }, 1500);
          }
          break;

        case 'end_meeting':
          showToast('📴 Meeting ended — Redirecting...');
          setTimeout(() => { room.disconnect(); onLeave(); }, 1500);
          break;

        default:
          break;
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => room.off(RoomEvent.DataReceived, handleData);
  }, [room, localParticipant, onLeave]);

  if (!toast) return null;

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[999] animate-slide-in">
      <div className="px-5 py-3 bg-gray-900/95 border border-gray-700 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm font-medium text-white min-w-56 text-center justify-center">
        {toast}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   JOIN REQUEST NOTIFICATIONS  (Host only)
───────────────────────────────────────────────────────────────────────────── */
function JoinRequestNotifications({ requests, onAccept, onReject }) {

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {requests.map((req, i) => (
        <div
          key={req.id}
          className="pointer-events-auto flex flex-col gap-3 bg-gray-800 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl shadow-black/50 w-72 animate-slide-in"
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
              {req.name.substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wide">Join Request</span>
              </div>
              <p className="text-sm font-semibold text-white truncate">{req.name}</p>
              <p className="text-xs text-gray-400">wants to join this room</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(req.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-all"
            >
              <Check className="w-4 h-4" /> Accept
            </button>
            <button
              onClick={() => onReject(req.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-semibold transition-all"
            >
              <X className="w-4 h-4" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────────────────────── */
function Sidebar({ isHost, onEndMeeting, roomName, joinRequestCount }) {
  const participants = useParticipants();
  const tabs = isHost ? ['participants', 'host', 'ai'] : ['participants', 'ai'];
  const [tab, setTab] = useState('participants');

  const tabIcon = {
    participants: <Users className="w-4 h-4" />,
    host: <Shield className="w-4 h-4" />,
    ai: <Bot className="w-4 h-4" />,
  };
  const tabLabel = {
    participants: `People (${participants.length})`,
    host: 'Host Controls',
    ai: 'AI',
  };

  return (
    <div className="w-full md:w-80 h-[45%] md:h-full border-t md:border-t-0 md:border-l border-white/5 bg-gray-900/40 backdrop-blur-2xl flex flex-col z-10">
      <div className="flex border-b border-white/5 overflow-x-auto p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all whitespace-nowrap px-2 relative rounded-lg
              ${tab === t ? 'text-white bg-indigo-500/20 shadow-md shadow-indigo-500/10 border border-indigo-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
          >
            {tabIcon[t]} {tabLabel[t]}
            {/* Notification badge on host tab */}
            {t === 'host' && joinRequestCount > 0 && (
              <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {joinRequestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'participants' && <ParticipantsList participants={participants} isHost={isHost} />}
        {tab === 'host' && isHost && <HostControlsPanel participants={participants} onEndMeeting={onEndMeeting} roomName={roomName} />}
        {tab === 'ai' && <AIPanel />}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PARTICIPANTS LIST
───────────────────────────────────────────────────────────────────────────── */
function ParticipantsList({ participants, isHost }) {
  const room = useRoomContext();

  const muteParticipant = useCallback(async (participant) => {
    if (!isHost || participant.isLocal) return;
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'mute_request', target: participant.identity })),
        { reliable: true }
      );
    } catch (e) { console.error(e); }
  }, [room, isHost]);

  return (
    <div className="space-y-2">
      {participants.map((p) => {
        let isParticipantHost = false;
        try { if (p.metadata) isParticipantHost = JSON.parse(p.metadata).isHost; } catch (_) {}
        return (
          <div key={p.identity} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-800 border border-gray-700/60 group">
            <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
              {(p.name || p.identity).substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate flex items-center gap-1.5 flex-wrap">
                {p.name || p.identity}
                {isParticipantHost && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                    <Crown className="w-2.5 h-2.5" /> HOST
                  </span>
                )}
                {p.isLocal && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">YOU</span>
                )}
              </p>
              <p className="text-xs text-gray-500">{p.isSpeaking ? '🎙 Speaking...' : 'Silent'}</p>
            </div>
            {isHost && !p.isLocal && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => muteParticipant(p)} title="Mute"
                  className="w-7 h-7 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 flex items-center justify-center transition-colors">
                  <MicOff className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HOST CONTROLS PANEL
───────────────────────────────────────────────────────────────────────────── */
function HostControlsPanel({ participants, onEndMeeting, roomName }) {
  const room = useRoomContext();
  const { getToken } = useAuth();
  const [roomLocked, setRoomLocked] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [allMuted, setAllMuted] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const muteAll = useCallback(async () => {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'mute_all' })),
        { reliable: true }
      );
      setAllMuted(true);
      showToast('✅ All participants muted');
    } catch (_) { showToast('❌ Failed'); }
  }, [room]);

  const unmuteAll = useCallback(async () => {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'unmute_all' })),
        { reliable: true }
      );
      setAllMuted(false);
      showToast('✅ All participants unmuted');
    } catch (_) { showToast('❌ Failed'); }
  }, [room]);

  const toggleLock = useCallback(async () => {
    setLockLoading(true);
    try {
      const newLock = !roomLocked;
      const authToken = await getToken();
      const res = await fetch(`http://localhost:8000/room/${newLock ? 'lock' : 'unlock'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ room_name: roomName }),
      });
      if (!res.ok) throw new Error();
      setRoomLocked(newLock);
      showToast(newLock ? '🔒 Room locked — New joins blocked!' : '🔓 Room unlocked');
    } catch (_) {
      showToast('❌ Failed — Is backend running?');
    } finally {
      setLockLoading(false);
    }
  }, [roomLocked, roomName, getToken]);

  const endMeeting = useCallback(async () => {
    if (!window.confirm('Are you sure you want to end the meeting? All participants will be disconnected.')) return;
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'end_meeting' })),
        { reliable: true }
      );
      setTimeout(onEndMeeting, 500);
    } catch (_) { onEndMeeting(); }
  }, [room, onEndMeeting]);

  const nonHostParticipants = participants.filter(p => {
    let h = false;
    try { if (p.metadata) h = JSON.parse(p.metadata).isHost; } catch (_) {}
    return !h && !p.isLocal;
  });

  return (
    <div className="space-y-4">
      {toast && (
        <div className="px-3 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium text-center">
          {toast}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 text-center shadow-inner">
          <p className="text-2xl font-bold text-indigo-400 drop-shadow-md">{participants.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total</p>
        </div>
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 text-center shadow-inner">
          <p className="text-2xl font-bold text-green-400 drop-shadow-md">{participants.filter(p => p.isSpeaking).length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Speaking</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Audio Controls</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={muteAll}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 text-sm font-medium transition-all active:scale-95">
          <VolumeX className="w-4 h-4" /> Mute All
        </button>
        <button onClick={unmuteAll}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 text-sm font-medium transition-all active:scale-95">
          <Volume2 className="w-4 h-4" /> Unmute All
        </button>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Room Settings</p>
      <button onClick={toggleLock} disabled={lockLoading}
        className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-wait
          ${roomLocked ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-500/50 hover:text-indigo-300'}`}
      >
        <span className="flex items-center gap-2">
          {lockLoading
            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : roomLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />
          }
          {lockLoading ? 'Updating...' : roomLocked ? 'Room Locked 🔒' : 'Lock Room'}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${roomLocked ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-500'}`}>
          {roomLocked ? 'ON' : 'OFF'}
        </span>
      </button>

      {/* Remove participants */}
      {nonHostParticipants.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Remove Participant</p>
          <div className="space-y-2">
            {nonHostParticipants.map(p => (
              <div key={p.identity} className="flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold uppercase">
                    {(p.name || p.identity).substring(0, 2)}
                  </div>
                  <p className="text-sm text-gray-300 truncate max-w-[110px]">{p.name || p.identity}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Are you sure you want to remove ${p.name || p.identity}?`)) return;
                    try {
                      await room.localParticipant.publishData(
                        new TextEncoder().encode(JSON.stringify({ type: 'kick', target: p.identity })),
                        { reliable: true }
                      );
                      showToast(`✅ ${p.name || p.identity} removed`);
                    } catch (_) { showToast('❌ Failed'); }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors border border-red-500/20"
                >
                  <UserX className="w-3 h-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Danger Zone */}
      <div className="pt-2 border-t border-gray-800">
        <p className="text-xs font-semibold text-red-500/70 uppercase tracking-wider mb-2">Danger Zone</p>
        <button onClick={endMeeting}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-400 hover:text-red-300 text-sm font-semibold transition-all">
          <PhoneOff className="w-4 h-4" /> End Meeting for Everyone
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AI PANEL
───────────────────────────────────────────────────────────────────────────── */
function AIPanel() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
        <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Live Transcript</p>
        <p className="text-sm text-gray-200">Waiting for speech...</p>
      </div>
      <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
        <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">AI Summary</p>
        <p className="text-sm text-gray-500 italic">Will appear after meeting ends</p>
      </div>
    </div>
  );
}
