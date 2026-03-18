import React from 'react';
import { Squad } from '../types';
import { Trophy, Medal } from 'lucide-react';

interface LeaderboardProps {
  squads: Squad[];
  onClose: () => void;
}

export default function Leaderboard({ squads, onClose }: LeaderboardProps) {
  const sortedSquads = [...squads].sort((a, b) => b.score - a.score);

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-50 flex flex-col p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <Trophy className="text-yellow-400" />
          LEADERBOARD
        </h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">Close</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-zinc-400 text-sm text-center">Weekly reset in: <span className="text-yellow-400 font-mono font-bold">2d 14h 30m</span></p>
      </div>

      <div className="flex flex-col gap-3">
        {sortedSquads.map((squad, index) => (
          <div 
            key={squad.id} 
            className={`flex items-center gap-4 p-4 rounded-xl border ${
              index === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 
              index === 1 ? 'bg-zinc-300/10 border-zinc-300/30' : 
              index === 2 ? 'bg-orange-500/10 border-orange-500/30' : 
              'bg-zinc-900 border-zinc-800'
            }`}
          >
            <div className="w-8 flex justify-center">
              {index === 0 ? <Medal className="text-yellow-400" /> : 
               index === 1 ? <Medal className="text-zinc-300" /> : 
               index === 2 ? <Medal className="text-orange-400" /> : 
               <span className="text-zinc-500 font-bold font-mono text-lg">#{index + 1}</span>}
            </div>
            
            <img src={squad.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full bg-zinc-800" />
            
            <div className="flex-1">
              <h3 className={`font-bold ${index < 3 ? 'text-white' : 'text-zinc-300'}`}>{squad.name}</h3>
              <p className="text-xs text-zinc-500">ID: {squad.id.slice(0, 8)}</p>
            </div>
            
            <div className="text-right">
              <p className={`font-mono font-bold text-lg ${
                index === 0 ? 'text-yellow-400' : 
                index === 1 ? 'text-zinc-300' : 
                index === 2 ? 'text-orange-400' : 
                'text-zinc-400'
              }`}>{squad.score}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Score</p>
            </div>
          </div>
        ))}
        {sortedSquads.length === 0 && (
          <div className="text-center p-8 text-zinc-500 italic">
            No squads formed yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}
