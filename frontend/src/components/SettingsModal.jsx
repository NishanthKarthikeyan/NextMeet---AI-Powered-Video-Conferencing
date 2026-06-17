import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Mic, Speaker, Image as ImageIcon } from 'lucide-react';
import { useMediaDeviceSelect, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { BackgroundBlur } from '@livekit/track-processors';

export default function SettingsModal({ onClose }) {
  const { devices: audioInputs, activeDeviceId: activeAudioInput, setActiveMediaDevice: setActiveAudioInput } = useMediaDeviceSelect({ kind: 'audioinput' });
  const { devices: videoInputs, activeDeviceId: activeVideoInput, setActiveMediaDevice: setActiveVideoInput } = useMediaDeviceSelect({ kind: 'videoinput' });
  
  // Background Blur logic
  const { localParticipant } = useLocalParticipant();
  const [isBlurred, setIsBlurred] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const blurProcessor = useRef(null);

  useEffect(() => {
    blurProcessor.current = BackgroundBlur(10);
    
    // Check if currently blurred
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track?.processor) {
      setIsBlurred(true);
    }
    
    return () => {
      // Don't destroy if it's currently in use by the track
      // blurProcessor.current?.destroy();
    };
  }, [localParticipant]);

  const toggleBlur = async () => {
    if (isToggling) return;
    
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    if (!pub || !pub.track) {
      alert("Please turn on your camera first before enabling Background Blur!");
      return;
    }
    
    setIsToggling(true);
    try {
      if (!isBlurred) {
        await pub.track.setProcessor(blurProcessor.current);
        setIsBlurred(true);
      } else {
        await pub.track.stopProcessor();
        setIsBlurred(false);
      }
    } catch (err) {
      console.error("Error toggling background blur:", err);
      alert(`Failed to apply background blur: ${err.message || err}`);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gray-800/50">
          <h2 className="text-lg font-semibold text-white">Device Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          
          {/* Camera Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-medium">
              <Camera className="w-4 h-4" />
              <label>Camera</label>
            </div>
            <select 
              value={activeVideoInput || ''}
              onChange={(e) => setActiveVideoInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {videoInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.substring(0, 5)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Microphone Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-medium">
              <Mic className="w-4 h-4" />
              <label>Microphone</label>
            </div>
            <select 
              value={activeAudioInput || ''}
              onChange={(e) => setActiveAudioInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {audioInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.substring(0, 5)}`}
                </option>
              ))}
            </select>
          </div>

          <div className="h-px bg-white/10 w-full my-4"></div>

          {/* Virtual Background */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-medium">
              <ImageIcon className="w-4 h-4" />
              <label>Virtual Background</label>
            </div>
            <div className="flex items-center justify-between bg-gray-800 p-4 rounded-xl border border-gray-700">
              <span className="text-sm text-gray-300">Background Blur</span>
              <button 
                onClick={toggleBlur}
                disabled={isToggling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBlurred ? 'bg-indigo-500' : 'bg-gray-600'} ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBlurred ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
