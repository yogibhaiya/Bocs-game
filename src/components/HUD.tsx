import React from 'react';
import { User } from '../types';
import { Heart, Crosshair, Coins, Shield, EyeOff, Rocket } from 'lucide-react';

interface HUDProps {
  user: User;
}

export default function HUD({ user }: HUDProps) {
  const isShielded = user.shieldUntil && new Date(user.shieldUntil) > new Date();
  const isInvisible = user.invisibleUntil && new Date(user.invisibleUntil) > new Date();

  return (
    <div className="fixed top-0 left-0 w-full p-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none z-[9999] flex justify-between items-start">
      <div className="flex flex-col gap-3 pointer-events-auto">
        {/* Health */}
        <div className="flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl border border-zinc-800/50 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <Heart className="w-5 h-5 text-red-500 shrink-0 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <div className="w-20 sm:w-32 h-2.5 bg-zinc-900 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300 shadow-[0_0_10px_rgba(239,68,68,0.8)]" 
              style={{ width: `${Math.max(0, Math.min(100, user.health))}%` }}
            />
          </div>
          <span className="text-sm font-bold font-mono text-zinc-100 drop-shadow-md">{user.health}</span>
        </div>

        {/* Ammo */}
        <div className="flex items-center gap-3 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl border border-zinc-800/50 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <Crosshair className="w-5 h-5 text-blue-500 shrink-0 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span className="text-sm sm:text-base font-bold font-mono text-zinc-100 drop-shadow-md">{user.ammo}</span>
        </div>

        {/* Coins */}
        <div className="flex items-center gap-3 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl border border-zinc-800/50 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <Coins className="w-5 h-5 text-yellow-500 shrink-0 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
          <span className="text-sm sm:text-base font-bold font-mono text-zinc-100 drop-shadow-md">{user.coins} BC</span>
        </div>
      </div>

      {/* Status Effects */}
      <div className="flex flex-col gap-3 items-end pointer-events-auto">
        {isShielded && (
          <div className="flex items-center gap-2 bg-blue-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Shield className="w-5 h-5 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            <span className="text-xs sm:text-sm font-black tracking-wider text-blue-200 drop-shadow-md">SHIELDED</span>
          </div>
        )}
        {isInvisible && (
          <div className="flex items-center gap-2 bg-purple-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <EyeOff className="w-5 h-5 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
            <span className="text-xs sm:text-sm font-black tracking-wider text-purple-200 drop-shadow-md">INVISIBLE</span>
          </div>
        )}
        {user.autoMissiles > 0 && (
          <div className="flex items-center gap-2 bg-orange-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            <Rocket className="w-5 h-5 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
            <span className="text-xs sm:text-sm font-black tracking-wider text-orange-200 drop-shadow-md">{user.autoMissiles}</span>
          </div>
        )}
      </div>
    </div>
  );
}
