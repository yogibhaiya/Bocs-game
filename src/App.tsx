import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  loginWithGoogle, 
  handleRedirectResult, 
  loginAnonymously, 
  getUserData,
  GameUser
} from './firebase';
import { useGameData } from './hooks/useGameData';
import GameMap from './components/Map';
import HUD from './components/HUD';
import Shop from './components/Shop';
import Squad from './components/Squad';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import Territories from './components/Territories';
import { ShoppingCart, Users, Trophy, Map as MapIcon, UserCircle, Flag, Play, LogIn } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showFailSafe, setShowFailSafe] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [gameUserData, setGameUserData] = useState<GameUser | null>(null);

  const [activeTab, setActiveTab] = useState<'map' | 'shop' | 'squad' | 'leaderboard' | 'profile' | 'territories'>('map');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const {
    currentUser,
    players,
    squads,
    treasures,
    territories,
    attacks,
    landmines,
    leaderboard,
    fireWeapon,
    throwGrenade,
    collectTreasure,
    buyItem,
    purchaseTerritory,
    placeLandmine,
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
  const [targetLatLng, setTargetLatLng] = useState<{ latitude: number, longitude: number } | null>(null);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    // Handle redirect result on mount
    const checkRedirect = async () => {
      try {
        const user = await handleRedirectResult();
        if (user) {
          setGameUserData(user);
        }
      } catch (e) {
        console.error("Redirect error:", e);
      }
    };
    checkRedirect();

    const unsub = auth.onAuthStateChanged(async (user) => {
      console.log("Auth state changed:", !!user);
      setIsAuthenticated(!!user);
      if (user) {
        const data = await getUserData(user.uid);
        setGameUserData(data);
      } else {
        setGameUserData(null);
      }
      setIsAuthLoading(false);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeTab === 'map' && !e.repeat) {
        e.preventDefault();
        if (currentUserRef.current?.hasAssaultRifle) {
          // Rapid fire on space hold
          const interval = setInterval(() => {
            setFireTrigger(prev => prev + 1);
          }, 150);
          const handleKeyUp = (upEvent: KeyboardEvent) => {
            if (upEvent.code === 'Space') {
              clearInterval(interval);
              window.removeEventListener('keyup', handleKeyUp);
            }
          };
          window.addEventListener('keyup', handleKeyUp);
        }
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
    if (fireTrigger > 0) fireWeapon(targetLatLng, false, currentUserRef.current?.hasAssaultRifle);
  }, [fireTrigger]);

  useEffect(() => {
    if (missileTrigger > 0) fireWeapon(targetLatLng, true);
  }, [missileTrigger]);

  useEffect(() => {
    if (grenadeTrigger > 0) {
      if (currentUser) throwGrenade(currentUser.lat, currentUser.lng);
    }
  }, [grenadeTrigger]);

  useEffect(() => {
    if (isAuthenticated && !currentUser) {
      const timer = setTimeout(() => setShowFailSafe(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, currentUser]);

  const handleGoogleLogin = async () => {
    console.log("Google Login initiated");
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const data = await loginWithGoogle();
      if (data) setGameUserData(data);
      console.log("Google Login successful");
    } catch (e: any) {
      console.error("Google Login error:", e);
      handleAuthError(e);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuestLogin = async () => {
    console.log("Guest Login initiated");
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const data = await loginAnonymously();
      if (data) setGameUserData(data);
      console.log("Guest Login successful");
    } catch (e: any) {
      console.error("Guest Login error:", e);
      handleAuthError(e);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAuthError = (e: any) => {
    if (e.code === 'auth/unauthorized-domain') {
      setAuthError(`The domain "${window.location.hostname}" is not authorized in Firebase. Please add it to the "Authorized domains" list in the Firebase Console.`);
    } else if (e.code === 'auth/popup-blocked') {
      setAuthError("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
    } else if (e.code === 'auth/cancelled-popup-request') {
      setAuthError("Sign-in was cancelled. Please try again.");
    } else {
      setAuthError(e.message || "An error occurred during login.");
    }
  };

  // 🔥 AUTH LOADING
  if (isAuthLoading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Initializing Combat Systems...</p>
        </div>
      </div>
    );
  }

  // 🔥 LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-md w-full bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl relative z-10">
          <div className="mb-8">
            <h1 className="text-7xl font-black text-white mb-1 tracking-tighter italic">BOCS</h1>
            <p className="text-cyan-400 font-mono text-[10px] uppercase tracking-[0.4em] font-bold">Battle of Controlled Sectors</p>
          </div>

          <div className="space-y-4">
            {authError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-left">
                <p className="text-red-400 text-xs font-mono leading-relaxed">
                  <span className="font-bold block mb-1 uppercase text-[10px]">System Alert</span>
                  {authError}
                </p>
              </div>
            )}

            <button 
              onClick={handleGuestLogin} 
              disabled={isSigningIn}
              className="w-full py-5 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-wider hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
            >
              <Play size={20} fill="currentColor" />
              Play Now (Guest)
            </button>

            <button 
              onClick={handleGoogleLogin} 
              disabled={isSigningIn}
              className="w-full py-5 bg-white/5 text-white border border-white/10 rounded-2xl font-bold hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              <LogIn size={18} />
              {auth.currentUser?.isAnonymous ? "Upgrade to Google" : "Continue with Google"}
            </button>
            
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-6">
              Persistent progress requires Google account
            </p>
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
          <div className="w-24 h-24 border-4 border-zinc-800 border-t-cyan-400 rounded-full animate-spin mb-8" />
          <div className="absolute inset-0 flex items-center justify-center">
            <UserCircle size={32} className="text-zinc-700" />
          </div>
        </div>
        <h2 className="text-xl font-black mb-2 uppercase tracking-tighter italic">Deploying Operative</h2>
        <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest text-center max-w-xs">
          Establishing secure link to sector {Math.floor(Math.random() * 999)}...
        </p>
        
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
        onFire={(isAssault) => setFireTrigger(p => p + 1)}
        onFireMissile={() => setMissileTrigger(p => p + 1)}
        onThrowGrenade={() => setGrenadeTrigger(p => p + 1)}
        onPurchaseTerritory={purchaseTerritory}
        onPlaceLandmine={placeLandmine}
      />

      {/* MAP */}
      <GameMap
        currentUser={currentUser}
        players={players}
        treasures={treasures}
        territories={territories}
        attacks={attacks}
        landmines={landmines}
        onMapClick={moveTo}
        onCollectTreasure={collectTreasure}
        onAttackPlayer={attackPlayer}
        onTargetChange={(lat, lng) => setTargetLatLng({ latitude: lat, longitude: lng })}
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
      <div className="fixed bottom-0 left-0 w-full bg-zinc-900/90 backdrop-blur-md border-t border-zinc-800 flex justify-around p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-[50000]">
        <button 
          onClick={() => setActiveTab('map')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'map' ? 'text-cyan-400 bg-cyan-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <MapIcon size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('squad')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'squad' ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Users size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('territories')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'territories' ? 'text-yellow-400 bg-yellow-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Flag size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('shop')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'shop' ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <ShoppingCart size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('leaderboard')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'leaderboard' ? 'text-orange-400 bg-orange-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Trophy size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`p-2 rounded-xl transition-all ${activeTab === 'profile' ? 'text-purple-400 bg-purple-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <UserCircle size={24} />
        </button>
      </div>

    </div>
  );
}