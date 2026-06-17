import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

export default function Whiteboard({ onClose }) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  
  // Track the last time we sent an update to prevent feedback loops
  const lastUpdateRef = useRef(0);
  const isUpdatingFromRemoteRef = useRef(false);

  // Send updates to other participants
  const onChange = useCallback((elements, appState) => {
    if (!excalidrawAPI || isUpdatingFromRemoteRef.current) return;
    
    const now = Date.now();
    // Throttle updates (e.g. every 100ms)
    if (now - lastUpdateRef.current > 100) {
      lastUpdateRef.current = now;
      
      const payload = JSON.stringify({
        type: 'whiteboard_update',
        elements: elements,
      });
      
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);
      localParticipant.publishData(data, { reliable: true });
    }
  }, [excalidrawAPI, localParticipant]);

  // Listen for remote updates
  useEffect(() => {
    if (!room || !excalidrawAPI) return;

    const handleDataReceived = (payload, participant) => {
      const decoder = new TextDecoder();
      try {
        const message = JSON.parse(decoder.decode(payload));
        if (message.type === 'whiteboard_update' && message.elements) {
          // Update local canvas
          isUpdatingFromRemoteRef.current = true;
          excalidrawAPI.updateScene({ elements: message.elements });
          
          // Allow local edits again after a short delay
          setTimeout(() => {
            isUpdatingFromRemoteRef.current = false;
          }, 50);
        }
      } catch (err) {
        // Not a whiteboard message or parsing failed
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => room.off(RoomEvent.DataReceived, handleDataReceived);
  }, [room, excalidrawAPI]);

  return (
    <div className="absolute inset-4 z-40 bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-gray-800/80 backdrop-blur-md">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Collaborative Whiteboard
        </h2>
        <button 
          onClick={onClose} 
          className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
        >
          <X className="w-4 h-4" /> Close
        </button>
      </div>
      
      {/* Canvas */}
      <div className="flex-1 relative">
        <Excalidraw 
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          onChange={onChange}
          theme="dark"
        />
      </div>
    </div>
  );
}
