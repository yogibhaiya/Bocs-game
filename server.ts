import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { getDistance, isPointWithinRadius } from "geolib";
import * as admin from "firebase-admin";

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));

// Initialize Firebase Admin
admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = firebaseConfig.firestoreDatabaseId 
  ? admin.firestore(firebaseConfig.firestoreDatabaseId)
  : admin.firestore();

// Types for the game state
interface Player {
  uid: string;
  displayName: string;
  photoURL: string;
  lat: number;
  lng: number;
  health: number;
  ammo: number;
  grenades: number;
  missiles: number;
  landmines: number;
  coins: number;
  kills: number;
  deaths: number;
  territoryCount: number;
  squadId: string;
  onlineStatus: boolean;
  lastActive: number;
  lastMissileTime: number;
  hasAssaultRifle: boolean;
}

interface Landmine {
  id: string;
  ownerId: string;
  lat: number;
  lng: number;
  active: boolean;
}

interface Territory {
  id: string;
  ownerId: string;
  ownerSquadId?: string;
  lat: number;
  lng: number;
  radius: number; // in meters
  color: string;
  lastIncomeTime: number;
}

interface Treasure {
  id: string;
  lat: number;
  lng: number;
  coins: number;
  active: boolean;
}

interface Squad {
  id: string;
  name: string;
  leaderId: string;
  score: number;
  avatarUrl: string;
  territoryCount: number;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  const players: Record<string, Player> = {};
  const territories: Record<string, Territory> = {};
  const treasures: Record<string, Treasure> = {};
  const squads: Record<string, Squad> = {};
  const landmines: Record<string, Landmine> = {};
  const bots: string[] = [];

  // Persistence helpers
  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path,
      isServer: true
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  async function savePlayer(uid: string) {
    if (uid.startsWith('bot_')) return;
    const p = players[uid];
    if (!p) return;
    try {
      await db.collection("users").doc(uid).set(p);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${uid}`);
    }
  }

  async function saveSquad(squadId: string) {
    const s = squads[squadId];
    if (!s) return;
    try {
      await db.collection("squads").doc(squadId).set(s);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `squads/${squadId}`);
    }
  }

  async function saveTerritory(territoryId: string) {
    const t = territories[territoryId];
    if (!t) return;
    try {
      await db.collection("territories").doc(territoryId).set(t);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `territories/${territoryId}`);
    }
  }

  async function saveTreasure(treasureId: string) {
    const t = treasures[treasureId];
    if (!t) return;
    try {
      await db.collection("treasures").doc(treasureId).set(t);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `treasures/${treasureId}`);
    }
  }

  // Load initial data from Firestore
  async function loadInitialData() {
    try {
      // Test connection
      try {
        await db.collection('test').doc('connection').get();
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          console.error("Please check your Firebase configuration. Firestore appears to be offline.");
        }
      }

      const usersSnap = await db.collection("users").get();
      usersSnap.forEach(doc => {
        const p = doc.data() as Player;
        p.onlineStatus = false; // Everyone starts offline on server restart
        players[p.uid] = p;
      });

      const squadsSnap = await db.collection("squads").get();
      squadsSnap.forEach(doc => {
        squads[doc.id] = doc.data() as Squad;
      });

      const territoriesSnap = await db.collection("territories").get();
      territoriesSnap.forEach(doc => {
        territories[doc.id] = doc.data() as Territory;
      });

      const treasuresSnap = await db.collection("treasures").get();
      treasuresSnap.forEach(doc => {
        treasures[doc.id] = doc.data() as Treasure;
      });

      console.log(`Loaded ${Object.keys(players).length} players, ${Object.keys(squads).length} squads, ${Object.keys(territories).length} territories, ${Object.keys(treasures).length} treasures.`);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, "initial_load");
    }
  }

  await loadInitialData();

  const WEAPONS = {
    GUN: { range: 100, damage: 200, ammoCost: 1 },
    ASSAULT_RIFLE: { range: 120, damage: 150, ammoCost: 1, fireRate: 100 },
    GRENADE: { range: 80, radius: 100, damage: 1500, ammoCost: 1 },
    MISSILE: { range: 300, damage: 3000, ammoCost: 1, cooldown: 10000 },
    LANDMINE: { triggerRadius: 5, damage: 10000 }
  };

  // Landmine trigger loop
  setInterval(() => {
    Object.values(landmines).forEach(mine => {
      if (!mine.active) return;
      Object.values(players).forEach(p => {
        if (p.uid === mine.ownerId || p.health <= 0 || !p.onlineStatus) return;
        const dist = getDistance(
          { latitude: mine.lat, longitude: mine.lng },
          { latitude: p.lat, longitude: p.lng }
        );
        if (dist <= WEAPONS.LANDMINE.triggerRadius) {
          mine.active = false;
          p.health = 0;
          io.emit("explosion", { lat: mine.lat, lng: mine.lng, radius: 10 });
          io.emit("playerHit", { targetId: p.uid, attackerId: mine.ownerId, damage: WEAPONS.LANDMINE.damage, weapon: "landmine", newHealth: 0 });
          handleKill(mine.ownerId, p.uid);
          delete landmines[mine.id];
          io.emit("landmineExploded", { id: mine.id });
        }
      });
    });
  }, 500);

  const SPAWN_RADIUS = 0.05; // ~5km
  const CENTER_LAT = 22.5726; // Default center
  const CENTER_LNG = 88.3639;

  // Bot movement loop
  setInterval(() => {
    bots.forEach(botId => {
      const bot = players[botId];
      if (!bot || bot.health <= 0) return;

      // Random movement
      bot.lat += (Math.random() - 0.5) * 0.0005;
      bot.lng += (Math.random() - 0.5) * 0.0005;
      bot.lastActive = Date.now();
      io.emit("playerMoved", { uid: botId, lat: bot.lat, lng: bot.lng });

      // Auto-attack nearest player
      const nearest = Object.values(players).find(p => 
        p.uid !== botId && 
        !p.uid.startsWith('bot_') &&
        p.onlineStatus && 
        p.health > 0 && 
        getDistance({ latitude: bot.lat, longitude: bot.lng }, { latitude: p.lat, longitude: p.lng }) < WEAPONS.GUN.range
      );

      if (nearest && Math.random() < 0.2) {
        nearest.health -= WEAPONS.GUN.damage;
        io.emit("playerHit", { targetId: nearest.uid, attackerId: botId, damage: WEAPONS.GUN.damage, weapon: "gun", newHealth: nearest.health });
        if (nearest.health <= 0) handleKill(botId, nearest.uid);
      }
    });
  }, 2000);

  // Initialize some treasures
  for (let i = 0; i < 50; i++) {
    const id = `treasure_${i}`;
    treasures[id] = {
      id,
      lat: CENTER_LAT + (Math.random() - 0.5) * SPAWN_RADIUS,
      lng: CENTER_LNG + (Math.random() - 0.5) * SPAWN_RADIUS,
      coins: Math.floor(Math.random() * 50) + 10,
      active: true
    };
  }

  // Territory income loop
  setInterval(() => {
    const now = Date.now();
    Object.values(territories).forEach(t => {
      if (now - t.lastIncomeTime >= 60000) { // Every minute
        const owner = players[t.ownerId];
        if (owner) {
          owner.coins += 50;
          io.to(t.ownerId).emit("statsUpdated", { coins: owner.coins });
        }
        t.lastIncomeTime = now;
      }
    });
  }, 10000);

  const broadcastLeaderboard = () => {
    const sortedSquads = Object.values(squads).sort((a, b) => b.score - a.score);
    io.emit("leaderboardUpdated", sortedSquads);
  };

  // Leaderboard update loop
  setInterval(broadcastLeaderboard, 5000);

  function handleKill(killerId: string, victimId: string) {
    if (killerId === "none") return;
    const killer = players[killerId];
    const victim = players[victimId];
    if (!killer || !victim) return;

    killer.kills++;
    killer.coins += 200;
    victim.deaths++;
    victim.health = 10000; // Respawn
    victim.ammo = 100;
    
    if (killer.squadId && squads[killer.squadId]) {
      squads[killer.squadId].score += 100;
      saveSquad(killer.squadId);
      broadcastLeaderboard();
    }

    savePlayer(killerId);
    savePlayer(victimId);

    io.emit("playerKilled", { killerId, victimId });
    io.to(killerId).emit("statsUpdated", { kills: killer.kills, coins: killer.coins });
    io.to(victimId).emit("statsUpdated", { deaths: victim.deaths, health: victim.health, ammo: victim.ammo });
  }

  // Periodic save for all online players
  setInterval(() => {
    Object.keys(players).forEach(uid => {
      if (players[uid].onlineStatus) {
        savePlayer(uid);
      }
    });
  }, 60000); // Every minute

  io.on("connection", (socket) => {
    let currentUid: string | null = null;

    socket.on("join", async (data: { uid: string, displayName: string, photoURL: string, lat: number, lng: number }) => {
      const { uid, displayName, photoURL, lat, lng } = data;
      currentUid = uid;
      socket.join(uid);

      if (!players[uid]) {
        // Try to load from Firestore first (in case it wasn't in initial load)
        try {
          const userDoc = await db.collection("users").doc(uid).get();
          if (userDoc.exists) {
            players[uid] = userDoc.data() as Player;
            players[uid].onlineStatus = true;
            players[uid].lastActive = Date.now();
            players[uid].lat = lat;
            players[uid].lng = lng;
          } else {
            players[uid] = {
              uid,
              displayName,
              photoURL,
              lat,
              lng,
              health: 10000,
              ammo: 100,
              grenades: 5,
              missiles: 2,
              landmines: 0,
              coins: 1000,
              kills: 0,
              deaths: 0,
              territoryCount: 0,
              squadId: "general",
              onlineStatus: true,
              lastActive: Date.now(),
              lastMissileTime: 0,
              hasAssaultRifle: false
            };
            savePlayer(uid);
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `users/${uid}`);
        }
      } else {
        players[uid].onlineStatus = true;
        players[uid].lastActive = Date.now();
        players[uid].lat = lat;
        players[uid].lng = lng;
        savePlayer(uid);
      }

      socket.emit("initData", {
        player: players[uid],
        players: Object.values(players).filter(p => p.onlineStatus),
        territories: Object.values(territories),
        treasures: Object.values(treasures).filter(t => t.active),
        squads: Object.values(squads),
        landmines: Object.values(landmines).filter(m => m.ownerId === uid)
      });

      socket.broadcast.emit("playerJoined", players[uid]);
    });

    socket.on("placeLandmine", (data: { lat: number, lng: number }) => {
      if (!currentUid || !players[currentUid]) return;
      const player = players[currentUid];
      if (player.landmines <= 0) return;

      // Check if inside own territory
      const inOwnTerritory = Object.values(territories).some(t => {
        if (t.ownerId !== currentUid) return false;
        const dist = getDistance(
          { latitude: t.lat, longitude: t.lng },
          { latitude: data.lat, longitude: data.lng }
        );
        return dist <= t.radius;
      });

      if (!inOwnTerritory) {
        socket.emit("error", "You can only place landmines in your own territory!");
        return;
      }

      const mineId = `mine_${Date.now()}_${currentUid}`;
      const newMine = {
        id: mineId,
        ownerId: currentUid,
        lat: data.lat,
        lng: data.lng,
        active: true
      };
      landmines[mineId] = newMine;
      player.landmines--;
      
      socket.emit("landminePlaced", newMine);
      socket.emit("statsUpdated", { landmines: player.landmines });
    });

    socket.on("move", (data: { lat: number, lng: number }) => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];
      p.lat = data.lat;
      p.lng = data.lng;
      p.lastActive = Date.now();
      
      // We don't save on every move to avoid hitting Firestore quotas
      // Instead, we save on disconnect or other major events
      socket.broadcast.emit("playerMoved", { uid: currentUid, lat: p.lat, lng: p.lng });
    });

    socket.on("attackGun", (data: { targetId: string, isAssault?: boolean }) => {
      if (!currentUid || !players[currentUid]) return;
      const attacker = players[currentUid];
      const target = players[data.targetId];

      if (!target || target.health <= 0 || !target.onlineStatus) return;
      if (attacker.ammo <= 0) return;

      const weapon = data.isAssault && attacker.hasAssaultRifle ? WEAPONS.ASSAULT_RIFLE : WEAPONS.GUN;
      const dist = getDistance(
        { latitude: attacker.lat, longitude: attacker.lng },
        { latitude: target.lat, longitude: target.lng }
      );

      if (dist <= weapon.range) {
        attacker.ammo -= weapon.ammoCost;
        let damage = weapon.damage;

        // Territory rules
        const attackerInOwnTerritory = Object.values(territories).some(t => 
          t.ownerId === currentUid && isPointWithinRadius({ latitude: attacker.lat, longitude: attacker.lng }, { latitude: t.lat, longitude: t.lng }, t.radius)
        );
        const targetInOwnTerritory = Object.values(territories).some(t => 
          t.ownerId === target.uid && isPointWithinRadius({ latitude: target.lat, longitude: target.lng }, { latitude: t.lat, longitude: t.lng }, t.radius)
        );

        if (attackerInOwnTerritory) damage *= 2;
        if (targetInOwnTerritory) damage /= 2;

        target.health -= damage;
        io.emit("playerHit", { targetId: target.uid, attackerId: currentUid, damage, weapon: data.isAssault ? "assault" : "gun", newHealth: target.health });

        if (target.health <= 0) {
          handleKill(currentUid, target.uid);
        }
        
        socket.emit("statsUpdated", { ammo: attacker.ammo });
      }
    });

    socket.on("throwGrenade", (data: { targetLat: number, targetLng: number }) => {
      if (!currentUid || !players[currentUid]) return;
      const attacker = players[currentUid];
      if (attacker.grenades <= 0) return;

      const dist = getDistance(
        { latitude: attacker.lat, longitude: attacker.lng },
        { latitude: data.targetLat, longitude: data.targetLng }
      );

      if (dist <= WEAPONS.GRENADE.range) {
        attacker.grenades--;
        io.emit("explosion", { lat: data.targetLat, lng: data.targetLng, radius: WEAPONS.GRENADE.radius });

        Object.values(players).forEach(target => {
          if (target.uid === currentUid || !target.onlineStatus || target.health <= 0) return;
          const targetDist = getDistance(
            { latitude: data.targetLat, longitude: data.targetLng },
            { latitude: target.lat, longitude: target.lng }
          );

          if (targetDist <= WEAPONS.GRENADE.radius) {
            target.health -= WEAPONS.GRENADE.damage;
            io.emit("playerHit", { targetId: target.uid, attackerId: currentUid, damage: WEAPONS.GRENADE.damage, weapon: "grenade", newHealth: target.health });
            if (target.health <= 0) handleKill(currentUid, target.uid);
          }
        });
        socket.emit("statsUpdated", { grenades: attacker.grenades });
      }
    });

    socket.on("launchMissile", (data?: { targetId: string }) => {
      if (!currentUid || !players[currentUid]) return;
      const attacker = players[currentUid];
      
      let target: Player | undefined;
      if (data?.targetId) {
        target = players[data.targetId];
      } else {
        // Auto-target nearest enemy
        let minDist = WEAPONS.MISSILE.range;
        Object.values(players).forEach(p => {
          if (p.uid === currentUid || !p.onlineStatus || p.health <= 0) return;
          const dist = getDistance(
            { latitude: attacker.lat, longitude: attacker.lng },
            { latitude: p.lat, longitude: p.lng }
          );
          if (dist < minDist) {
            minDist = dist;
            target = p;
          }
        });
      }

      if (!target || target.health <= 0 || !target.onlineStatus) return;
      if (attacker.missiles <= 0) return;
      if (Date.now() - attacker.lastMissileTime < WEAPONS.MISSILE.cooldown) return;

      attacker.missiles--;
      attacker.lastMissileTime = Date.now();
      io.emit("playerHit", { targetId: target.uid, attackerId: currentUid, damage: 0, weapon: "missile", newHealth: target.health });

      const targetId = target.uid;
      setTimeout(() => {
        const victim = players[targetId];
        if (victim) {
          victim.health -= WEAPONS.MISSILE.damage;
          io.emit("playerHit", { targetId: victim.uid, attackerId: currentUid, damage: WEAPONS.MISSILE.damage, weapon: "missile", newHealth: victim.health });
          io.emit("explosion", { lat: victim.lat, lng: victim.lng, radius: 50 });
          if (victim.health <= 0) handleKill(currentUid, victim.uid);
        }
      }, 1500);

      socket.emit("statsUpdated", { missiles: attacker.missiles });
    });

    socket.on("buyTerritory", () => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];
      if (!p.squadId || p.squadId === "general") return; // Must be in a real squad
      
      // Find if player is inside an existing territory
      const existingTerritory = Object.values(territories).find(t => 
        isPointWithinRadius({ latitude: p.lat, longitude: p.lng }, { latitude: t.lat, longitude: t.lng }, t.radius)
      );

      if (existingTerritory) {
        // CAPTURE LOGIC
        if (existingTerritory.ownerSquadId === p.squadId && p.squadId !== "general") return; // Already own it
        
        const captureCost = 1000;
        if (p.coins < captureCost) return;

        // Decrement old owner's squad count
        if (existingTerritory.ownerSquadId && squads[existingTerritory.ownerSquadId]) {
          squads[existingTerritory.ownerSquadId].territoryCount--;
        }

        existingTerritory.ownerId = currentUid;
        existingTerritory.ownerSquadId = p.squadId;
        existingTerritory.lastIncomeTime = Date.now();
        
        p.coins -= captureCost;
        p.territoryCount++;
        
        savePlayer(currentUid);
        saveTerritory(existingTerritory.id);
        if (existingTerritory.ownerSquadId && squads[existingTerritory.ownerSquadId]) {
          saveSquad(existingTerritory.ownerSquadId);
        }
        
        io.emit("territoryAdded", existingTerritory); // Re-broadcast updated territory
        socket.emit("statsUpdated", { coins: p.coins, territoryCount: p.territoryCount });

        if (p.squadId && squads[p.squadId]) {
          squads[p.squadId].territoryCount++;
          saveSquad(p.squadId);
          broadcastLeaderboard();
        }
      } else {
        // PURCHASE NEW LOGIC
        const purchaseCost = 500;
        if (p.coins < purchaseCost) return;

        // Check if too close to another territory (min 200m distance between centers)
        const tooClose = Object.values(territories).some(t => 
          getDistance({ latitude: p.lat, longitude: p.lng }, { latitude: t.lat, longitude: t.lng }) < 200
        );
        if (tooClose) return;

        const id = `territory_${Date.now()}`;
        const territory: Territory = {
          id,
          ownerId: currentUid,
          ownerSquadId: p.squadId,
          lat: p.lat,
          lng: p.lng,
          radius: 100,
          color: p.squadId && squads[p.squadId] ? `hsl(${Math.random() * 360}, 70%, 50%)` : `hsl(${Math.random() * 360}, 70%, 50%)`,
          lastIncomeTime: Date.now()
        };
        territories[id] = territory;

        p.coins -= purchaseCost;
        p.territoryCount++;
        io.emit("territoryAdded", territories[id]);
        socket.emit("statsUpdated", { coins: p.coins, territoryCount: p.territoryCount });

        if (p.squadId && squads[p.squadId]) {
          squads[p.squadId].territoryCount++;
          broadcastLeaderboard();
        }
      }
    });

    socket.on("collectTreasure", (data: { id: string }) => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];
      const t = treasures[data.id];

      if (!t || !t.active) return;

      const dist = getDistance(
        { latitude: p.lat, longitude: p.lng },
        { latitude: t.lat, longitude: t.lng }
      );

      if (dist <= 100) {
        t.active = false;
        p.coins += t.coins;
        savePlayer(currentUid);
        saveTreasure(data.id);
        
        // 20% chance for grenade
        if (Math.random() < 0.2) {
          p.grenades++;
        }

        io.emit("treasureCollected", { id: t.id, collectorId: currentUid, coins: t.coins });
        socket.emit("statsUpdated", { coins: p.coins, grenades: p.grenades });
        
        // Respawn treasure elsewhere after 30s
        setTimeout(() => {
          t.lat = CENTER_LAT + (Math.random() - 0.5) * SPAWN_RADIUS;
          t.lng = CENTER_LNG + (Math.random() - 0.5) * SPAWN_RADIUS;
          t.active = true;
          io.emit("treasureAdded", t);
        }, 30000);
      }
    });

    socket.on("buyItem", (data: { type: string, cost: number }) => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];

      if (p.coins < data.cost) return;
      p.coins -= data.cost;

      if (data.type === "ammo") {
        p.ammo += 100;
      } else if (data.type === "health") {
        p.health = 10000;
      } else if (data.type === "gun_expensive") {
        p.hasAssaultRifle = true;
      } else if (data.type === "grenade") {
        p.grenades += 1;
      } else if (data.type === "missile") {
        p.missiles += 1;
      } else if (data.type === "landmine") {
        p.landmines += 1;
      }

      savePlayer(currentUid);
      socket.emit("statsUpdated", { 
        coins: p.coins, 
        health: p.health,
        ammo: p.ammo,
        grenades: p.grenades,
        missiles: p.missiles,
        landmines: p.landmines,
        hasAssaultRifle: p.hasAssaultRifle
      });
    });

    socket.on("addTestCoins", () => {
      if (!currentUid || !players[currentUid]) return;
      players[currentUid].coins += 10000;
      socket.emit("statsUpdated", { coins: players[currentUid].coins });
    });

    socket.on("updateAvatar", (data: { photoURL: string }) => {
      if (!currentUid || !players[currentUid]) return;
      players[currentUid].photoURL = data.photoURL;
      io.emit("statsUpdated", { photoURL: data.photoURL }); // Broadcast to others? Or just update state?
    });

    socket.on("spawnBots", (data: { lat: number, lng: number, count: number }) => {
      for (let i = 0; i < data.count; i++) {
        const botId = `bot_${Date.now()}_${i}`;
        players[botId] = {
          uid: botId,
          displayName: `Bot ${Math.floor(Math.random() * 1000)}`,
          photoURL: "🤖",
          lat: data.lat + (Math.random() - 0.5) * 0.01,
          lng: data.lng + (Math.random() - 0.5) * 0.01,
          health: 10000,
          ammo: 100,
          coins: 100,
          kills: 0,
          deaths: 0,
          territoryCount: 0,
          squadId: "bots",
          onlineStatus: true,
          lastActive: Date.now(),
          lastMissileTime: 0,
          hasAssaultRifle: false,
          landmines: 0,
          missiles: 0,
          grenades: 0
        };
        bots.push(botId);
        io.emit("playerJoined", players[botId]);
      }
    });

    socket.on("createSquad", (data: { name: string, avatarUrl: string }) => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];
      
      // If player was in another squad, decrement its territory count
      if (p.squadId && squads[p.squadId]) {
        const playerTerritories = Object.values(territories).filter(t => t.ownerId === currentUid).length;
        squads[p.squadId].territoryCount -= playerTerritories;
      }

      const squadId = `squad_${Date.now()}`;
      const playerTerritories = Object.values(territories).filter(t => t.ownerId === currentUid).length;
      
      const newSquad: Squad = {
        id: squadId,
        name: data.name,
        leaderId: currentUid,
        score: 0,
        avatarUrl: data.avatarUrl,
        territoryCount: playerTerritories
      };
      
      squads[squadId] = newSquad;
      p.squadId = squadId;
      savePlayer(currentUid);
      saveSquad(squadId);
      io.emit("squadAdded", newSquad);
      socket.emit("statsUpdated", { squadId });
      broadcastLeaderboard();
    });

    socket.on("joinSquad", (data: { squadId: string }) => {
      if (!currentUid || !players[currentUid]) return;
      const squad = squads[data.squadId];
      if (!squad) return;
      const members = Object.values(players).filter(p => p.squadId === data.squadId);
      if (members.length >= 6) return;
      
      const p = players[currentUid];
      // If player was in another squad, decrement its territory count
      if (p.squadId && squads[p.squadId]) {
        const playerTerritories = Object.values(territories).filter(t => t.ownerId === currentUid).length;
        squads[p.squadId].territoryCount -= playerTerritories;
      }

      p.squadId = data.squadId;
      const playerTerritories = Object.values(territories).filter(t => t.ownerId === currentUid).length;
      squads[data.squadId].territoryCount += playerTerritories;
      
      savePlayer(currentUid);
      saveSquad(data.squadId);
      if (p.squadId && squads[p.squadId]) {
        saveSquad(p.squadId);
      }
      
      socket.emit("statsUpdated", { squadId: data.squadId });
      broadcastLeaderboard();
    });

    socket.on("leaveSquad", () => {
      if (!currentUid || !players[currentUid]) return;
      const p = players[currentUid];
      if (p.squadId && squads[p.squadId]) {
        const playerTerritories = Object.values(territories).filter(t => t.ownerId === currentUid).length;
        squads[p.squadId].territoryCount -= playerTerritories;
        saveSquad(p.squadId);
      }
      p.squadId = "";
      savePlayer(currentUid);
      socket.emit("statsUpdated", { squadId: "" });
      broadcastLeaderboard();
    });

    socket.on("disconnect", () => {
      if (currentUid && players[currentUid]) {
        players[currentUid].onlineStatus = false;
        savePlayer(currentUid);
        io.emit("playerLeft", { uid: currentUid });
      }
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    loadInitialData();
  });
}

startServer();
