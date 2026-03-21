import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { User, Treasure, Territory, Attack, LeaderboardEntry, Squad } from '../types';
import { useGeolocation } from './useGeolocation';
import { getDistance } from 'geolib';
import { io } from 'socket.io-client';

// Initialize socket with explicit origin to avoid connection issues in sandboxed environments
const socket = io(typeof window !== 'undefined' ? window.location.origin : '', {
  reconnectionAttempts: 5,
  timeout: 10000,
});

(window as any).socket = socket;

export const useGameData = (gameStarted: boolean) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [treasures, setTreasures] = useState<Treasure[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [leaderboard, setLeaderboard] = useState<Squad[]>([]);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [notification, setNotification] = useState<{ message: string, type: 'hit' | 'kill' | 'miss' | 'info' } | null>(null);
  const { location, error: geoError } = useGeolocation();
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [useFallbackLocation, setUseFallbackLocation] = useState(false);
  const hasJoined = useRef(false);

  // Fallback location (Kolkata center as per server)
  const FALLBACK_LOCATION = { lat: 22.5726, lng: 88.3639 };

  const activeLocation = location || (useFallbackLocation ? FALLBACK_LOCATION : null);

  // Fail-safe: Force game entry if server is unresponsive
  const enterFailSafeMode = () => {
    console.warn("Entering Fail-Safe Mode (Local Session)");
    const user = auth.currentUser;
    if (!user) return;

    const mockUser: User = {
      uid: user.uid,
      displayName: user.displayName || 'Player',
      photoURL: user.photoURL || '👤',
      lat: activeLocation?.lat || FALLBACK_LOCATION.lat,
      lng: activeLocation?.lng || FALLBACK_LOCATION.lng,
      health: 10000,
      ammo: 100,
      grenades: 5,
      autoMissiles: 2,
      coins: 1000,
      kills: 0,
      deaths: 0,
      squadId: 'general',
      onlineStatus: true,
      lastActive: new Date().toISOString(),
      territoryCount: 0,
      tutorialCompleted: false,
      gunQuality: 'standard',
      hasAssaultRifle: false
    };
    setCurrentUser(mockUser);
  };

  useEffect(() => {
    if (gameStarted && !location && !useFallbackLocation) {
      const timer = setTimeout(() => {
        console.log("Geolocation slow/failed, using fallback");
        setUseFallbackLocation(true);
      }, 1500); // Faster fallback
      return () => clearTimeout(timer);
    }
  }, [gameStarted, location, useFallbackLocation]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthReady(!!user);
    });
    return () => unsub();
  }, []);

  // Socket.IO listeners
  useEffect(() => {
    if (!gameStarted) {
      hasJoined.current = false;
      return;
    }
    
    const user = auth.currentUser;
    if (!user || !activeLocation) return;

    if (!hasJoined.current) {
      console.log("Joining socket with location:", activeLocation);
      hasJoined.current = true;

      // Join socket room
      socket.emit('join', {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        photoURL: user.photoURL || '',
        lat: activeLocation.lat,
        lng: activeLocation.lng
      });
    }

    socket.on('connect', () => {
      console.log("Socket connected:", socket.id);
      // Re-join on reconnection
      if (gameStarted && auth.currentUser && activeLocation) {
        socket.emit('join', {
          uid: auth.currentUser.uid,
          displayName: auth.currentUser.displayName || 'Player',
          photoURL: auth.currentUser.photoURL || '',
          lat: activeLocation.lat,
          lng: activeLocation.lng
        });
      }
    });

    socket.on('initData', (data: { 
      player: User, 
      players: User[], 
      territories: Territory[], 
      treasures: Treasure[],
      squads: Squad[]
    }) => {
      console.log("Received initData:", data);
      setCurrentUser(data.player);
      setPlayers(data.players);
      setTerritories(data.territories);
      setTreasures(data.treasures);
      setSquads(data.squads);
    });

    socket.on('squadAdded', (s: Squad) => {
      setSquads(prev => [...prev, s]);
    });

    socket.on('playerJoined', (p: User) => {
      setPlayers(prev => {
        if (prev.find(pl => pl.uid === p.uid)) return prev;
        return [...prev, p];
      });
    });

    socket.on('playerMoved', (data: { uid: string, lat: number, lng: number }) => {
      if (data.uid === user.uid) {
        setCurrentUser(prev => prev ? { ...prev, lat: data.lat, lng: data.lng } : null);
      }
      setPlayers(prev => prev.map(p => p.uid === data.uid ? { ...p, lat: data.lat, lng: data.lng } : p));
    });

    socket.on('playerLeft', (data: { uid: string }) => {
      setPlayers(prev => prev.filter(p => p.uid !== data.uid));
    });

    socket.on('statsUpdated', (stats: Partial<User>) => {
      setCurrentUser(prev => prev ? { ...prev, ...stats } : null);
      setPlayers(prev => prev.map(p => p.uid === user.uid ? { ...p, ...stats } : p));
    });

    socket.on('playerHit', (data: { targetId: string, attackerId: string, damage: number, weapon: string, newHealth: number }) => {
      if (user.uid === data.targetId) {
        setNotification({ message: `Hit by ${data.weapon}! -${data.damage}`, type: 'hit' });
        setCurrentUser(prev => prev ? { ...prev, health: data.newHealth } : null);
      }
      setPlayers(prev => prev.map(p => p.uid === data.targetId ? { ...p, health: data.newHealth } : p));

      // Visual effect for attack
      const attacker = players.find(p => p.uid === data.attackerId) || (user.uid === data.attackerId ? currentUser : null);
      const target = players.find(p => p.uid === data.targetId) || (user.uid === data.targetId ? currentUser : null);

      if (attacker && target) {
        const attackId = `atk_${Date.now()}_${data.attackerId}`;
        setAttacks(prev => [...prev, {
          id: attackId,
          attackerId: data.attackerId,
          targetId: data.targetId,
          fromLat: attacker.lat,
          fromLng: attacker.lng,
          toLat: target.lat,
          toLng: target.lng,
          timestamp: Date.now(),
          type: data.weapon === 'grenade' ? 'grenade' : (data.weapon === 'missile' ? 'missile' : 'bullet')
        }]);
        setTimeout(() => setAttacks(prev => prev.filter(a => a.id !== attackId)), 1000);
      }
    });

    socket.on('playerKilled', (data: { killerId: string, victimId: string }) => {
      if (user.uid === data.victimId) {
        setNotification({ message: "You were eliminated! Respawning...", type: 'info' });
      } else if (user.uid === data.killerId) {
        setNotification({ message: "Enemy eliminated!", type: 'kill' });
      }
    });

    socket.on('territoryAdded', (t: Territory) => {
      setTerritories(prev => [...prev, t]);
    });

    socket.on('treasureAdded', (t: Treasure) => {
      setTreasures(prev => [...prev, t]);
    });

    socket.on('treasureCollected', (data: { id: string, collectorId: string, coins: number }) => {
      setTreasures(prev => prev.filter(t => t.id !== data.id));
      if (data.collectorId === user.uid) {
        setNotification({ message: `Collected ${data.coins} Box Coins!`, type: 'info' });
      }
    });

    socket.on('leaderboardUpdated', (data: Squad[]) => {
      setLeaderboard(data);
      setSquads(data);
    });

    socket.on('explosion', (data: { lat: number, lng: number, radius: number }) => {
      const attackId = `exp_${Date.now()}_${Math.random()}`;
      setAttacks(prev => [...prev, {
        id: attackId,
        attackerId: 'system',
        targetId: 'area',
        fromLat: data.lat,
        fromLng: data.lng,
        toLat: data.lat,
        toLng: data.lng,
        timestamp: Date.now(),
        type: 'grenade'
      }]);
      setTimeout(() => setAttacks(prev => prev.filter(a => a.id !== attackId)), 2000);
    });

    return () => {
      socket.off('initData');
      socket.off('playerJoined');
      socket.off('playerMoved');
      socket.off('playerLeft');
      socket.off('statsUpdated');
      socket.off('playerHit');
      socket.off('playerKilled');
      socket.off('territoryAdded');
      socket.off('treasureAdded');
      socket.off('treasureCollected');
      socket.off('leaderboardUpdated');
      socket.off('explosion');
    };
  }, [isAuthReady, activeLocation?.lat, activeLocation?.lng, gameStarted]);

  // Movement emission
  useEffect(() => {
    if (!gameStarted || !isAuthReady || !activeLocation) return;
    const user = auth.currentUser;
    if (!user) return;

    const intervalId = setInterval(() => {
      socket.emit('move', { lat: activeLocation.lat, lng: activeLocation.lng });
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isAuthReady, activeLocation?.lat, activeLocation?.lng, gameStarted]);

  const moveTo = (lat: number, lng: number) => {
    socket.emit('move', { lat, lng });
  };

  const fireWeapon = (targetLatLng: { latitude: number, longitude: number } | null, useMissile: boolean = false) => {
    if (!currentUser || currentUser.health <= 0) return;
    
    if (useMissile) {
      socket.emit('launchMissile');
    } else {
      // Find nearest player to target
      let targetId: string | null = null;
      let minPlayerDist = 50; // 50m radius for gun

      if (targetLatLng) {
        players.forEach(p => {
          const distToCrosshair = getDistance(targetLatLng, { latitude: p.lat, longitude: p.lng });
          const distToPlayer = getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: p.lat, longitude: p.lng });
          if (distToCrosshair < minPlayerDist && distToPlayer <= 100) {
            minPlayerDist = distToCrosshair;
            targetId = p.uid;
          }
        });
      }

      if (targetId) {
        socket.emit('attackGun', { targetId });
      } else {
        // Visual effect for miss
        if (targetLatLng) {
          const attackId = `atk_${Date.now()}_miss`;
          setAttacks(prev => [...prev, {
            id: attackId,
            attackerId: currentUser.uid,
            targetId: 'miss',
            fromLat: currentUser.lat,
            fromLng: currentUser.lng,
            toLat: targetLatLng.latitude,
            toLng: targetLatLng.longitude,
            timestamp: Date.now(),
            type: 'bullet'
          }]);
          setTimeout(() => setAttacks(prev => prev.filter(a => a.id !== attackId)), 500);
        }
      }
    }
  };

  const throwGrenade = (targetLat: number, targetLng: number) => {
    if (!currentUser || currentUser.health <= 0) return;
    socket.emit('throwGrenade', { targetLat, targetLng });
  };

  const attackPlayer = (targetId: string) => {
    if (!currentUser || currentUser.health <= 0) return;
    socket.emit('attack', { targetId });
  };

  const collectTreasure = (treasure: Treasure) => {
    if (!currentUser || currentUser.health <= 0) return;
    socket.emit('collectTreasure', { id: treasure.id });
  };

  const buyItem = (type: string, cost: number) => {
    if (!currentUser) return;
    socket.emit('buyItem', { type, cost });
  };

  const purchaseTerritory = () => {
    if (!currentUser) return;
    socket.emit('buyTerritory');
  };

  const addTestCoins = () => {
    socket.emit('addTestCoins');
  };

  const updateAvatar = (avatar: string) => {
    socket.emit('updateAvatar', { photoURL: avatar });
  };

  const completeTutorial = () => {
    socket.emit('completeTutorial');
  };

  const spawnBots = (count: number = 10) => {
    if (!currentUser) return;
    socket.emit('spawnBots', { lat: currentUser.lat, lng: currentUser.lng, count });
  };

  const spawnTenBots = () => {
    if (!currentUser) return;
    socket.emit('spawnBots', { lat: currentUser.lat, lng: currentUser.lng, count: 10 });
  };

  const spawnTestEntities = () => {
    if (!currentUser) return;
    socket.emit('spawnBots', { lat: currentUser.lat, lng: currentUser.lng, count: 5 });
  };

  const createSquad = (name: string, avatarUrl: string) => {
    socket.emit('createSquad', { name, avatarUrl });
  };

  const joinSquad = (squadId: string) => {
    socket.emit('joinSquad', { squadId });
  };

  const leaveSquad = () => {
    socket.emit('leaveSquad');
  };

  return {
    currentUser,
    players,
    territories,
    treasures,
    squads,
    leaderboard,
    attacks,
    notification,
    location: activeLocation,
    isAuthReady,
    fireWeapon,
    throwGrenade,
    attackPlayer,
    collectTreasure,
    buyItem,
    purchaseTerritory,
    addTestCoins,
    updateAvatar,
    completeTutorial,
    spawnBots,
    spawnTenBots,
    spawnTestEntities,
    moveTo,
    createSquad,
    joinSquad,
    leaveSquad,
    enterFailSafeMode,
    isQuotaExceeded: false
  };
};
