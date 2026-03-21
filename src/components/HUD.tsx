import React, { useState, useEffect, useRef } from 'react';
import { User, Territory } from '../types';
import { Heart, Crosshair, Coins, Shield, EyeOff, Rocket, Bomb, Map as MapIcon, Flag } from 'lucide-react';
import { isPointWithinRadius } from 'geolib';

interface HUDProps {
  user: User;
  territories: Territory[];
  onFire: () => void;
  onFireMissile: () => void;
  onThrowGrenade: () => void;
  onPurchaseTerritory: () => void;
}

export default function HUD({ user, territories, onFire, onFireMissile, onThrowGrenade, onPurchaseTerritory }: HUDProps) {
  const [isShaking, setIsShaking] = useState(false);
  const lastHealth = useRef(user.health);

  useEffect(() => {
    if (user.health < lastHealth.current) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
    lastHealth.current = user.health;
  }, [user.health]);

  const isShielded = user.shieldUntil && new Date(user.shieldUntil) > new Date();
  const isInvisible = user.invisibleUntil && new Date(user.invisibleUntil) > new Date();

  // Check if player is inside any territory
  const currentTerritory = territories.find(t => 
    isPointWithinRadius({ latitude: user.lat, longitude: user.lng }, { latitude: t.lat, longitude: t.lng }, t.radius)
  );

  const canCapture = user.squadId && user.squadId !== 'general' && currentTerritory && currentTerritory.ownerSquadId !== user.squadId;
  const canPurchase = user.squadId && user.squadId !== 'general' && !currentTerritory;

  return (
    <div className={`fixed top-0 left-0 w-full h-full p-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none z-[9999] flex flex-col justify-between transition-transform duration-75 ${isShaking ? 'translate-x-1 translate-y-1' : ''}`}>
      <div className="flex justify-between items-start w-full">
        <div className="flex flex-col gap-3 pointer-events-auto">
          {/* Health */}
          <div className="flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl border border-zinc-800/50 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
            <Heart className="w-5 h-5 text-red-500 shrink-0 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <div className="w-20 sm:w-32 h-2.5 bg-zinc-900 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300 shadow-[0_0_10px_rgba(239,68,68,0.8)]" 
                style={{ width: `${Math.max(0, Math.min(100, (user.health / 10000) * 100))}%` }}
              />
            </div>
            <span className="text-sm font-bold font-mono text-zinc-100 drop-shadow-md">{user.health}</span>
          </div>

          {/* Territories */}
          <div className="flex items-center gap-3 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl border border-zinc-800/50 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
            <MapIcon className="w-5 h-5 text-emerald-500 shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span className="text-sm sm:text-base font-bold font-mono text-zinc-100 drop-shadow-md">{user.territoryCount || 0} Territories</span>
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
          {user.grenades > 0 && (
            <div className="flex items-center gap-2 bg-emerald-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-emerald-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
              <Bomb className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
              <span className="text-xs sm:text-sm font-black tracking-wider text-emerald-200 drop-shadow-md">{user.grenades}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fire Buttons */}
      <div className="flex justify-end items-end gap-4 sm:gap-6 pb-24 sm:pb-32 pr-4 sm:pr-8">
        {/* Territory Purchase/Capture */}
        {(canPurchase || canCapture) && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPurchaseTerritory();
              }}
              disabled={user.health <= 0 || (canPurchase && user.coins < 500) || (canCapture && user.coins < 1000)}
              className={`pointer-events-auto group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100 ${
                canCapture ? 'bg-emerald-600 border-emerald-900' : 'bg-cyan-600 border-cyan-900'
              }`}
            >
              <div className={`absolute inset-0 rounded-full animate-pulse opacity-20 group-hover:opacity-40 ${
                canCapture ? 'bg-emerald-500' : 'bg-cyan-500'
              }`} />
              <Flag className="w-8 h-8 sm:w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </button>
            <span className={`${canCapture ? 'text-emerald-500' : 'text-cyan-500'} font-black text-[10px] tracking-widest uppercase drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]`}>
              {canCapture ? 'Capture' : 'Purchase'}
            </span>
          </div>
        )}

        {/* Standard Weapon */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFire();
            }}
            disabled={user.ammo <= 0 || user.health <= 0}
            className="pointer-events-auto group relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-600 border-4 border-red-900 shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-95 active:bg-red-700 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
          >
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20 group-hover:opacity-40" />
            <Crosshair className="w-10 h-10 sm:w-12 h-12 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
          </button>
          <span className="text-red-500 font-black text-[10px] tracking-widest uppercase drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">Weapon</span>
        </div>

        {/* Missile Button (Only if user has missiles) */}
        {user.autoMissiles > 0 && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFireMissile();
              }}
              disabled={user.health <= 0}
              className="pointer-events-auto group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-orange-600 border-4 border-orange-900 shadow-[0_0_30px_rgba(249,115,22,0.5)] active:scale-95 active:bg-orange-700 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
            >
              <div className="absolute inset-0 rounded-full bg-orange-500 animate-pulse opacity-20 group-hover:opacity-40" />
              <Rocket className="w-8 h-8 sm:w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </button>
            <span className="text-orange-500 font-black text-[10px] tracking-widest uppercase drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]">Missile</span>
          </div>
        )}

        {/* Grenade Button (Only if user has grenades) */}
        {user.grenades > 0 && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onThrowGrenade();
              }}
              disabled={user.health <= 0}
              className="pointer-events-auto group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-600 border-4 border-emerald-900 shadow-[0_0_30px_rgba(34,197,94,0.5)] active:scale-95 active:bg-emerald-700 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
            >
              <div className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse opacity-20 group-hover:opacity-40" />
              <Bomb className="w-8 h-8 sm:w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </button>
            <span className="text-emerald-500 font-black text-[10px] tracking-widest uppercase drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]">Grenade</span>
          </div>
        )}
      </div>
    </div>
  );
}
