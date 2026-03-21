import React from 'react';
import { Territory, Squad, User } from '../types';

interface TerritoriesProps {
  user: User;
  territories: Territory[];
  squads: Squad[];
  onClose: () => void;
}

export default function Territories({ user, territories, squads, onClose }: TerritoriesProps) {
  const userSquad = squads.find(s => s.id === user.squadId);
  const myTerritories = territories.filter(t => t.ownerSquadId === user.squadId);

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-[10000] overflow-y-auto p-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-wider">Territories</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white font-bold">CLOSE</button>
      </div>

      {user.squadId === 'general' || !user.squadId ? (
        <div className="text-center text-zinc-500 mt-10">
          <p className="mb-4">You must join a squad to view and capture territories.</p>
          <p className="text-xs">Go to the SQUAD tab to create or join one.</p>
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
            <h3 className="text-emerald-400 font-bold mb-2">Your Squad: {userSquad?.name}</h3>
            <p className="text-zinc-400 text-sm mb-4">Territories Controlled: <span className="text-white font-mono">{myTerritories.length}</span></p>
            <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1">How to Capture</p>
              <p className="text-xs text-zinc-400">Move to an unclaimed area or an enemy territory. A <span className="text-cyan-400 font-bold">PURCHASE</span> or <span className="text-emerald-400 font-bold">CAPTURE</span> button will appear on your HUD.</p>
              <p className="text-[10px] text-zinc-600 mt-2 font-mono">New: 500 BC | Capture: 1000 BC</p>
            </div>
          </div>

          <h3 className="text-lg font-bold text-white mb-4">All Territories</h3>
          <div className="space-y-3">
            {territories.length === 0 ? (
              <p className="text-zinc-500 text-center text-sm">No territories claimed yet.</p>
            ) : (
              territories.map(t => {
                const owner = squads.find(s => s.id === t.ownerSquadId);
                const isMine = t.ownerSquadId === user.squadId;
                
                return (
                  <div key={t.id} className={`p-4 rounded-xl border ${isMine ? 'bg-emerald-900/20 border-emerald-800' : 'bg-zinc-900 border-zinc-800'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white flex items-center gap-2">
                          🚩 {owner?.name || 'Unknown Squad'}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono mt-1">
                          {t.lat.toFixed(4)}, {t.lng.toFixed(4)}
                        </p>
                      </div>
                      {isMine && (
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">YOURS</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
