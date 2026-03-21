import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle } from './firebase';
import { useGameData } from './hooks/useGameData';
import GameMap from './components/Map';
import HUD from './components/HUD';
import Shop from './components/Shop';
import Squad from './components/Squad';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import Territories from './components/Territories';
import { ShoppingCart, Users, Trophy, Map as MapIcon, UserCircle, Flag } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showFailSafe, setShowFailSafe] = useState(false);

  const [activeTab, setActiveTab] = useState<'map' | 'shop' | 'squad' | 'leaderboard' | 'profile' | 'territories'>('map');

  const {
    currentUser,
    players,
    squads,
    treasures,
    territories,
    attacks,
    leaderboard,
    fireWeapon,
    throwGrenade,
    collectTreasure,
    buyItem,
    purchaseTerritory,
    updateAvatar,
    isQuotaExceeded,
    attackPlayer,
    notification,
    moveTo,
    createSquad,
    joinSquad,
    leaveSquad,
    spawnBots,
    spawnTenBots,
    spawnTestEntities,
    addTestCoins,
    enterFailSafeMode
  } = useGameData(true);

  const [fireTrigger, setFireTrigger] = useState(0);
  const [missileTrigger, setMissileTrigger] = useState(0);
  const [grenadeTrigger, setGrenadeTrigger] = useState(0);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      console.log("Auth state changed:", !!user);
      setIsAuthenticated(!!user);
      setIsAuthLoading(false);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeTab === 'map') {
        e.preventDefault();
        setFireTrigger(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unsub();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]);

  useEffect(() => {
    if (fireTrigger > 0) fireWeapon(null, false);
  }, [fireTrigger]);

  useEffect(() => {
    if (missileTrigger > 0) fireWeapon(null, true);
  }, [missileTrigger]);

  useEffect(() => {
    if (grenadeTrigger > 0) {
      // For grenade we need a target, but HUD call might not have one.
      // In a real game, this might throw at current location or crosshair.
      // For now, let's just trigger it at current player location if no target.
      if (currentUser) throwGrenade(currentUser.lat, currentUser.lng);
    }
  }, [grenadeTrigger]);

  useEffect(() => {
    if (isAuthenticated && !currentUser) {
      const timer = setTimeout(() => setShowFailSafe(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, currentUser]);

  const handleLogin = async () => {
    console.log("Login initiated");
    try {
      await loginWithGoogle();
      console.log("Login successful");
    } catch (e) {
      console.error("Login error:", e);
    }
  };

  // 🔥 AUTH LOADING
  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // 🔥 LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
          <h1 className="text-6xl font-black text-cyan-400 mb-2 tracking-tighter">BOCS</h1>
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.2em] mb-12">Tactical Combat</p>

          <div className="space-y-4">
            <p className="text-zinc-400 text-sm mb-4">Sign in to join the battlefield</p>
            <button 
              onClick={handleLogin} 
              className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🔥 LOADING PLAYER FIX
  if (!currentUser) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center text-white p-6">
        <div className="relative">
          <div className="animate-spin w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></div>
          </div>
        </div>
        <h2 className="mt-8 font-black text-2xl tracking-tighter">SYNCHRONIZING</h2>
        <p className="text-zinc-500 text-sm mt-2 font-mono uppercase tracking-widest">Fetching player profile...</p>
        
        {showFailSafe && (
          <div className="mt-8 p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center max-w-xs">
            <p className="text-xs text-zinc-400 mb-4">Connection taking longer than expected.</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-2 bg-zinc-800 text-white text-xs font-bold rounded-lg uppercase tracking-widest hover:bg-zinc-700"
              >
                Force Reload
              </button>
              <button 
                onClick={enterFailSafeMode}
                className="w-full py-2 bg-cyan-500/20 text-cyan-400 text-xs font-bold rounded-lg uppercase tracking-widest border border-cyan-500/30 hover:bg-cyan-500/30"
              >
                Enter Game Anyway
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-white relative overflow-hidden">
      {isQuotaExceeded && (
        <div className="absolute top-0 left-0 w-full bg-red-600 text-white text-[10px] font-bold py-1 px-4 text-center z-[5000] animate-pulse">
          ⚠️ FIRESTORE QUOTA EXCEEDED - OFFLINE MODE ACTIVE
        </div>
      )}

      {notification && (
        <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-[4000] px-6 py-2 rounded-full font-black text-sm shadow-2xl animate-bounce border ${
          notification.type === 'hit' ? 'bg-red-500 border-red-400 text-white' :
          notification.type === 'kill' ? 'bg-yellow-500 border-yellow-400 text-black' :
          notification.type === 'miss' ? 'bg-zinc-800 border-zinc-700 text-white' :
          'bg-cyan-500 border-cyan-400 text-white'
        }`}>
          {notification.message.toUpperCase()}
        </div>
      )}

      {/* HUD */}
      <HUD 
        user={currentUser} 
        territories={territories}
        onFire={() => setFireTrigger(p => p + 1)}
        onFireMissile={() => setMissileTrigger(p => p + 1)}
        onThrowGrenade={() => setGrenadeTrigger(p => p + 1)}
        onPurchaseTerritory={purchaseTerritory}
      />

      {/* MAP */}
      <GameMap
        currentUser={currentUser}
        players={players}
        treasures={treasures}
        territories={territories}
        attacks={attacks}
        onMapClick={moveTo}
        onCollectTreasure={collectTreasure}
        onAttackPlayer={attackPlayer}
      />

      {/* MODALS */}
      {activeTab === 'shop' && <Shop user={currentUser} onBuy={buyItem} onClose={() => setActiveTab('map')} />}
      {activeTab === 'squad' && <Squad user={currentUser} squads={squads} players={players} onCreateSquad={createSquad} onJoinSquad={joinSquad} onLeaveSquad={leaveSquad} onClose={() => setActiveTab('map')} />}
      {activeTab === 'leaderboard' && <Leaderboard squads={leaderboard} onClose={() => setActiveTab('map')} />}
      {activeTab === 'profile' && (
        <Profile 
          user={currentUser} 
          onSpawnBots={spawnBots}
          onSpawnTenBots={spawnTenBots}
          onSpawnTestEntities={spawnTestEntities}
          onAddCoins={addTestCoins}
          onUpdateAvatar={updateAvatar} 
          onClose={() => setActiveTab('map')} 
        />
      )}
      {activeTab === 'territories' && <Territories user={currentUser} territories={territories} squads={squads} onClose={() => setActiveTab('map')} />}

      {/* NAV */}
      <div className="bg-zinc-900 flex justify-around p-2">
        <button onClick={() => setActiveTab('map')}><MapIcon /></button>
        <button onClick={() => setActiveTab('squad')}><Users /></button>
        <button onClick={() => setActiveTab('territories')}><Flag /></button>
        <button onClick={() => setActiveTab('shop')}><ShoppingCart /></button>
        <button onClick={() => setActiveTab('leaderboard')}><Trophy /></button>
        <button onClick={() => setActiveTab('profile')}><UserCircle /></button>
      </div>

    </div>
  );
}