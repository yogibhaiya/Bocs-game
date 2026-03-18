import { useState, useEffect, useRef } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, getDocs, getDoc, serverTimestamp, increment, DocumentSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, Squad, Treasure, Territory } from '../types';
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as User;
        
        // Migrate old users
        let needsUpdate = false;
        const updates: any = {};
        
        if (data.ammo === undefined) { updates.ammo = 50; needsUpdate = true; data.ammo = 50; }
        if (data.coins === undefined) { updates.coins = 100; needsUpdate = true; data.coins = 100; }
        if (data.gunQuality === undefined) { updates.gunQuality = 'cheap'; needsUpdate = true; data.gunQuality = 'cheap'; }
        if (data.autoMissiles === undefined) { updates.autoMissiles = 0; needsUpdate = true; data.autoMissiles = 0; }
        
        if (needsUpdate) {
          updateDoc(doc(db, 'users', user.uid), updates).catch(e => console.error("Migration error:", e));
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
          health: 100,
          ammo: 50,
          coins: 100, // Starting coins
          gunQuality: 'cheap',
          autoMissiles: 0,
        };
        setDoc(doc(db, 'users', user.uid), newUser).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));
    return () => unsub();
  }, [isAuthReady, location]);

  // Update location
  useEffect(() => {
    if (!isAuthReady) return;
    const user = auth.currentUser;
    if (!user || !location) return;
    updateDoc(doc(db, 'users', user.uid), {
      lat: location.lat,
      lng: location.lng,
      lastActive: new Date().toISOString(),
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
  }, [location, isAuthReady]);

  // Listen to all players (for prototype, we fetch all. In prod, use geohashes)
  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const p: User[] = [];
      snapshot.forEach(d => p.push(d.data() as User));
      setPlayers(p);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    return () => unsub();
  }, [isAuthReady]);

  // Listen to squads
  useEffect(() => {
    if (!isAuthReady) return;
    const unsub = onSnapshot(collection(db, 'squads'), (snapshot) => {
      const s: Squad[] = [];
      snapshot.forEach(d => s.push(d.data() as Squad));
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
    if (!currentUser) return;
    
    const interval = setInterval(() => {
      const currentPlayers = playersRef.current;
      const currentTerritories = territoriesRef.current;
      
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

          // 3. Combat Logic: Attack if enemy is close (< 50m)
          if (nearestEnemy && minEnemyDist < 50) {
            await updateDoc(doc(db, 'users', nearestEnemy.uid), {
              health: increment(-5) // Bots do 5 damage per tick
            });
            actionTaken = true;
          } 
          // 4. Territory Logic: Capture if close (< 200m)
          else if (nearestTerritory && minTerritoryDist < 200) {
            await updateDoc(doc(db, 'territories', nearestTerritory.id), {
              ownerSquadId: bot.squadId
            });
            actionTaken = true;
          }

          // 5. Movement Logic
          if (!actionTaken) {
            let targetLat = bot.lat;
            let targetLng = bot.lng;

            if (nearestTerritory && minTerritoryDist < 3000) {
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
              // Move approx 15m per tick
              const step = Math.min(0.00015, dist); 
              newLat += (latDiff / dist) * step;
              newLng += (lngDiff / dist) * step;
            }

            await updateDoc(doc(db, 'users', bot.uid), {
              lat: newLat,
              lng: newLng,
              lastActive: new Date().toISOString()
            });
          }
        } catch (error) {
          // Ignore errors for bot movement to avoid spamming console if deleted
        }
      });
    }, 3000); // Move every 3 seconds

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // Automatic Treasure Spawner
  useEffect(() => {
    if (!currentUser || !currentUser.lat || !currentUser.lng) return;

    const checkAndSpawnTreasures = async () => {
      try {
        const spawnerRef = doc(db, 'system', 'spawner');
        const spawnerDoc = await getDoc(spawnerRef);
        
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        let shouldSpawn = false;
        
        if (!spawnerDoc.exists()) {
          shouldSpawn = true;
        } else {
          const data = spawnerDoc.data();
          if (!data.lastTreasureSpawn || now - data.lastTreasureSpawn > oneHour) {
            shouldSpawn = true;
          }
        }

        // Also check if map is empty (less than 50 treasures)
        const treasuresSnapshot = await getDocs(query(collection(db, 'treasures'), where('active', '==', true)));
        if (treasuresSnapshot.size < 50) {
          shouldSpawn = true;
        }

        if (shouldSpawn) {
          // Update the spawner doc immediately to prevent other clients from spawning
          await setDoc(spawnerRef, { lastTreasureSpawn: now }, { merge: true });
          
          // Spawn 50 new treasures all over the map
          for (let i = 0; i < 50; i++) {
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
            });
          }
          console.log("Spawned 50 new treasures all over the map!");
        }
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          console.log("Client is offline, skipping treasure spawn check.");
          return;
        }
        console.error("Error checking/spawning treasures:", error);
      }
    };

    // Wait a few seconds for Firebase connection to establish before first check
    const timeout = setTimeout(() => {
      if (navigator.onLine) {
        checkAndSpawnTreasures();
      }
    }, 3000);
    
    const interval = setInterval(() => {
      if (navigator.onLine) {
        checkAndSpawnTreasures();
      }
    }, 60000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [currentUser?.uid, currentUser?.lat, currentUser?.lng]);

  const attackPlayer = async (enemy: User, useMissile: boolean = false) => {
    if (!currentUser) return;
    if (currentUser.health <= 0) {
      alert("You are eliminated! Buy a health pack from the shop to respawn.");
      return;
    }
    if (!useMissile && currentUser.ammo <= 0) return;
    if (useMissile && currentUser.autoMissiles <= 0) return;
    if (enemy.health <= 0) return; // Cannot attack dead players

    try {
      const distance = getDistance(
        { latitude: currentUser.lat, longitude: currentUser.lng },
        { latitude: enemy.lat, longitude: enemy.lng }
      );

      // Check if enemy has shield
      if (enemy.shieldUntil && new Date(enemy.shieldUntil) > new Date()) {
        alert("Enemy is shielded!");
        return;
      }

      // Calculate damage based on gun quality and territory
      let damage = useMissile ? 50 : 10;
      if (!useMissile) {
        if (currentUser.gunQuality === 'standard') damage = 20;
        if (currentUser.gunQuality === 'expensive') damage = 35;

        // Territory advantage
        const inOwnedTerritory = territories.some(t => 
          t.ownerSquadId === currentUser.squadId && 
          getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: t.lat, longitude: t.lng }) <= 500
        );
        if (inOwnedTerritory) damage *= 2;

        const inEnemyTerritory = territories.some(t => 
          t.ownerSquadId === enemy.squadId && 
          getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: t.lat, longitude: t.lng }) <= 500
        );
        if (inEnemyTerritory) damage = Math.floor(damage / 2);
      }

      // Apply damage and reduce ammo/missile
      const newHealth = Math.max(0, enemy.health - damage);
      
      // Decrease ammo or missile
      if (useMissile) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          autoMissiles: increment(-1)
        });
      } else {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          ammo: increment(-1)
        });
      }

      // Update enemy health
      if (newHealth === 0 && enemy.uid.startsWith('bot_')) {
        await deleteDoc(doc(db, 'users', enemy.uid));
      } else {
        await updateDoc(doc(db, 'users', enemy.uid), {
          health: newHealth
        });
      }

      // If killed, reward coins
      if (newHealth === 0) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          coins: increment(50) // Reward for kill
        });
        if (currentUser.squadId) {
          await updateDoc(doc(db, 'squads', currentUser.squadId), {
            score: increment(100)
          });
        }
      }
    } catch (error) {
      console.error("Attack failed:", error);
      alert("Attack failed! Please check your connection or try again.");
      handleFirestoreError(error, OperationType.UPDATE, `users/${enemy.uid}`);
    }
  };

  const collectTreasure = async (treasure: Treasure) => {
    if (!currentUser) return;
    if (currentUser.health <= 0) {
      alert("You are eliminated! Buy a health pack from the shop to respawn.");
      return;
    }

    try {
      const distance = getDistance(
        { latitude: currentUser.lat, longitude: currentUser.lng },
        { latitude: treasure.lat, longitude: treasure.lng }
      );

      if (distance > 20) return;

      // Mark treasure inactive
      await updateDoc(doc(db, 'treasures', treasure.id), {
        active: false
      });

      // Add coins
      await updateDoc(doc(db, 'users', currentUser.uid), {
        coins: increment(treasure.coins)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `treasures/${treasure.id}`);
    }
  };

  const buyItem = async (type: 'ammo' | 'health' | 'gun_standard' | 'gun_expensive' | 'shield' | 'invisibility' | 'missile', cost: number) => {
    if (!currentUser || currentUser.coins < cost) return;

    try {
      const updates: any = { coins: increment(-cost) };

      switch (type) {
        case 'ammo':
          updates.ammo = increment(30);
          break;
        case 'health':
          updates.health = 100;
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
      }

      await updateDoc(doc(db, 'users', currentUser.uid), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const claimTerritory = async (territoryId?: string) => {
    if (!currentUser || !currentUser.squadId) {
      alert("You must be in a squad to claim territory!");
      return;
    }
    if (currentUser.health <= 0) {
      alert("You are eliminated! Buy a health pack from the shop to respawn.");
      return;
    }

    const userSquad = squads.find(s => s.id === currentUser.squadId);
    if (!userSquad || userSquad.leaderId !== currentUser.uid) {
      alert("Only squad leaders can purchase/claim territories!");
      return;
    }

    if (currentUser.coins < 100) {
      alert("You need 100 Box Coins to buy a territory!");
      return;
    }

    // Check if already in a territory capture zone (200m)
    let existingTerritory = null;
    if (territoryId) {
      existingTerritory = territories.find(t => t.id === territoryId);
      if (existingTerritory) {
        const distance = getDistance(
          { latitude: currentUser.lat, longitude: currentUser.lng },
          { latitude: existingTerritory.lat, longitude: existingTerritory.lng }
        );
        if (distance > 200) {
          alert("You are too far away to capture this territory!");
          return;
        }
      }
    } else {
      existingTerritory = territories.find(t => 
        getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: t.lat, longitude: t.lng }) <= 200
      );
    }

    try {
      if (existingTerritory) {
        // Capture existing
        if (existingTerritory.ownerSquadId !== currentUser.squadId) {
          await updateDoc(doc(db, 'users', currentUser.uid), { coins: increment(-100) });
          await updateDoc(doc(db, 'territories', existingTerritory.id), {
            ownerSquadId: currentUser.squadId
          });
          alert("Territory captured!");
        } else {
          alert("Your squad already owns this territory!");
        }
      } else {
        // Create new
        await updateDoc(doc(db, 'users', currentUser.uid), { coins: increment(-100) });
        const newId = `territory_${Date.now()}`;
        await setDoc(doc(db, 'territories', newId), {
          id: newId,
          ownerSquadId: currentUser.squadId,
          lat: currentUser.lat,
          lng: currentUser.lng
        });
        alert("New territory purchased and claimed!");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'territories');
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
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=squad${s}`
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
            photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
            lat: currentUser.lat + latOffset,
            lng: currentUser.lng + lngOffset,
            health: 100,
            coins: 1000,
            ammo: 999,
            autoMissiles: 0,
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

  return {
    currentUser,
    players,
    squads,
    treasures,
    territories,
    attackPlayer,
    collectTreasure,
    buyItem,
    claimTerritory,
    spawnBots
  };
};
