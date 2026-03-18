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
    <div className="absolute top-0 left-0 w-full p-4 pointer-events-none z-10 flex justify-between items-start">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {/* Health */}
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-zinc-800">
          <Heart className="w-4 h-4 text-red-500" />
          <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 transition-all duration-300" 
              style={{ width: `${Math.max(0, Math.min(100, user.health))}%` }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-300">{user.health}</span>
        </div>

        {/* Ammo */}
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-zinc-800">
          <Crosshair className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-mono text-zinc-300">{user.ammo}</span>
        </div>

        {/* Coins */}
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-zinc-800">
          <Coins className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-mono text-zinc-300">{user.coins} BC</span>
        </div>
      </div>

      {/* Status Effects */}
      <div className="flex flex-col gap-2 items-end pointer-events-auto">
        {isShielded && (
          <div className="flex items-center gap-2 bg-blue-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-blue-500">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-blue-200">SHIELDED</span>
          </div>
        )}
        {isInvisible && (
          <div className="flex items-center gap-2 bg-purple-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-purple-500">
            <EyeOff className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-purple-200">INVISIBLE</span>
          </div>
        )}
        {user.autoMissiles > 0 && (
          <div className="flex items-center gap-2 bg-orange-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-orange-500">
            <Rocket className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-orange-200">{user.autoMissiles}</span>
          </div>
        )}
      </div>
    </div>
  );
}
