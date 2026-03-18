import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, logout } from './firebase';
import { useGameData } from './hooks/useGameData';
import GameMap from './components/Map';
import HUD from './components/HUD';
import Shop from './components/Shop';
import Squad from './components/Squad';
import Leaderboard from './components/Leaderboard';
import { ShoppingCart, Users, Trophy, LogOut, Map as MapIcon } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'shop' | 'squad' | 'leaderboard'>('map');
  
  const { currentUser, players, squads, treasures, territories, attackPlayer, collectTreasure, buyItem } = useGameData();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsub();
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 mb-2 tracking-tighter">BOCS</h1>
          <p className="text-zinc-400 mb-8 font-mono text-sm uppercase tracking-widest">Real-World Tactical Combat</p>
          
          <div className="space-y-4 mb-8 text-left">
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-cyan-400">📍</div>
              <p className="text-sm">Move in the real world to play</p>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-emerald-400">👥</div>
              <p className="text-sm">Form squads and conquer territories</p>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-yellow-400">💰</div>
              <p className="text-sm">Earn Box Coins for real rewards</p>
            </div>
          </div>

          <button 
            onClick={loginWithGoogle}
            className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-zinc-950 flex flex-col overflow-hidden relative font-sans">
      {/* Main Content Area */}
      <div className="flex-1 relative">
        {activeTab === 'map' && (
          <>
            <HUD user={currentUser} />
            <GameMap 
              currentUser={currentUser} 
              players={players} 
              treasures={treasures} 
              territories={territories}
              onAttack={attackPlayer}
              onCollectTreasure={collectTreasure}
            />
          </>
        )}
        {activeTab === 'shop' && <Shop user={currentUser} onBuy={buyItem} onClose={() => setActiveTab('map')} />}
        {activeTab === 'squad' && <Squad user={currentUser} squads={squads} players={players} onClose={() => setActiveTab('map')} />}
        {activeTab === 'leaderboard' && <Leaderboard squads={squads} onClose={() => setActiveTab('map')} />}
      </div>

      {/* Bottom Navigation */}
      <div className="bg-zinc-950 border-t border-zinc-900 pb-safe z-20">
        <div className="flex justify-around items-center p-2">
          <button 
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'map' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <MapIcon className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Map</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('squad')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'squad' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Users className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Squad</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('shop')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'shop' ? 'text-yellow-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <ShoppingCart className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Shop</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'leaderboard' ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Trophy className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Rank</span>
          </button>

          <button 
            onClick={logout}
            className="flex flex-col items-center p-2 rounded-xl text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
