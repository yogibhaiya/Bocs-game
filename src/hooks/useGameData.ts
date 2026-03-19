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
  const [attacks, setAttacks] = useState<Attack[]>([]);
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
        if (data.autoMissiles === undefined) { updates.autoMissiles = 0; needsUpdate = true; data.autoMissiles = 0; }
        if (data.squadId === undefined || data.squadId === null) { updates.squadId = 'squad_general'; needsUpdate = true; data.squadId = 'squad_general'; }
        
        // If user has old health (100), update to 10000
        if (data.health === 100) { updates.health = 10000; needsUpdate = true; data.health = 10000; }
        
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
          health: 10000,
          ammo: 50,
          coins: 10000, // Starting coins
          gunQuality: 'cheap',
          autoMissiles: 0,
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
            avatarUrl: '🛡️'
          });
        }

        setDoc(doc(db, 'users', user.uid), newUser, { merge: true }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));
    return () => unsub();
  }, [isAuthReady]);

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

          // 3. Combat Logic: Attack if enemy is close
          if (nearestEnemy) {
            if (minEnemyDist < 50) {
              // Standard attack
              await updateDoc(doc(db, 'users', nearestEnemy.uid), {
                health: increment(-200) // Increased damage for bots
              });
              
              // Create attack record for animation
              const attackId = `atk_${Date.now()}_${bot.uid}`;
              await setDoc(doc(db, 'attacks', attackId), {
                id: attackId,
                attackerId: bot.uid,
                targetId: nearestEnemy.uid,
                fromLat: bot.lat,
                fromLng: bot.lng,
                toLat: nearestEnemy.lat,
                toLng: nearestEnemy.lng,
                timestamp: serverTimestamp(),
                type: 'bullet'
              });
              actionTaken = true;
            } else if (minEnemyDist < 150 && Math.random() < 0.2) {
              // GRENADE ATTACK (20% chance if in range)
              await updateDoc(doc(db, 'users', nearestEnemy.uid), {
                health: increment(-1000)
              });
              
              const attackId = `atk_grenade_${Date.now()}_${bot.uid}`;
              await setDoc(doc(db, 'attacks', attackId), {
                id: attackId,
                attackerId: bot.uid,
                targetId: nearestEnemy.uid,
                fromLat: bot.lat,
                fromLng: bot.lng,
                toLat: nearestEnemy.lat,
                toLng: nearestEnemy.lng,
                timestamp: serverTimestamp(),
                type: 'grenade'
              });
              actionTaken = true;
            }
          } 
          
          // 4. Territory Logic: Capture if close (< 200m)
          if (!actionTaken && nearestTerritory && minTerritoryDist < 200) {
            await updateDoc(doc(db, 'territories', nearestTerritory.id), {
              ownerSquadId: bot.squadId
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

      await runTransaction(db, async (transaction) => {
        const attackerRef = doc(db, 'users', currentUser.uid);
        const enemyRef = doc(db, 'users', enemy.uid);
        
        const attackerDoc = await transaction.get(attackerRef);
        const enemyDoc = await transaction.get(enemyRef);

        if (!attackerDoc.exists() || !enemyDoc.exists()) {
          throw new Error("Attacker or enemy does not exist");
        }

        const attackerData = attackerDoc.data() as User;
        const enemyData = enemyDoc.data() as User;

        if (enemyData.health <= 0) return; // Already dead

        // Calculate damage
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
        
        // Update attacker ammo/missiles
        if (useMissile) {
          transaction.update(attackerRef, { autoMissiles: increment(-1) });
        } else {
          transaction.update(attackerRef, { ammo: increment(-1) });
        }

        // Update enemy health
        if (newEnemyHealth === 0 && enemyData.uid.startsWith('bot_')) {
          transaction.delete(enemyRef);
        } else {
          transaction.update(enemyRef, { health: newEnemyHealth });
        }

        // Rewards if killed
        if (newEnemyHealth === 0) {
          transaction.update(attackerRef, { coins: increment(50) });
          if (attackerData.squadId) {
            const squadRef = doc(db, 'squads', attackerData.squadId);
            transaction.update(squadRef, { score: increment(100) });
          }
        }

        // Create attack record
        const attackId = `atk_${Date.now()}_${currentUser.uid}`;
        const attackRef = doc(db, 'attacks', attackId);
        transaction.set(attackRef, {
          id: attackId,
          attackerId: currentUser.uid,
          targetId: enemy.uid,
          fromLat: currentUser.lat,
          fromLng: currentUser.lng,
          toLat: enemy.lat,
          toLng: enemy.lng,
          timestamp: serverTimestamp(),
          type: useMissile ? 'missile' : 'bullet'
        });

        // Bot retaliation logic (triggered after transaction)
        if (enemyData.uid.startsWith('bot_') && newEnemyHealth > 0) {
          setTimeout(async () => {
            try {
              const pDoc = await getDoc(attackerRef);
              if (!pDoc.exists()) return;
              const pData = pDoc.data() as User;
              if (pData.health <= 0) return;
              if (pData.shieldUntil && new Date(pData.shieldUntil) > new Date()) return;

              const botDamage = 200 + Math.floor(Math.random() * 300);
              const pNewHealth = Math.max(0, pData.health - botDamage);
              
              await updateDoc(attackerRef, { health: pNewHealth });
              
              const bAtkId = `atk_${Date.now()}_${enemy.uid}`;
              await setDoc(doc(db, 'attacks', bAtkId), {
                id: bAtkId,
                attackerId: enemy.uid,
                targetId: currentUser.uid,
                fromLat: enemy.lat,
                fromLng: enemy.lng,
                toLat: currentUser.lat,
                toLng: currentUser.lng,
                timestamp: serverTimestamp(),
                type: 'bullet'
              });
            } catch (e) {
              console.error("Bot retaliation failed", e);
            }
          }, 600);
        }
      });

    } catch (error) {
      console.error("Attack failed:", error);
      alert("Attack failed! Please try again.");
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
            health: 10000,
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
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=decimators`
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
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
          lat: currentUser.lat + latOffset,
          lng: currentUser.lng + lngOffset,
          health: 10000,
          coins: 500,
          ammo: 100,
          autoMissiles: 0,
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
        photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
        lat: location.lat + latOffset,
        lng: location.lng + lngOffset,
        health: 10000,
        coins: 100,
        ammo: 100,
        autoMissiles: 0,
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
    attackPlayer,
    collectTreasure,
    buyItem,
    claimTerritory,
    spawnBots,
    spawnTenBots,
    spawnTestEntities
  };
};
