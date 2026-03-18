import React from 'react';
import { User } from '../types';
import { logout } from '../firebase';
import { LogOut, UserCircle, Bot } from 'lucide-react';

interface ProfileProps {
  user: User;
  onSpawnBots: () => void;
  onClose: () => void;
}

export default function Profile({ user, onSpawnBots, onClose }: ProfileProps) {
  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-50 overflow-y-auto p-4 pt-[max(8rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-wider">Profile</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white font-bold">CLOSE</button>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-cyan-400">
            <UserCircle className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{user.displayName}</h3>
            <p className="text-zinc-400 text-sm font-mono">ID: {user.uid.slice(0, 8)}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Health</p>
            <p className="text-emerald-400 font-mono text-xl">{user.health}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Box Coins</p>
            <p className="text-yellow-400 font-mono text-xl">{user.coins}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Ammo</p>
            <p className="text-cyan-400 font-mono text-xl">{user.ammo}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Missiles</p>
            <p className="text-orange-400 font-mono text-xl">{user.autoMissiles}</p>
          </div>
        </div>
      </div>

      <button 
        onClick={onSpawnBots}
        className="mb-4 w-full py-4 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-bold text-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-3"
      >
        <Bot className="w-5 h-5 text-cyan-400" />
        SPAWN TRAINING BOTS
      </button>

      <button 
        onClick={logout}
        className="mt-auto w-full py-4 bg-red-600/20 text-red-500 border border-red-600/50 rounded-xl font-bold text-lg hover:bg-red-600/30 transition-colors flex items-center justify-center gap-3"
      >
        <LogOut className="w-5 h-5" />
        SIGN OUT
      </button>
    </div>
  );
}
