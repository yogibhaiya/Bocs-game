import { useState, useEffect, useRef } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, getDocs, serverTimestamp, increment, DocumentSnapshot } from 'firebase/firestore';
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
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    if (!currentUser) return;
    
    const interval = setInterval(() => {
      const bots = playersRef.current.filter(p => p.uid.startsWith('bot_') && p.health > 0);
      
      bots.forEach(async (bot) => {
        // Move bots randomly by a small amount (~10-20 meters)
        const latOffset = (Math.random() - 0.5) * 0.0002;
        const lngOffset = (Math.random() - 0.5) * 0.0002;
        
        try {
          await updateDoc(doc(db, 'users', bot.uid), {
            lat: bot.lat + latOffset,
            lng: bot.lng + lngOffset,
            lastActive: new Date().toISOString()
          });
        } catch (error) {
          // Ignore errors for bot movement to avoid spamming console if deleted
        }
      });
    }, 3000); // Move every 3 seconds

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

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

      if (!useMissile && distance > 100) {
        alert("Target is out of range!");
        return;
      }

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

  const claimTerritory = async () => {
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
    const existingTerritory = territories.find(t => 
      getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: t.lat, longitude: t.lng }) <= 200
    );

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
    
    const botIds = ['bot_1', 'bot_2', 'bot_3'];
    try {
      for (let i = 0; i < botIds.length; i++) {
        const botRef = doc(db, 'users', botIds[i]);
        // Spawn within ~80m of user
        const latOffset = (Math.random() - 0.5) * 0.0015;
        const lngOffset = (Math.random() - 0.5) * 0.0015;
        
        await setDoc(botRef, {
          uid: botIds[i],
          displayName: `Training Bot ${i+1}`,
          email: `bot${i}@example.com`,
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=bot${i}`,
          lat: currentUser.lat + latOffset,
          lng: currentUser.lng + lngOffset,
          health: 100,
          coins: 50,
          ammo: 10,
          autoMissiles: 0,
          gunQuality: 'standard',
          lastActive: new Date().toISOString()
        });
      }
      alert("Training bots spawned nearby!");
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
