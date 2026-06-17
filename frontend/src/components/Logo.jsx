import { Video } from 'lucide-react';

export default function Logo({ size = 'md', withText = true }) {
  const isSmall = size === 'sm';
  
  return (
    <div className={`flex items-center ${isSmall ? 'gap-2' : 'gap-3'}`}>
      {/* Icon Mark */}
      <div className={`relative flex items-center justify-center ${isSmall ? 'w-8 h-8' : 'w-10 h-10'}`}>
        {/* Glow behind */}
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl blur-[6px] opacity-60 animate-pulse"></div>
        {/* Glass Box */}
        <div className="relative flex items-center justify-center w-full h-full bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl shadow-lg border border-white/20">
          <Video className={`${isSmall ? 'w-4 h-4' : 'w-5 h-5'} text-white drop-shadow-md`} />
        </div>
      </div>
      
      {/* Wordmark */}
      {withText && (
        <span className={`font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 ${isSmall ? 'text-xl' : 'text-3xl'}`}>
          NextMeet
        </span>
      )}
    </div>
  );
}
