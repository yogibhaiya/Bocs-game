import React from 'react';
import { Squad } from '../types';
import { Trophy, Medal } from 'lucide-react';

interface LeaderboardProps {
  squads: Squad[];
  onClose: () => void;
}

export default function Leaderboard({ squads, onClose }: LeaderboardProps) {
  const sortedSquads = [...squads].sort((a, b) => (b.territoryCount || 0) - (a.territoryCount || 0));

  const getResetTime = () => {
    const now = new Date();
    const nextSunday = new Date(now.getTime());
    const daysUntilSunday = (7 - now.getUTCDay()) % 7;
    nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(0, 0, 0, 0);
    
    if (nextSunday.getTime() <= now.getTime()) {
      nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
    }
    
    const diff = nextSunday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${mins}m`;
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-[10000] flex flex-col p-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <Trophy className="text-yellow-400" />
          TERRITORY RANKINGS
        </h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">Close</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-zinc-400 text-sm text-center">Weekly reset in: <span className="text-yellow-400 font-mono font-bold">{getResetTime()}</span></p>
      </div>

      <div className="flex flex-col gap-3">
        {sortedSquads.map((squad, index) => (
          <div 
            key={squad.id} 
            className={`flex items-center gap-4 p-4 rounded-xl border relative ${
              index === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 
              index === 1 ? 'bg-zinc-300/10 border-zinc-300/30' : 
              index === 2 ? 'bg-orange-500/10 border-orange-500/30' : 
              'bg-zinc-900 border-zinc-800'
            }`}
          >
            {squad.isWeeklyWinner && (
              <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce">
                LAST WEEK'S CHAMP
              </div>
            )}
            
            <div className="w-8 flex justify-center">
              {index === 0 ? <Medal className="text-yellow-400" /> : 
               index === 1 ? <Medal className="text-zinc-300" /> : 
               index === 2 ? <Medal className="text-orange-400" /> : 
               <span className="text-zinc-500 font-bold font-mono text-lg">#{index + 1}</span>}
            </div>
            
            <img src={squad.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full bg-zinc-800" />
            
            <div className="flex-1">
              <h3 className={`font-bold ${index < 3 ? 'text-white' : 'text-zinc-300'}`}>{squad.name}</h3>
              <p className="text-xs text-zinc-500">Score: {squad.score}</p>
            </div>
            
            <div className="text-right">
              <p className={`font-mono font-bold text-lg ${
                index === 0 ? 'text-yellow-400' : 
                index === 1 ? 'text-zinc-300' : 
                index === 2 ? 'text-orange-400' : 
                'text-zinc-400'
              }`}>{squad.territoryCount || 0}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Territories</p>
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
