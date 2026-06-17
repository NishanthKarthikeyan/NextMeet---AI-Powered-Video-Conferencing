import React, { useState, useEffect, useRef } from 'react';
import { X, Clapperboard, Camera, Activity, Smartphone, QrCode } from 'lucide-react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { useMediaDeviceSelect, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { QRCodeSVG } from 'qrcode.react';

export default function CameraDirector({ onClose }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind: 'videoinput' });
  const { localParticipant } = useLocalParticipant();
  
  const [camA, setCamA] = useState('');
  const [camB, setCamB] = useState('');
  
  const [isDirectorEnabled, setIsDirectorEnabled] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [statusText, setStatusText] = useState('Initializing AI...');

  const videoRefA = useRef(null);
  const videoRefB = useRef(null);
  const detectorRef = useRef(null);
  const animationRef = useRef(null);
  
  const streamA = useRef(null);
  const streamB = useRef(null); // Mobile stream will be set here
  
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [mobileConnected, setMobileConnected] = useState(false);
  const wsRef = useRef(null);
  const peerRef = useRef(null);

  const winningCameraRef = useRef(activeDeviceId);
  const winnerConsecutiveFrames = useRef(0);

  // Initialize MediaPipe
  useEffect(() => {
    let isMounted = true;
    const initAI = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });
        if (isMounted) {
          detectorRef.current = detector;
          setStatusText('AI Ready. Select cameras and enable Director.');
        }
      } catch (err) {
        if (isMounted) setStatusText('Failed to load AI model.');
        console.error(err);
      }
    };
    initAI();
    return () => { isMounted = false; };
  }, []);

  // Handle Streams
  useEffect(() => {
    const loadStream = async (deviceId, videoRef, streamRef) => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (!deviceId) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error loading stream:", err);
      }
    };

    if (isDirectorEnabled) {
      loadStream(camA, videoRefA, streamA);
      // Only load local stream for B if mobile is not connected
      if (!mobileConnected) {
        loadStream(camB, videoRefB, streamB);
      }
    } else {
      if (streamA.current) { streamA.current.getTracks().forEach(t => t.stop()); streamA.current = null; }
      if (!mobileConnected && streamB.current) { streamB.current.getTracks().forEach(t => t.stop()); streamB.current = null; }
    }

    return () => {
      if (streamA.current) streamA.current.getTracks().forEach(t => t.stop());
      if (!mobileConnected && streamB.current) streamB.current.getTracks().forEach(t => t.stop());
    };
  }, [camA, camB, isDirectorEnabled, mobileConnected]);

  // Mobile WebRTC Connection Logic
  const connectMobile = async () => {
    try {
      setShowQR(true);
      const res = await fetch('/local-ip');
      const data = await res.json();
      const ip = data.ip;
      const sessionId = Math.random().toString(36).substring(2, 10);
      
      const url = `http://${ip}:5173/companion/${sessionId}`;
      setQrUrl(url);
      setStatusText('Waiting for mobile to scan QR...');

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/companion/${sessionId}`);
      wsRef.current = ws;

      let iceCandidateQueue = [];

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'answer') {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
          
          iceCandidateQueue.forEach(c => peerRef.current.addIceCandidate(c).catch(console.error));
          iceCandidateQueue = [];

          setShowQR(false);
          setMobileConnected(true);
          setCamB('MOBILE_WEBRTC');
          setStatusText('Mobile Camera Connected via WebRTC! ✨');
        } else if (msg.type === 'candidate') {
          const rtcCandidate = new RTCIceCandidate(msg.candidate);
          if (peerRef.current && peerRef.current.remoteDescription) {
            await peerRef.current.addIceCandidate(rtcCandidate).catch(console.error);
          } else {
            iceCandidateQueue.push(rtcCandidate);
          }
        }
      };

      // Desktop creates the WebRTC Peer and Offer
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ type: 'candidate', candidate: e.candidate }));
      };

      pc.ontrack = (e) => {
        // Feed mobile WebRTC stream to Camera B
        streamB.current = e.streams[0];
        if (videoRefB.current) {
          videoRefB.current.srcObject = e.streams[0];
          videoRefB.current.play().catch(console.error);
        }
      };

      // We only want to RECEIVE video, not send
      pc.addTransceiver('video', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // We must wait for the mobile to actually connect to the WS before sending the offer
      // A simple polling or wait mechanism is needed. Here we send it every second until answered.
      const offerInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && !mobileConnected) {
          ws.send(JSON.stringify({ type: 'offer', offer }));
        }
      }, 1000);
      
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') clearInterval(offerInterval);
        if (pc.connectionState === 'disconnected') setMobileConnected(false);
      };

    } catch (err) {
      console.error(err);
      setStatusText('Failed to start Mobile Companion');
    }
  };

  // Cleanup WebRTC
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (peerRef.current) peerRef.current.close();
    };
  }, []);

  // Scoring Logic Loop
  useEffect(() => {
    if (!isDirectorEnabled || !detectorRef.current) return;

    const analyzeFrame = async () => {
      if (!videoRefA.current || !videoRefB.current) return;
      
      const now = performance.now();
      let sA = 0;
      let sB = 0;

      // Analyze A
      if (videoRefA.current.readyState >= 2) {
        const resA = await detectorRef.current.detectForVideo(videoRefA.current, now);
        if (resA.detections.length > 0) {
          const box = resA.detections[0].boundingBox;
          // Score = width * height (area)
          sA = Math.round(box.width * box.height);
        }
      }

      // Analyze B
      if (videoRefB.current.readyState >= 2) {
        const resB = await detectorRef.current.detectForVideo(videoRefB.current, now);
        if (resB.detections.length > 0) {
          const box = resB.detections[0].boundingBox;
          sB = Math.round(box.width * box.height);
        }
      }

      setScoreA(sA);
      setScoreB(sB);

      // Decision Logic
      let currentWinner = null;
      // 10% threshold to switch to prevent jitter
      if (sA > sB * 1.1) currentWinner = camA;
      else if (sB > sA * 1.1) currentWinner = camB;

      if (currentWinner && currentWinner !== winningCameraRef.current) {
        winnerConsecutiveFrames.current += 1;
        // Require approx 1.5 seconds of consistent superiority (at ~30fps = 45 frames)
        if (winnerConsecutiveFrames.current > 45) {
          winningCameraRef.current = currentWinner;
          
          if (currentWinner === 'MOBILE_WEBRTC' && streamB.current) {
            const mobileTrack = streamB.current.getVideoTracks()[0];
            const publications = Array.from(localParticipant.videoTrackPublications.values());
            publications.forEach(p => {
              if (p.source === Track.Source.Camera && p.track) {
                localParticipant.unpublishTrack(p.track);
              }
            });
            localParticipant.publishTrack(mobileTrack, { source: Track.Source.Camera });
          } else {
            // Unpublish remote mobile track if we are switching back to local device
            const publications = Array.from(localParticipant.videoTrackPublications.values());
            publications.forEach(p => {
              if (p.source === Track.Source.Camera && p.track && !p.track.getDeviceId?.()) {
                 localParticipant.unpublishTrack(p.track);
              }
            });
            setActiveMediaDevice(currentWinner);
          }
          
          setStatusText(`Switched to Camera ${currentWinner === camA ? 'A' : 'B'}`);
          winnerConsecutiveFrames.current = 0;
        }
      } else {
        winnerConsecutiveFrames.current = 0;
      }

      animationRef.current = requestAnimationFrame(analyzeFrame);
    };

    animationRef.current = requestAnimationFrame(analyzeFrame);
    setStatusText('AI Analyzing framing in real-time...');

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isDirectorEnabled, camA, camB, setActiveMediaDevice]);


  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-indigo-500/20 bg-indigo-900/20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-indigo-400" />
            AI Camera Director
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col md:flex-row gap-6">
          {/* Controls Sidebar */}
          <div className="w-full md:w-1/3 flex flex-col gap-5">
            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
              <p className="text-sm text-gray-400 mb-4">
                Connect two cameras. The AI will automatically switch the live broadcast to the camera that has the best view of your face.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1 block">Camera A</label>
                  <select 
                    value={camA} onChange={e => setCamA(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Select Camera...</option>
                    {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-pink-400 uppercase tracking-wider mb-1 block">Camera B</label>
                  {!mobileConnected ? (
                    <div className="flex flex-col gap-2">
                      <select 
                        value={camB} onChange={e => setCamB(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select Camera...</option>
                        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                      </select>
                      
                      <div className="flex items-center gap-2 text-gray-500 my-1">
                        <div className="h-px bg-gray-700 flex-1"></div>
                        <span className="text-xs">OR</span>
                        <div className="h-px bg-gray-700 flex-1"></div>
                      </div>

                      <button 
                        onClick={connectMobile}
                        className="w-full flex items-center justify-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 rounded-lg py-2 text-sm font-medium transition-colors"
                      >
                        <QrCode className="w-4 h-4" />
                        Connect Mobile via QR
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 px-3 py-2 rounded-lg text-sm text-green-400">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        Mobile Connected
                      </div>
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsDirectorEnabled(!isDirectorEnabled)}
              disabled={!camA || !camB}
              className={`w-full py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                isDirectorEnabled 
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <Activity className="w-5 h-5" />
              {isDirectorEnabled ? 'Stop AI Director' : 'Enable AI Director'}
            </button>

            <div className="mt-auto bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-xs text-green-400">
              &gt; {statusText}
            </div>
          </div>

          {/* Previews */}
          <div className="w-full md:w-2/3 flex flex-col sm:flex-row gap-4">
            
            {/* Cam A Preview */}
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-sm font-semibold text-indigo-400">Camera A</span>
                <span className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">Score: {scoreA}</span>
              </div>
              <div className={`relative bg-black rounded-xl overflow-hidden aspect-video border-2 transition-colors ${winningCameraRef.current === camA && isDirectorEnabled ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'border-gray-800'}`}>
                <video ref={videoRefA} autoPlay playsInline muted className="w-full h-full object-cover" />
                {(!camA || !isDirectorEnabled) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                    <Camera className="w-8 h-8 text-gray-600" />
                  </div>
                )}
                {winningCameraRef.current === camA && isDirectorEnabled && (
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">LIVE</div>
                )}
              </div>
            </div>

            {/* Cam B Preview */}
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-sm font-semibold text-pink-400">Camera B {mobileConnected && '(Mobile)'}</span>
                <span className="text-xs font-mono bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded">Score: {scoreB}</span>
              </div>
              <div className={`relative bg-black rounded-xl overflow-hidden aspect-video border-2 transition-colors ${winningCameraRef.current === camB && isDirectorEnabled ? 'border-pink-500 shadow-[0_0_15px_rgba(244,114,182,0.5)]' : 'border-gray-800'}`}>
                
                {showQR ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-4">
                    <div className="bg-white p-2 rounded-xl mb-2">
                      <QRCodeSVG value={qrUrl} size={120} />
                    </div>
                    <p className="text-xs text-center text-gray-400 font-medium">Scan with your phone to<br/>connect Mobile Camera</p>
                  </div>
                ) : (
                  <>
                    <video ref={videoRefB} autoPlay playsInline muted className="w-full h-full object-cover" />
                    {(!camB || !isDirectorEnabled) && !mobileConnected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                        <Camera className="w-8 h-8 text-gray-600" />
                      </div>
                    )}
                    {winningCameraRef.current === camB && isDirectorEnabled && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">LIVE</div>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
