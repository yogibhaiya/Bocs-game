import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, logout } from './firebase';
import { useGameData } from './hooks/useGameData';
import GameMap from './components/Map';
import HUD from './components/HUD';
import Shop from './components/Shop';
import Squad from './components/Squad';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import Territories from './components/Territories';
import { ShoppingCart, Users, Trophy, LogOut, Map as MapIcon, UserCircle, Flag } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'shop' | 'squad' | 'leaderboard' | 'profile' | 'territories'>('map');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const { currentUser, players, squads, treasures, territories, attackPlayer, collectTreasure, buyItem, claimTerritory, spawnBots } = useGameData();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsub();
  }, []);

  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  const handleLogin = async () => {
    setAuthError(null);
    setLoginSuccess(null);
    try {
      const user = await loginWithGoogle();
      setLoginSuccess(`Successfully signed in as ${user.displayName}`);
      // The onAuthStateChanged listener will handle setting isAuthenticated
    } catch (error: any) {
      setAuthError(error.message || "An unknown error occurred during sign in.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
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

          {authError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-left">
              <p className="font-bold mb-1">Authentication Error</p>
              <p>{authError}</p>
              {authError.includes('configuration-not-found') && (
                <p className="mt-2 text-xs text-red-300">
                  Please go to your Firebase Console &gt; Authentication &gt; Sign-in method, and enable the Google provider.
                </p>
              )}
            </div>
          )}

          {loginSuccess && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/50 rounded-lg text-emerald-400 text-sm text-left">
              <p className="font-bold mb-1">Success</p>
              <p>{loginSuccess}</p>
            </div>
          )}

          <button 
            onClick={handleLogin}
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
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!currentUser.squadId) {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-zinc-950 overflow-hidden font-sans">
        <div className="flex-1 relative min-h-0">
          <Squad user={currentUser} squads={squads} players={players} onClose={() => {}} hideClose={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-zinc-950 overflow-hidden font-sans">
      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0">
        <HUD user={currentUser} />
        <GameMap 
          currentUser={currentUser} 
          players={players} 
          squads={squads}
          treasures={treasures} 
          territories={territories}
          onAttack={attackPlayer}
          onCollectTreasure={collectTreasure}
          onClaimTerritory={claimTerritory}
        />
        
        {activeTab === 'shop' && <Shop user={currentUser} onBuy={buyItem} onClose={() => setActiveTab('map')} />}
        {activeTab === 'squad' && <Squad user={currentUser} squads={squads} players={players} onClose={() => setActiveTab('map')} />}
        {activeTab === 'leaderboard' && <Leaderboard squads={squads} onClose={() => setActiveTab('map')} />}
        {activeTab === 'profile' && <Profile user={currentUser} onSpawnBots={spawnBots} onClose={() => setActiveTab('map')} />}
        {activeTab === 'territories' && <Territories user={currentUser} territories={territories} squads={squads} onClose={() => setActiveTab('map')} />}
      </div>

      {/* Bottom Navigation */}
      <div className="shrink-0 bg-zinc-950 border-t border-zinc-900 z-[100] pb-[max(env(safe-area-inset-bottom),0.5rem)] relative">
        <div className="flex justify-around items-center p-1 sm:p-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'profile' ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <UserCircle className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Profile</span>
          </button>

          <button 
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'map' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <MapIcon className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Map</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('squad')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'squad' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Users className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Squad</span>
          </button>

          <button 
            onClick={() => setActiveTab('territories')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'territories' ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Flag className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Zones</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('shop')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'shop' ? 'text-yellow-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Shop</span>
          </button>

          <button 
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col items-center p-1 sm:p-2 rounded-xl transition-colors min-w-[3.5rem] ${activeTab === 'leaderboard' ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Rank</span>
          </button>
        </div>
      </div>
    </div>
  );
}
