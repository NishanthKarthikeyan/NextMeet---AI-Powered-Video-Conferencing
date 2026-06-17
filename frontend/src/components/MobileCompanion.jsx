import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, CheckCircle2, AlertCircle } from 'lucide-react';

export default function MobileCompanion() {
  const { sessionId } = useParams();
  const [status, setStatus] = useState('Requesting Camera...');
  const [error, setError] = useState(null);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const peerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // 1. Get Mobile Camera
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        
        if (!isMounted) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setStatus('Connecting to Desktop...');

        // 2. Connect to Signaling Server via Proxy
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/companion/${sessionId}`);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('Waiting for Desktop Offer...');
        };

        let iceCandidateQueue = [];

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          
          if (message.type === 'offer') {
            if (peerRef.current) return; // Ignore subsequent polled offers
            setStatus('Negotiating Connection...');
            
            // 3. Create WebRTC Peer
            const pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerRef.current = pc;

            // Send ICE candidates
            pc.onicecandidate = (e) => {
              if (e.candidate) {
                ws.send(JSON.stringify({ type: 'candidate', candidate: e.candidate }));
              }
            };

            // Add local stream tracks
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Set Remote Offer
            await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
            
            // Process any queued candidates
            iceCandidateQueue.forEach(c => pc.addIceCandidate(c).catch(console.error));
            iceCandidateQueue = [];
            
            // Create Answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Send Answer
            ws.send(JSON.stringify({ type: 'answer', answer }));
            setStatus('Streaming Live to Desktop ✨');
          } else if (message.type === 'candidate') {
            const rtcCandidate = new RTCIceCandidate(message.candidate);
            if (peerRef.current && peerRef.current.remoteDescription) {
              await peerRef.current.addIceCandidate(rtcCandidate).catch(console.error);
            } else {
              iceCandidateQueue.push(rtcCandidate);
            }
          }
        };

        ws.onerror = () => setError('Connection Error');
        ws.onclose = () => {
          if (isMounted) setStatus('Disconnected');
        };

      } catch (err) {
        console.error(err);
        setError(err.message || 'Camera access denied');
      }
    };

    init();

    return () => {
      isMounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (wsRef.current) wsRef.current.close();
      if (peerRef.current) peerRef.current.close();
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-white font-sans">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-full">
            <Camera className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">
            NextMeet Mobile
          </h1>
        </div>

        <div className="relative w-full aspect-[3/4] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border-2 border-gray-800">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
          
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            {error ? (
              <div className="flex items-center gap-2 bg-red-500/90 backdrop-blur px-4 py-2 rounded-full shadow-lg">
                <AlertCircle className="w-5 h-5 text-white" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            ) : (
              <div className={`flex items-center gap-2 backdrop-blur px-4 py-2 rounded-full shadow-lg border ${status.includes('Live') ? 'bg-green-500/20 border-green-500/30 text-green-300' : 'bg-black/50 border-white/10 text-white'}`}>
                {status.includes('Live') && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                <span className="text-sm font-medium">{status}</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-gray-500 text-sm text-center px-4">
          Keep this screen open and your phone propped up. Your video is streaming directly to your Desktop's AI Director.
        </p>
      </div>
    </div>
  );
}
