import { useState, useEffect, useRef } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, getDocs, getDoc, serverTimestamp, increment, DocumentSnapshot, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, Squad, Treasure, Territory, Attack } from '../types';
import { useGeolocation } from './useGeolocation';
import { getDistance } from 'geolib';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setQuotaExceeded?: (val: boolean) => void) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  if (errorMessage.includes('resource-exhausted') || errorMessage.includes('Quota exceeded')) {
    console.warn("Firestore Quota Exceeded. Background writes paused.");
    if (setQuotaExceeded) setQuotaExceeded(true);
    // Do not throw for quota errors to prevent app crashes
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid || '',
      email: auth.currentUser?.email || '',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const useGameData = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [treasures, setTreasures] = useState<Treasure[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const { location } = useGeolocation();
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthReady(!!user);
    });
    return () => unsub();
  }, []);

  // Listen to current user
  useEffect(() => {
    if (!isAuthReady) return;
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as User;
        
        // Migrate old users
        let needsUpdate = false;
        const updates: any = {};
        
        if (data.ammo === undefined) { updates.ammo = 50; needsUpdate = true; data.ammo = 50; }
        if (data.coins === undefined) { updates.coins = 10000; needsUpdate = true; data.coins = 10000; }
        if (data.gunQuality === undefined) { updates.gunQuality = 'cheap'; needsUpdate = true; data.gunQuality = 'cheap'; }
        if (data.autoMissiles === undefined) { updates.autoMissiles = 5; needsUpdate = true; data.autoMissiles = 5; }
        if (data.grenades === undefined) { updates.grenades = 5; needsUpdate = true; data.grenades = 5; }
        if (data.territoryCount === undefined) { updates.territoryCount = 0; needsUpdate = true; data.territoryCount = 0; }
        if (data.onlineStatus === undefined) { updates.onlineStatus = true; needsUpdate = true; data.onlineStatus = true; }
        if (data.squadId === undefined || data.squadId === null) { updates.squadId = 'squad_general'; needsUpdate = true; data.squadId = 'squad_general'; }
        
        // If user has old health (100), update to 10000
        if (data.health === 100) { updates.health = 10000; needsUpdate = true; data.health = 10000; }
        
        if (needsUpdate) {
          updateDoc(doc(db, 'users', user.uid), updates).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`, setIsQuotaExceeded));
        }
        
        setCurrentUser(data);
      } else {
        // Create initial user
        const newUser: User = {
          uid: user.uid,
          displayName: user.displayName || 'Unknown Player',
          photoURL: user.photoURL || '',
          lat: location?.lat || 0,
          lng: location?.lng || 0,
          lastActive: new Date().toISOString(),
          health: 10000,
          ammo: 50,
          coins: 10000, // Starting coins
          gunQuality: 'cheap',
          autoMissiles: 5, // Starting missiles
          grenades: 5, // Starting grenades
          territoryCount: 0,
          onlineStatus: true,
          squadId: 'squad_general' // Auto-assign to general squad
        };

        // Ensure general squad exists
        const generalSquadDoc = await getDoc(doc(db, 'squads', 'squad_general'));
        if (!generalSquadDoc.exists()) {
          await setDoc(doc(db, 'squads', 'squad_general'), {
            id: 'squad_general',
            name: 'General Squad',
            leaderId: 'system',
            score: 0,
            territoryCount: 0,
            avatarUrl: '🛡️'
          });
        }

        setDoc(doc(db, 'users', user.uid), newUser, { merge: true }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`, setIsQuotaExceeded));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`, setIsQuotaExceeded));
    return () => unsub();
  }, [isAuthReady]);

  // Update location and online status (Throttled)
  const lastPos = useRef<{ lat: number, lng: number, time: number } | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    const user = auth.currentUser;
    if (!user) return;

    // Set online on mount
    updateDoc(doc(db, 'users', user.uid), {
      onlineStatus: true,
      lastActive: new Date().toISOString()
    }).catch(e => console.error("Error setting online status:", e));

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateDoc(doc(db, 'users', user.uid), {
          onlineStatus: false,
          lastActive: new Date().toISOString()
        }).catch(e => console.error("Error setting offline status:", e));
      } else {
        updateDoc(doc(db, 'users', user.uid), {
          onlineStatus: true,
          lastActive: new Date().toISOString()
        }).catch(e => console.error("Error setting online status:", e));
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', () => {
      updateDoc(doc(db, 'users', user.uid), {
        onlineStatus: false,
        lastActive: new Date().toISOString()
      }).catch(e => console.error("Error setting offline status:", e));
    });

    const intervalId = setInterval(() => {
      if (!location) return;

      // Anti-cheat: Check for unrealistic jumps
      if (lastPos.current) {
        const dist = getDistance(
          { latitude: lastPos.current.lat, longitude: lastPos.current.lng },
          { latitude: location.lat, longitude: location.lng }
        );
        const timeDiff = (Date.now() - lastPos.current.time) / 1000;
        const speed = dist / timeDiff; // meters per second

        if (speed > 100) { // More than 100m/s (360km/h) is suspicious for a walking/running game
          console.warn("Suspicious movement detected:", speed, "m/s");
          // In a real app, we might flag the user or ignore the update
        }
      }

      updateDoc(doc(db, 'users', user.uid), {
        lat: location.lat,
        lng: location.lng,
        lastActive: new Date().toISOString(),
        onlineStatus: true
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`, setIsQuotaExceeded));

      lastPos.current = { lat: location.lat, lng: location.lng, time: Date.now() };
    }, 20000); // Update every 20 seconds to save quota

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      updateDoc(doc(db, 'users', user.uid), {
        onlineStatus: false,
        lastActive: new Date().toISOString()
      }).catch(e => console.error("Error setting offline status:", e));
    };
  }, [location?.lat, location?.lng, isAuthReady]);

  // Listen to all players (for prototype, we fetch all. In prod, use geohashes)
  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const p: User[] = [];
      snapshot.forEach(d => {
        const data = d.data() as User;
        // Sanitize Dicebear URLs from legacy data
        if (data.photoURL && data.photoURL.includes('dicebear.com')) {
          data.photoURL = '🤖';
        }
        p.push(data);
      });
      setPlayers(p);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    return () => unsub();
  }, [isAuthReady]);

  // Listen to squads
  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = onSnapshot(collection(db, 'squads'), (snapshot) => {
      const s: Squad[] = [];
      snapshot.forEach(d => {
        const data = d.data() as Squad;
        // Sanitize Dicebear URLs from legacy data
        if (data.avatarUrl && data.avatarUrl.includes('dicebear.com')) {
          data.avatarUrl = '🛡️';
        }
        s.push(data);
      });
      setSquads(s);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'squads'));
    return () => unsub();
  }, [isAuthReady]);

  // Listen to treasures
  useEffect(() => {
    if (!isAuthReady) return;
    const q = query(collection(db, 'treasures'), where('active', '==', true));
    const unsub = onSnapshot(q, (snapshot) => {
      const t: Treasure[] = [];
      snapshot.forEach(d => t.push(d.data() as Treasure));
      setTreasures(t);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'treasures'));
    return () => unsub();
  }, [isAuthReady]);

  // Listen to territories
  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = onSnapshot(collection(db, 'territories'), (snapshot) => {
      const t: Territory[] = [];
      snapshot.forEach(d => t.push(d.data() as Territory));
      setTerritories(t);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'territories'));
    return () => unsub();
  }, [isAuthReady]);

  // Listen to attacks
  useEffect(() => {
    if (!isAuthReady) return;
    // We only want recent attacks. To avoid complex indexing, we just listen to all and filter locally, 
    // or limit to last 20. Since it's a prototype, we'll just fetch all and filter.
    // In a real app, we'd use a query with timestamp and limit.
    const unsub = onSnapshot(collection(db, 'attacks'), (snapshot) => {
      const a: Attack[] = [];
      const now = Date.now();
      snapshot.forEach(d => {
        const data = d.data() as Attack;
        // Only keep attacks from the last 5 seconds
        if (data.timestamp && data.timestamp.toMillis) {
          if (now - data.timestamp.toMillis() < 5000) {
            a.push(data);
          }
        } else {
          // If timestamp is pending (serverTimestamp), it's new
          a.push(data);
        }
      });
      setAttacks(a);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attacks'));
    return () => unsub();
  }, [isAuthReady]);

  // Bot movement logic
  const playersRef = useRef(players);
  const territoriesRef = useRef(territories);
  
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    territoriesRef.current = territories;
  }, [territories]);

  useEffect(() => {
    if (!currentUser || isQuotaExceeded) return;
    
    const interval = setInterval(() => {
      if (isQuotaExceeded) return;
      const currentPlayers = playersRef.current;
      const currentTerritories = territoriesRef.current;
      
      // Only the "leader" (player with smallest UID) moves the bots to avoid conflicts
      const activePlayers = currentPlayers.filter(p => {
        const lastActive = new Date(p.lastActive).getTime();
        return Date.now() - lastActive < 10000; // Only consider players active in last 10s
      });
      const leader = activePlayers.sort((a, b) => a.uid.localeCompare(b.uid))[0];
      
      if (!leader || leader.uid !== currentUser.uid) return;

      const bots = currentPlayers.filter(p => p.uid.startsWith('bot_') && p.health > 0);
      
      bots.forEach(async (bot) => {
        try {
          // 1. Find nearest enemy
          const enemies = currentPlayers.filter(p => p.uid !== bot.uid && p.squadId !== bot.squadId && p.health > 0);
          let nearestEnemy: User | null = null;
          let minEnemyDist = Infinity;

          for (const e of enemies) {
            const d = getDistance({latitude: bot.lat, longitude: bot.lng}, {latitude: e.lat, longitude: e.lng});
            if (d < minEnemyDist) {
              minEnemyDist = d;
              nearestEnemy = e;
            }
          }

          // 2. Find nearest unowned/enemy territory
          const targetTerritories = currentTerritories.filter(t => t.ownerSquadId !== bot.squadId);
          let nearestTerritory: Territory | null = null;
          let minTerritoryDist = Infinity;

          for (const t of targetTerritories) {
            const d = getDistance({latitude: bot.lat, longitude: bot.lng}, {latitude: t.lat, longitude: t.lng});
            if (d < minTerritoryDist) {
              minTerritoryDist = d;
              nearestTerritory = t;
            }
          }

          let actionTaken = false;

          // 3. Combat Logic: Attack if enemy is close
          if (nearestEnemy) {
            if (minEnemyDist < 50) {
              // Standard attack using transaction
              await runTransaction(db, async (transaction) => {
                const enemyRef = doc(db, 'users', nearestEnemy!.uid);
                const enemyDoc = await transaction.get(enemyRef);
                if (!enemyDoc.exists()) return;
                const enemyData = enemyDoc.data() as User;
                if (enemyData.health <= 0) return;

                const newHealth = Math.max(0, enemyData.health - 200);
                transaction.update(enemyRef, { health: newHealth });

                // Create attack record for animation
                const attackId = `atk_${Date.now()}_${bot.uid}`;
                const attackRef = doc(db, 'attacks', attackId);
                transaction.set(attackRef, {
                  id: attackId,
                  attackerId: bot.uid,
                  targetId: nearestEnemy!.uid,
                  fromLat: bot.lat,
                  fromLng: bot.lng,
                  toLat: nearestEnemy!.lat,
                  toLng: nearestEnemy!.lng,
                  timestamp: serverTimestamp(),
                  type: 'bullet'
                });
              });
              actionTaken = true;
            } else if (minEnemyDist < 150 && Math.random() < 0.2) {
              // GRENADE ATTACK (20% chance if in range) using transaction
              await runTransaction(db, async (transaction) => {
                const enemyRef = doc(db, 'users', nearestEnemy!.uid);
                const enemyDoc = await transaction.get(enemyRef);
                if (!enemyDoc.exists()) return;
                const enemyData = enemyDoc.data() as User;
                if (enemyData.health <= 0) return;

                const newHealth = Math.max(0, enemyData.health - 1000);
                transaction.update(enemyRef, { health: newHealth });

                const attackId = `atk_grenade_${Date.now()}_${bot.uid}`;
                const attackRef = doc(db, 'attacks', attackId);
                transaction.set(attackRef, {
                  id: attackId,
                  attackerId: bot.uid,
                  targetId: nearestEnemy!.uid,
                  fromLat: bot.lat,
                  fromLng: bot.lng,
                  toLat: nearestEnemy!.lat,
                  toLng: nearestEnemy!.lng,
                  timestamp: serverTimestamp(),
                  type: 'grenade'
                });
              });
              actionTaken = true;
            }
          } 
          
          // 4. Territory Logic: Capture if close (< 200m)
          if (!actionTaken && nearestTerritory && minTerritoryDist < 200) {
            await runTransaction(db, async (transaction) => {
              const territoryRef = doc(db, 'territories', nearestTerritory!.id);
              const territoryDoc = await transaction.get(territoryRef);
              if (!territoryDoc.exists()) return;
              if (territoryDoc.data().ownerSquadId === bot.squadId) return;

              transaction.update(territoryRef, {
                ownerSquadId: bot.squadId
              });
            });
            actionTaken = true;
          }

          // 5. Movement Logic (Cover, Flanking, Patrol)
          if (!actionTaken) {
            let targetLat = bot.lat;
            let targetLng = bot.lng;

            const isLowHealth = bot.health < 3000;

            if (isLowHealth && nearestEnemy) {
              // TAKE COVER: Move away from nearest enemy
              const latDiff = bot.lat - nearestEnemy.lat;
              const lngDiff = bot.lng - nearestEnemy.lng;
              targetLat = bot.lat + latDiff;
              targetLng = bot.lng + lngDiff;
            } else if (nearestEnemy && minEnemyDist < 500) {
              // FLANKING: Move to a position offset from the enemy
              const angle = Math.atan2(bot.lat - nearestEnemy.lat, bot.lng - nearestEnemy.lng);
              const flankAngle = angle + (Math.random() > 0.5 ? Math.PI / 4 : -Math.PI / 4); // 45 degrees offset
              targetLat = nearestEnemy.lat + Math.sin(flankAngle) * 100 / 111320;
              targetLng = nearestEnemy.lng + Math.cos(flankAngle) * 100 / (111320 * Math.cos(nearestEnemy.lat * Math.PI / 180));
            } else if (nearestTerritory && minTerritoryDist < 3000) {
              targetLat = nearestTerritory.lat;
              targetLng = nearestTerritory.lng;
            } else if (nearestEnemy && minEnemyDist < 2000) {
              targetLat = nearestEnemy.lat;
              targetLng = nearestEnemy.lng;
            } else {
              // Patrol randomly
              targetLat = bot.lat + (Math.random() - 0.5) * 0.02;
              targetLng = bot.lng + (Math.random() - 0.5) * 0.02;
            }

            const latDiff = targetLat - bot.lat;
            const lngDiff = targetLng - bot.lng;
            const dist = Math.sqrt(latDiff*latDiff + lngDiff*lngDiff);
            
            let newLat = bot.lat;
            let newLng = bot.lng;

            if (dist > 0) {
              // Move approx 20m per tick (slightly faster bots)
              const step = Math.min(0.0002, dist); 
              newLat += (latDiff / dist) * step;
              newLng += (lngDiff / dist) * step;
            }

          // Only update if moved significantly to reduce Firestore writes
            // Increased threshold to ~5 meters
            if (Math.abs(newLat - bot.lat) > 0.00005 || Math.abs(newLng - bot.lng) > 0.00005) {
              await updateDoc(doc(db, 'users', bot.uid), {
                lat: newLat,
                lng: newLng
                // Removed lastActive update for bots to reduce conflicts
              }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${bot.uid}`, setIsQuotaExceeded));
            }
          }
        } catch (error) {
          // Ignore errors for bot movement to avoid spamming console if deleted
        }
      });
    }, 60000); // Move every 60 seconds to save quota

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // Automatic Treasure Spawner
  useEffect(() => {
    if (!currentUser || !currentUser.lat || !currentUser.lng || isQuotaExceeded) return;

    const checkAndSpawnTreasures = async () => {
      try {
        const spawnerRef = doc(db, 'system', 'spawner');
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        let shouldSpawn = false;

        await runTransaction(db, async (transaction) => {
          const spawnerDoc = await transaction.get(spawnerRef);
          
          if (!spawnerDoc.exists()) {
            shouldSpawn = true;
          } else {
            const data = spawnerDoc.data();
            if (!data.lastTreasureSpawn || now - data.lastTreasureSpawn > oneHour) {
              shouldSpawn = true;
            }
          }

          // Also check if map is empty (less than 50 treasures)
          // Note: We can't easily check collection size inside a transaction without fetching all docs,
          // so we'll rely on the timestamp check mostly, but we can do a quick check outside if needed.
          // For now, let's just use the timestamp to prevent double-spawning.
          
          if (shouldSpawn) {
            transaction.set(spawnerRef, { lastTreasureSpawn: now }, { merge: true });
          }
        });

        if (shouldSpawn) {
          // Spawn 10 new treasures (reduced from 50 to save quota)
          for (let i = 0; i < 10; i++) {
            const newId = `treasure_${now}_${i}`;
            
            // 50% chance to spawn globally, 50% chance to spawn within ~50km of the player
            const isGlobal = Math.random() > 0.5;
            let lat, lng;
            
            if (isGlobal) {
              lat = (Math.random() - 0.5) * 160; // -80 to 80
              lng = (Math.random() - 0.5) * 360; // -180 to 180
            } else {
              // ~50km radius
              lat = currentUser.lat + (Math.random() - 0.5) * 1;
              lng = currentUser.lng + (Math.random() - 0.5) * 1;
            }
            
            await setDoc(doc(db, 'treasures', newId), {
              id: newId,
              lat,
              lng,
              coins: Math.floor(Math.random() * 50) + 10, // 10-60 coins
              active: true,
              createdAt: new Date().toISOString()
            }).catch(e => handleFirestoreError(e, OperationType.CREATE, `treasures/${newId}`, setIsQuotaExceeded));
          }
          console.log("Spawned 10 new treasures.");
        }
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          console.log("Client is offline, skipping treasure spawn check.");
          return;
        }
        handleFirestoreError(error, OperationType.GET, 'system/spawner', setIsQuotaExceeded);
      }
    };

    // Wait a few seconds for Firebase connection to establish before first check
    const timeout = setTimeout(() => {
      if (navigator.onLine && !isQuotaExceeded) {
        checkAndSpawnTreasures();
      }
    }, 5000);
    
    const interval = setInterval(() => {
      if (navigator.onLine && !isQuotaExceeded) {
        checkAndSpawnTreasures();
      }
    }, 3600000); // Check every 1 hour to save quota
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [currentUser?.uid, currentUser?.lat, currentUser?.lng]);

  // Weekly Competition Logic
  useEffect(() => {
    if (!currentUser || !isAuthReady || isQuotaExceeded) return;

    const checkWeeklyReset = async () => {
      if (isQuotaExceeded) return;
      try {
        const competitionRef = doc(db, 'system', 'competition');
        const now = new Date();
        const startOfWeek = new Date(now.getTime());
        startOfWeek.setUTCHours(0, 0, 0, 0);
        startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay()); // Sunday as start of week

        await runTransaction(db, async (transaction) => {
          const compDoc = await transaction.get(competitionRef);
          let lastReset = null;
          
          if (compDoc.exists()) {
            lastReset = compDoc.data().lastReset;
          }

          if (!lastReset || new Date(lastReset) < startOfWeek) {
            // Only the leader performs the reset
            const activePlayers = players.filter(p => {
              const lastActive = new Date(p.lastActive).getTime();
              return Date.now() - lastActive < 60000;
            });
            const leader = activePlayers.sort((a, b) => a.uid.localeCompare(b.uid))[0];
            if (leader && leader.uid === currentUser.uid) {
              console.log("Weekly reset triggered by leader:", currentUser.displayName);
              
              // 1. Determine winner
              const sortedSquads = [...squads].sort((a, b) => (b.territoryCount || 0) - (a.territoryCount || 0));
              const winner = sortedSquads[0];

              // 2. Update squads
              for (const s of squads) {
                const sRef = doc(db, 'squads', s.id);
                transaction.update(sRef, {
                  territoryCount: 0,
                  isWeeklyWinner: winner && s.id === winner.id
                });
              }

              // 3. Update users
              for (const p of players) {
                const pRef = doc(db, 'users', p.uid);
                transaction.update(pRef, { territoryCount: 0 });
              }

              // 4. Delete all territories
              const territoryDocs = await getDocs(collection(db, 'territories'));
              territoryDocs.forEach(d => {
                transaction.delete(doc(db, 'territories', d.id));
              });

              // 5. Update reset timestamp
              transaction.set(competitionRef, { lastReset: now.toISOString() }, { merge: true });
            }
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'system/competition', setIsQuotaExceeded);
      }
    };

    const interval = setInterval(checkWeeklyReset, 3600000); // Check every 1 hour to save quota
    checkWeeklyReset();
    return () => clearInterval(interval);
  }, [currentUser?.uid, isAuthReady, players.length, squads.length, isQuotaExceeded]);

  const throwGrenade = async (targetLat: number, targetLng: number) => {
    if (!currentUser) return;
    if (currentUser.health <= 0) {
      alert("You are eliminated!");
      return;
    }
    if (currentUser.grenades <= 0) {
      alert("Out of grenades!");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const attackerRef = doc(db, 'users', currentUser.uid);
        const attackerDoc = await transaction.get(attackerRef);
        if (!attackerDoc.exists()) throw new Error("Attacker not found");
        const attackerData = attackerDoc.data() as User;

        if (attackerData.grenades <= 0) throw new Error("Out of grenades");

        // 1. Find all enemies within 100m of target
        const radius = 100; // 100 meters
        const splashDamage = 2000;

        const enemies = players.filter(p => 
          p.uid !== currentUser.uid && 
          p.squadId !== currentUser.squadId && 
          p.health > 0 &&
          p.onlineStatus === true && // ONLY damage online players
          getDistance({ latitude: targetLat, longitude: targetLng }, { latitude: p.lat, longitude: p.lng }) <= radius
        );

        // 2. Fetch all enemy docs BEFORE any writes
        const enemyDocs = await Promise.all(enemies.map(enemy => transaction.get(doc(db, 'users', enemy.uid))));

        // 3. Deduct grenade
        transaction.update(attackerRef, { grenades: increment(-1) });

        // 4. Create attack record for explosion animation
        const attackId = `grenade_${Date.now()}_${currentUser.uid}`;
        const attackRef = doc(db, 'attacks', attackId);
        transaction.set(attackRef, {
          id: attackId,
          attackerId: currentUser.uid,
          targetId: 'splash_damage', // Special ID for splash
          fromLat: currentUser.lat,
          fromLng: currentUser.lng,
          toLat: targetLat,
          toLng: targetLng,
          timestamp: serverTimestamp(),
          type: 'grenade'
        });

        // 5. Update enemy health and handle kills
        for (const enemyDoc of enemyDocs) {
          if (enemyDoc.exists()) {
            const enemyData = enemyDoc.data() as User;
            const enemyRef = doc(db, 'users', enemyData.uid);
            const newHealth = Math.max(0, enemyData.health - splashDamage);
            
            if (newHealth === 0) {
              // Handle Kill
              transaction.update(attackerRef, { coins: increment(500) }); // More coins for kill
              if (attackerData.squadId) {
                const squadRef = doc(db, 'squads', attackerData.squadId);
                transaction.update(squadRef, { score: increment(1000) });
              }

              // Transfer Territories
              const victimTerritories = territories.filter(t => t.ownerId === enemyData.uid);
              for (const t of victimTerritories) {
                const tRef = doc(db, 'territories', t.id);
                transaction.update(tRef, {
                  ownerId: currentUser.uid,
                  ownerSquadId: currentUser.squadId || 'squad_general'
                });
              }

              if (victimTerritories.length > 0) {
                transaction.update(attackerRef, { territoryCount: increment(victimTerritories.length) });
                transaction.update(enemyRef, { territoryCount: 0 });
                
                if (attackerData.squadId) {
                  const aSquadRef = doc(db, 'squads', attackerData.squadId);
                  transaction.update(aSquadRef, { territoryCount: increment(victimTerritories.length) });
                }
                if (enemyData.squadId) {
                  const vSquadRef = doc(db, 'squads', enemyData.squadId);
                  transaction.update(vSquadRef, { territoryCount: increment(-victimTerritories.length) });
                }
              }

              if (enemyData.uid.startsWith('bot_')) {
                transaction.delete(enemyRef);
              } else {
                transaction.update(enemyRef, { health: 0 });
              }
            } else {
              transaction.update(enemyRef, { health: newHealth });
            }
          }
        }
      });
    } catch (error: any) {
      console.error("Grenade failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const fireWeapon = async (targetLatLng: { latitude: number, longitude: number } | null, useMissile: boolean = false) => {
    if (!currentUser) return;

    const executeFire = async (retries = 5) => {
      if (currentUser.health <= 0) {
        alert("You are eliminated! Buy a health pack from the shop to respawn.");
        return;
      }
      if (!useMissile && currentUser.ammo <= 0) {
        alert("Out of ammo!");
        return;
      }
      if (useMissile && currentUser.autoMissiles <= 0) {
        alert("Out of missiles!");
        return;
      }

      try {
        await runTransaction(db, async (transaction) => {
          const attackerRef = doc(db, 'users', currentUser.uid);
          const attackerDoc = await transaction.get(attackerRef);
          if (!attackerDoc.exists()) throw new Error("Attacker does not exist");
          const attackerData = attackerDoc.data() as User;

          // Find target
          let target: User | null = null;
          const enemies = players.filter(p => 
            p.uid !== currentUser.uid && 
            p.squadId !== currentUser.squadId && 
            p.health > 0 &&
            p.onlineStatus === true // ONLY attack online players
          );

          if (useMissile) {
            // Auto-target nearest enemy within 1000m
            let minPlayerDist = Infinity;
            for (const enemy of enemies) {
              const distToPlayer = getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: enemy.lat, longitude: enemy.lng });
              if (distToPlayer < 1000 && distToPlayer < minPlayerDist) {
                // Check shield
                if (!(enemy.shieldUntil && new Date(enemy.shieldUntil) > new Date())) {
                  minPlayerDist = distToPlayer;
                  target = enemy;
                }
              }
            }
            if (!target) {
              alert("No target found for missile! Target must be within 1000m.");
              return;
            }
          } else if (targetLatLng) {
            // Manual aim within 100m
            let minCrosshairDist = Infinity;
            for (const enemy of enemies) {
              const distToCrosshair = getDistance(targetLatLng, { latitude: enemy.lat, longitude: enemy.lng });
              const distToPlayer = getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: enemy.lat, longitude: enemy.lng });
              if (distToCrosshair < 50 && distToPlayer < 100) {
                if (distToCrosshair < minCrosshairDist) {
                  // Check shield
                  if (!(enemy.shieldUntil && new Date(enemy.shieldUntil) > new Date())) {
                    minCrosshairDist = distToCrosshair;
                    target = enemy;
                  }
                }
              }
            }
          }

          // Decrease ammo/missiles ALWAYS if we fire
          if (useMissile) {
            if (attackerData.autoMissiles <= 0) throw new Error("Out of missiles");
            transaction.update(attackerRef, { autoMissiles: increment(-1) });
          } else {
            if (attackerData.ammo <= 0) throw new Error("Out of ammo");
            transaction.update(attackerRef, { ammo: increment(-1) });
          }

          let finalToLat = targetLatLng?.latitude || currentUser.lat;
          let finalToLng = targetLatLng?.longitude || currentUser.lng;
          let targetId = 'miss';

          if (target) {
            const enemyRef = doc(db, 'users', target.uid);
            const enemyDoc = await transaction.get(enemyRef);
            if (enemyDoc.exists()) {
              const enemyData = enemyDoc.data() as User;
              if (enemyData.health > 0) {
                let damage = useMissile ? 3000 : 500;
                if (!useMissile) {
                  if (attackerData.gunQuality === 'standard') damage = 500;
                  if (attackerData.gunQuality === 'expensive') damage = 1000;
                  if (attackerData.gunQuality === 'elite') damage = 2000;
                  
                  // Territory advantage
                  const inOwnedTerritory = territories.some(t => 
                    t.ownerSquadId === attackerData.squadId && 
                    getDistance({ latitude: attackerData.lat, longitude: attackerData.lng }, { latitude: t.lat, longitude: t.lng }) <= 500
                  );
                  if (inOwnedTerritory) damage *= 2;

                  const inEnemyTerritory = territories.some(t => 
                    t.ownerSquadId === enemyData.squadId && 
                    getDistance({ latitude: attackerData.lat, longitude: attackerData.lng }, { latitude: t.lat, longitude: t.lng }) <= 500
                  );
                  if (inEnemyTerritory) damage = Math.floor(damage / 2);
                }
                
                const newEnemyHealth = Math.max(0, enemyData.health - damage);
                
                if (newEnemyHealth === 0) {
                  // Handle Kill
                  transaction.update(attackerRef, { 
                    coins: increment(500),
                    territoryCount: increment(0) // Placeholder to ensure field exists
                  });
                  
                  if (attackerData.squadId) {
                    const squadRef = doc(db, 'squads', attackerData.squadId);
                    transaction.update(squadRef, { score: increment(1000) });
                  }

                  // Transfer Territories
                  const victimTerritories = territories.filter(t => t.ownerId === target.uid);
                  for (const t of victimTerritories) {
                    const tRef = doc(db, 'territories', t.id);
                    transaction.update(tRef, {
                      ownerId: currentUser.uid,
                      ownerSquadId: currentUser.squadId || 'squad_general'
                    });
                  }

                  if (victimTerritories.length > 0) {
                    transaction.update(attackerRef, { territoryCount: increment(victimTerritories.length) });
                    transaction.update(enemyRef, { territoryCount: 0 });
                    
                    if (attackerData.squadId) {
                      const aSquadRef = doc(db, 'squads', attackerData.squadId);
                      transaction.update(aSquadRef, { territoryCount: increment(victimTerritories.length) });
                    }
                    if (enemyData.squadId) {
                      const vSquadRef = doc(db, 'squads', enemyData.squadId);
                      transaction.update(vSquadRef, { territoryCount: increment(-victimTerritories.length) });
                    }
                  }

                  if (enemyData.uid.startsWith('bot_')) {
                    transaction.delete(enemyRef);
                  } else {
                    transaction.update(enemyRef, { health: 0 });
                  }
                } else {
                  transaction.update(enemyRef, { health: newEnemyHealth });
                }
                
                finalToLat = enemyData.lat;
                finalToLng = enemyData.lng;
                targetId = target.uid;

                // Bot retaliation logic (triggered after transaction)
                if (enemyData.uid.startsWith('bot_') && newEnemyHealth > 0) {
                  setTimeout(async () => {
                    try {
                      await runTransaction(db, async (retalTx) => {
                        const pDoc = await retalTx.get(attackerRef);
                        if (!pDoc.exists()) return;
                        const pData = pDoc.data() as User;
                        if (pData.health <= 0) return;
                        if (pData.shieldUntil && new Date(pData.shieldUntil) > new Date()) return;

                        const botDamage = 200 + Math.floor(Math.random() * 300);
                        const pNewHealth = Math.max(0, pData.health - botDamage);
                        retalTx.update(attackerRef, { health: pNewHealth });
                        
                        const bAtkId = `atk_${Date.now()}_${target.uid}`;
                        const bAtkRef = doc(db, 'attacks', bAtkId);
                        retalTx.set(bAtkRef, {
                          id: bAtkId,
                          attackerId: target.uid,
                          targetId: currentUser.uid,
                          fromLat: enemyData.lat,
                          fromLng: enemyData.lng,
                          toLat: currentUser.lat,
                          toLng: currentUser.lng,
                          timestamp: serverTimestamp(),
                          type: 'bullet'
                        });
                      });
                    } catch (e) {
                      console.error("Bot retaliation failed:", e);
                    }
                  }, 600);
                }
              }
            }
          }

          // Create attack record
          const attackId = `atk_${Date.now()}_${currentUser.uid}`;
          const attackRef = doc(db, 'attacks', attackId);
          transaction.set(attackRef, {
            id: attackId,
            attackerId: currentUser.uid,
            targetId: targetId,
            fromLat: currentUser.lat,
            fromLng: currentUser.lng,
            toLat: finalToLat,
            toLng: finalToLng,
            timestamp: serverTimestamp(),
            type: useMissile ? 'missile' : 'bullet'
          });
        });
      } catch (error: any) {
        if (retries > 0 && (error.message?.includes('version') || error.message?.includes('match') || error.message?.includes('aborted') || error.message?.includes('contention'))) {
          const delay = (6 - retries) * 200 + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeFire(retries - 1);
        }
        console.error("Fire failed:", error);
        handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    };

    await executeFire();
  };

  const collectTreasure = async (treasure: Treasure) => {
    if (!currentUser || isQuotaExceeded) return;
    if (currentUser.health <= 0) {
      alert("You are eliminated! Buy a health pack from the shop to respawn.");
      return;
    }

    try {
      const distance = getDistance(
        { latitude: currentUser.lat, longitude: currentUser.lng },
        { latitude: treasure.lat, longitude: treasure.lng }
      );

      if (distance > 100) { 
        alert("You are too far away to collect this treasure! Get closer (within 100m).");
        return;
      }

      // Add coins
      const updates: any = {
        coins: increment(treasure.coins)
      };

      // 20% chance to find a grenade in treasure
      let foundGrenade = false;
      if (Math.random() < 0.2) {
        updates.grenades = increment(1);
        foundGrenade = true;
      }

      // Use a transaction to ensure treasure is only collected once
      await runTransaction(db, async (transaction) => {
        const treasureRef = doc(db, 'treasures', treasure.id);
        const userRef = doc(db, 'users', currentUser.uid);
        
        const treasureDoc = await transaction.get(treasureRef);
        if (!treasureDoc.exists() || !treasureDoc.data().active) {
          throw new Error("Treasure already collected or does not exist");
        }

        // Mark treasure inactive
        transaction.update(treasureRef, { active: false });

        // Add coins to user
        transaction.update(userRef, updates);
      });

      if (foundGrenade) {
        alert(`Collected ${treasure.coins} Box Coins and found a GRENADE!`);
      } else {
        alert(`Collected ${treasure.coins} Box Coins!`);
      }
    } catch (error: any) {
      if (error.message?.includes("already collected")) {
        alert("Someone else collected this treasure first!");
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `treasures/${treasure.id}`, setIsQuotaExceeded);
      }
    }
  };

  const addTestCoins = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        coins: increment(10000)
      });
      alert("Added 10,000 Box Coins to your profile!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const buyItem = async (type: 'ammo' | 'health' | 'gun_standard' | 'gun_expensive' | 'shield' | 'invisibility' | 'missile' | 'grenade', cost: number) => {
    if (!currentUser) return;

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) throw new Error("User does not exist");
        const userData = userDoc.data() as User;

        if (userData.coins < cost) {
          throw new Error("Insufficient coins");
        }

        const updates: any = { coins: increment(-cost) };

        switch (type) {
          case 'ammo':
            updates.ammo = increment(30);
            break;
          case 'health':
            updates.health = 10000;
            break;
          case 'gun_standard':
            updates.gunQuality = 'standard';
            break;
          case 'gun_expensive':
            updates.gunQuality = 'expensive';
            break;
          case 'shield':
            updates.shieldUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();
            break;
          case 'invisibility':
            updates.invisibleUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            break;
          case 'missile':
            updates.autoMissiles = increment(1);
            break;
          case 'grenade':
            updates.grenades = increment(1);
            break;
        }

        transaction.update(userRef, updates);
      });
    } catch (error: any) {
      if (error.message === "Insufficient coins") {
        alert("Not enough Box Coins!");
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    }
  };

  const purchaseTerritory = async () => {
    if (!currentUser || !currentUser.squadId) {
      alert("You must be in a squad to purchase territory!");
      return;
    }
    if (currentUser.health <= 0) {
      alert("You are eliminated! Buy a health pack from the shop to respawn.");
      return;
    }

    // Check if already inside an existing territory
    const nearby = territories.find(t => {
      // Square check: 500m in all directions (1000m x 1000m square)
      const latDiff = Math.abs(currentUser.lat - t.lat);
      const lngDiff = Math.abs(currentUser.lng - t.lng);
      
      // 1 degree lat is approx 111,320 meters
      const latThreshold = 500 / 111320;
      // 1 degree lng is approx 111,320 * cos(lat) meters
      const lngThreshold = 500 / (111320 * Math.cos(currentUser.lat * Math.PI / 180));
      
      return latDiff <= latThreshold && lngDiff <= lngThreshold;
    });

    if (nearby) {
      if (nearby.ownerSquadId === currentUser.squadId) {
        alert("Your squad already owns this territory!");
      } else {
        alert("This area is already owned by another squad! You must defeat the owner to capture it.");
      }
      return;
    }

    const cost = 1000;

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User not found");
        const userData = userDoc.data() as User;

        if (userData.coins < cost) {
          throw new Error("Insufficient coins");
        }

        const newId = `territory_${Date.now()}_${currentUser.uid}`;
        const territoryRef = doc(db, 'territories', newId);
        
        transaction.update(userRef, { 
          coins: increment(-cost),
          territoryCount: increment(1)
        });

        if (userData.squadId) {
          const squadRef = doc(db, 'squads', userData.squadId);
          transaction.update(squadRef, { territoryCount: increment(1) });
        }

        transaction.set(territoryRef, {
          id: newId,
          ownerId: currentUser.uid,
          ownerSquadId: currentUser.squadId,
          lat: currentUser.lat,
          lng: currentUser.lng,
          createdAt: new Date().toISOString()
        });
      });
      alert("Territory purchased successfully!");
    } catch (error: any) {
      if (error.message === "Insufficient coins") alert(`You need ${cost} Box Coins!`);
      else handleFirestoreError(error, OperationType.WRITE, 'territories');
    }
  };

  const spawnBots = async () => {
    if (!currentUser) return;
    
    try {
      for (let s = 0; s < 10; s++) {
        const squadId = `bot_squad_${s}`;
        const leaderId = `bot_${s}_0`;

        // Create Squad
        await setDoc(doc(db, 'squads', squadId), {
          id: squadId,
          name: `Cyber Legion ${s + 1}`,
          leaderId: leaderId,
          score: 0,
          territoryCount: 0,
          avatarUrl: '🛡️'
        });

        // Create 3 bots per squad
        for (let b = 0; b < 3; b++) {
          const botId = `bot_${s}_${b}`;
          // Spawn within ~5km of user
          const latOffset = (Math.random() - 0.5) * 0.09;
          const lngOffset = (Math.random() - 0.5) * 0.09;
          
          await setDoc(doc(db, 'users', botId), {
            uid: botId,
            displayName: b === 0 ? `Commander Bot ${s+1}` : `Soldier Bot ${s+1}-${b}`,
            email: `${botId}@example.com`,
            photoURL: '🤖',
            lat: currentUser.lat + latOffset,
            lng: currentUser.lng + lngOffset,
            health: 10000,
            coins: 10000,
            ammo: 999,
            autoMissiles: 0,
            grenades: 0,
            territoryCount: 0,
            gunQuality: b === 0 ? 'expensive' : 'standard',
            squadId: squadId,
            lastActive: new Date().toISOString()
          });
        }
      }
      alert("Spawned 10 AI Bot Squads with 30 bots!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const spawnTenBots = async () => {
    if (!currentUser) return;
    try {
      const squadId = `bot_squad_ten_${Date.now()}`;
      const leaderId = `bot_ten_0_${Date.now()}`;

      // Create a single squad for these 10 bots
      await setDoc(doc(db, 'squads', squadId), {
        id: squadId,
        name: `The Decimators`,
        leaderId: leaderId,
        score: 0,
        territoryCount: 0,
        avatarUrl: '🛡️'
      });

      for (let i = 0; i < 10; i++) {
        const botId = `bot_ten_${i}_${Date.now()}`;
        // Spawn within ~500m of user
        const latOffset = (Math.random() - 0.5) * 0.01;
        const lngOffset = (Math.random() - 0.5) * 0.01;
        
        await setDoc(doc(db, 'users', botId), {
          uid: botId,
          displayName: i === 0 ? `Elite Commander` : `Bot Soldier ${i}`,
          email: `${botId}@example.com`,
          photoURL: '🤖',
          lat: currentUser.lat + latOffset,
          lng: currentUser.lng + lngOffset,
          health: 10000,
          coins: 10000,
          ammo: 100,
          autoMissiles: 0,
          grenades: 0,
          territoryCount: 0,
          gunQuality: i === 0 ? 'expensive' : 'standard',
          squadId: squadId,
          lastActive: new Date().toISOString()
        });
      }
      alert("Spawned 10 bots nearby!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const spawnTestEntities = async () => {
    if (!currentUser || !location) return;
    try {
      // Spawn 1 Bot
      const botId = `bot_test_${Date.now()}`;
      const latOffset = (Math.random() - 0.5) * 0.005; // very close
      const lngOffset = (Math.random() - 0.5) * 0.005;
      
      await setDoc(doc(db, 'users', botId), {
        uid: botId,
        displayName: `Test Bot ${Math.floor(Math.random() * 100)}`,
        email: `${botId}@example.com`,
        photoURL: '🤖',
        lat: location.lat + latOffset,
        lng: location.lng + lngOffset,
        health: 10000,
        coins: 10000,
        ammo: 100,
        autoMissiles: 0,
        grenades: 0,
        territoryCount: 0,
        gunQuality: 'standard',
        lastActive: new Date().toISOString()
      });

      // Spawn 1 Treasure
      const treasureId = `treasure_test_${Date.now()}`;
      const tLatOffset = (Math.random() - 0.5) * 0.005;
      const tLngOffset = (Math.random() - 0.5) * 0.005;
      
      await setDoc(doc(db, 'treasures', treasureId), {
        id: treasureId,
        lat: location.lat + tLatOffset,
        lng: location.lng + tLngOffset,
        coins: 50,
        active: true,
        createdAt: new Date().toISOString()
      });

      alert("Spawned test bot and treasure nearby!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/treasures');
    }
  };

  return {
    currentUser,
    players,
    squads,
    treasures,
    territories,
    attacks,
    fireWeapon,
    collectTreasure,
    throwGrenade,
    buyItem,
    purchaseTerritory,
    spawnBots,
    spawnTenBots,
    spawnTestEntities,
    addTestCoins,
    isQuotaExceeded
  };
};
