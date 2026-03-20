import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Circle, 
  Rectangle, 
  useMap, 
  useMapEvents 
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { User, Treasure, Territory, Squad, Attack } from '../types';
import { getDistance } from 'geolib';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const Projectile = ({ start, end, type }: { start: [number, number], end: [number, number], type?: 'bullet' | 'missile' | 'grenade' }) => {
  const [pos, setPos] = useState<[number, number]>(start);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setPos(end);
    }, 50);
    return () => clearTimeout(timer);
  }, [end]);

  let color = '#facc15';
  let size = 8;
  let shadow = '0 0 10px #facc15, 0 0 20px #facc15';

  if (type === 'missile') {
    color = '#f97316';
    size = 12;
    shadow = '0 0 15px #f97316, 0 0 30px #f97316';
  } else if (type === 'grenade') {
    color = '#22c55e';
    size = 10;
    shadow = '0 0 10px #22c55e';
  }

  const icon = L.divIcon({
    className: 'custom-projectile',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border-radius: ${type === 'missile' ? '2px' : '50%'};
      transform: ${type === 'missile' ? 'rotate(45deg)' : 'none'};
      box-shadow: ${shadow};
      transition: all 0.5s linear;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });

  return <Marker position={pos} icon={icon} zIndexOffset={1000} />;
};

function MapTargeter({ fireTrigger, missileTrigger, grenadeTrigger, players, currentUser, onAttack, onThrowGrenade, targetLatLng }: { 
  fireTrigger: number, 
  missileTrigger: number,
  grenadeTrigger: number,
  players: User[], 
  currentUser: User, 
  onAttack: (targetLatLng: { latitude: number, longitude: number } | null, useMissile?: boolean) => void,
  onThrowGrenade: (lat: number, lng: number) => void,
  targetLatLng: { latitude: number, longitude: number } | null
}) {
  const map = useMap();
  const lastFireTrigger = useRef(fireTrigger);
  const lastMissileTrigger = useRef(missileTrigger);
  const lastGrenadeTrigger = useRef(grenadeTrigger);

  useEffect(() => {
    const isWeaponFire = fireTrigger > lastFireTrigger.current;
    const isMissileFire = missileTrigger > lastMissileTrigger.current;
    const isGrenadeThrow = grenadeTrigger > lastGrenadeTrigger.current;

    if (isWeaponFire || isMissileFire || isGrenadeThrow) {
      if (currentUser.health <= 0 || !map) return;
      
      let finalTargetLatLng = targetLatLng;
      if (!finalTargetLatLng) {
        const center = map.getCenter();
        if (!center) return;
        finalTargetLatLng = { latitude: center.lat, longitude: center.lng };
      }

      if (isGrenadeThrow) {
        onThrowGrenade(finalTargetLatLng.latitude, finalTargetLatLng.longitude);
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'); // Throw sound
        audio.volume = 0.5;
        audio.play().catch(() => {});
        lastGrenadeTrigger.current = grenadeTrigger;
        return;
      }
      
      // Call onAttack with the target location (or null for auto-target missile)
      onAttack(finalTargetLatLng, isMissileFire);
      
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }

    lastFireTrigger.current = fireTrigger;
    lastMissileTrigger.current = missileTrigger;
    lastGrenadeTrigger.current = grenadeTrigger;
  }, [fireTrigger, missileTrigger, grenadeTrigger, map, players, currentUser, onAttack, onThrowGrenade, targetLatLng]);

  return null;
}

function MapEvents({ onMouseMove, onMouseOut }: { onMouseMove: (e: any) => void, onMouseOut: () => void }) {
  useMapEvents({
    mousemove: onMouseMove,
    mouseout: onMouseOut
  });
  return null;
}

interface GameMapProps {
  currentUser: User | null;
  players: User[];
  squads: Squad[];
  treasures: Treasure[];
  territories: Territory[];
  attacks: Attack[];
  onAttack: (targetLatLng: { latitude: number, longitude: number } | null, useMissile?: boolean) => void;
  onThrowGrenade: (lat: number, lng: number) => void;
  onCollectTreasure: (treasure: Treasure) => void;
  purchaseTerritory: (territoryId?: string) => void;
  fireTrigger: number;
  missileTrigger: number;
  grenadeTrigger: number;
  targetId: string | null;
}

export default function GameMap(props: GameMapProps) {
  const { 
    currentUser, 
    players, 
    squads, 
    treasures, 
    territories, 
    attacks, 
    onAttack, 
    onThrowGrenade,
    onCollectTreasure, 
    purchaseTerritory, 
    fireTrigger,
    missileTrigger,
    grenadeTrigger,
    targetId
  } = props;

  if (!currentUser || !currentUser.lat || !currentUser.lng) {
    return <div className="flex items-center justify-center h-full bg-zinc-900 text-white">Waiting for GPS location...</div>;
  }

  const center: [number, number] = [currentUser.lat, currentUser.lng];
  const targetPlayer = targetId ? players.find(p => p.uid === targetId) : null;
  const mapCenter: [number, number] = targetPlayer ? [targetPlayer.lat, targetPlayer.lng] : center;
  const mySquad = squads.find(s => s.id === currentUser.squadId);

  const [activeProjectiles, setActiveProjectiles] = useState<Attack[]>([]);
  const seenAttacks = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newAttacks = attacks.filter(a => !seenAttacks.current.has(a.id));
    if (newAttacks.length > 0) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2771/2771-preview.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
      newAttacks.forEach(a => seenAttacks.current.add(a.id));
      setActiveProjectiles(prev => [...prev, ...newAttacks]);
      setTimeout(() => {
        setActiveProjectiles(prev => prev.filter(b => !newAttacks.find(na => na.id === b.id)));
      }, 500);
    }
  }, [attacks]);

  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [mouseLatLng, setMouseLatLng] = useState<{ latitude: number, longitude: number } | null>(null);

  const handleMouseMove = useCallback((e: any) => {
    if (e.latlng && e.originalEvent) {
      setMousePos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
      setMouseLatLng({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    }
  }, []);

  const handleMouseOut = useCallback(() => {
    setMousePos(null);
    setMouseLatLng(null);
  }, []);

  return (
    <div className="w-full h-full relative z-0">
      {/* Crosshair Overlay */}
      <div 
        className="fixed z-[1000] pointer-events-none"
        style={{
          left: mousePos ? mousePos.x : '50%',
          top: mousePos ? mousePos.y : '50%',
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center">
          <div className="absolute inset-0 border-2 border-cyan-500/50 rounded-full animate-pulse" />
          <div className="absolute w-full h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="absolute h-full w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]" />
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
        </div>
      </div>

      <MapContainer 
        center={mapCenter} 
        zoom={16} 
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapEvents onMouseMove={handleMouseMove} onMouseOut={handleMouseOut} />
        
        <MapTargeter 
          fireTrigger={fireTrigger} 
          missileTrigger={missileTrigger}
          grenadeTrigger={grenadeTrigger}
          currentUser={currentUser} 
          players={players} 
          onAttack={onAttack} 
          onThrowGrenade={onThrowGrenade}
          targetLatLng={mouseLatLng}
        />

        {/* Explosions for Grenades */}
        {activeProjectiles.filter(a => a.type === 'grenade').map(explosion => (
          <Circle 
            key={`explosion_${explosion.id}`}
            center={[explosion.toLat, explosion.toLng]}
            radius={100}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#f97316',
              fillOpacity: 0.6,
              weight: 0
            }}
          />
        ))}

        {/* Current Player */}
        <Marker position={center} icon={createPlayerIcon(mySquad, 'self', currentUser.health, currentUser.displayName, true, currentUser.photoURL)}>
          <Popup>
            <div className="text-center">
              <p className="font-bold">{currentUser.displayName}</p>
              <p className="text-sm">Health: {currentUser.health}</p>
              <p className="text-sm">Ammo: {currentUser.ammo}</p>
              {currentUser.squadId && (
                <button 
                  onClick={() => purchaseTerritory()}
                  className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                >
                  PURCHASE TERRITORY (1000 BC)
                </button>
              )}
            </div>
          </Popup>
        </Marker>

        {/* Attack Range Circle (100m) */}
        <Circle 
          center={center} 
          radius={100} 
          pathOptions={{ 
            color: '#3b82f6', 
            opacity: 0.2, 
            fillColor: '#3b82f6', 
            fillOpacity: 0.1,
            interactive: false
          }} 
        />

        {/* Projectiles */}
        {activeProjectiles.map(projectile => (
          <Projectile 
            key={projectile.id} 
            start={[projectile.fromLat, projectile.fromLng]} 
            end={[projectile.toLat, projectile.toLng]} 
            type={projectile.type}
          />
        ))}

        {/* Other Players */}
        <MarkerClusterGroup>
          {players.filter(p => p.uid !== currentUser.uid).map(player => {
            const isAlly = currentUser.squadId && currentUser.squadId === player.squadId;
            const relation = isAlly ? 'ally' : 'enemy';
            const isInvisible = player.invisibleUntil && new Date(player.invisibleUntil) > new Date();
            if (isInvisible && !isAlly) return null;

            const playerSquad = squads.find(s => s.id === player.squadId);
            const pos: [number, number] = [player.lat, player.lng];

            return (
              <Marker 
                key={player.uid} 
                position={pos} 
                icon={createPlayerIcon(playerSquad, relation, player.health, player.displayName, player.onlineStatus, player.photoURL)}
              >
                <Popup>
                  <div className="text-center">
                    <p className="font-bold flex items-center justify-center gap-2">
                      {player.displayName}
                      <span className={`w-2 h-2 rounded-full ${player.onlineStatus ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </p>
                    <p className="text-sm">Health: {player.health}</p>
                    <p className="text-xs text-zinc-400">{player.onlineStatus ? 'Online' : 'Offline'}</p>
                    <button 
                      onClick={() => onAttack({ latitude: player.lat, longitude: player.lng })}
                      disabled={currentUser.ammo <= 0 || player.health <= 0 || !player.onlineStatus}
                      className="mt-2 px-4 py-1 bg-red-600 text-white rounded disabled:opacity-50 text-sm font-bold w-full"
                    >
                      {player.onlineStatus ? 'ATTACK' : 'OFFLINE'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {/* Treasures */}
        {treasures.filter(t => t.active).map(treasure => {
          const pos: [number, number] = [treasure.lat, treasure.lng];
          const latOffset = 20 / 111320;
          const lngOffset = 20 / (111320 * Math.cos(treasure.lat * Math.PI / 180));
          const bounds: [[number, number], [number, number]] = [
            [treasure.lat - latOffset, treasure.lng - lngOffset],
            [treasure.lat + latOffset, treasure.lng + lngOffset]
          ];

          return (
            <React.Fragment key={treasure.id}>
              <Rectangle 
                bounds={bounds}
                pathOptions={{
                  color: '#eab308',
                  weight: 2,
                  fillColor: '#fef08a',
                  fillOpacity: 0.3,
                  interactive: true
                }}
              />
              <Marker 
                position={pos} 
                icon={L.divIcon({ className: 'treasure-icon', html: '<div class="text-xl">💰</div>', iconSize: [24, 24], iconAnchor: [12, 12] })}
              >
                <Popup>
                  <div className="text-center">
                    <p className="font-bold text-yellow-600">Treasure Zone</p>
                    <p className="text-sm">{treasure.coins} Box Coins</p>
                    <button 
                      onClick={() => onCollectTreasure(treasure)}
                      className="mt-2 px-4 py-1 bg-yellow-500 text-black rounded text-sm font-bold w-full"
                    >
                      COLLECT
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Territories */}
        {territories.map(territory => {
          const squad = squads.find(s => s.id === territory.ownerSquadId);
          const pos: [number, number] = [territory.lat, territory.lng];
          
          // Calculate 500m square bounds
          const latOffset = 500 / 111320;
          const lngOffset = 500 / (111320 * Math.cos(territory.lat * Math.PI / 180));
          const bounds: [[number, number], [number, number]] = [
            [territory.lat - latOffset, territory.lng - lngOffset],
            [territory.lat + latOffset, territory.lng + lngOffset]
          ];

          return (
            <React.Fragment key={territory.id}>
              <Rectangle 
                bounds={bounds}
                pathOptions={{ 
                  color: territory.ownerSquadId === currentUser.squadId ? '#10b981' : '#ef4444', 
                  fillColor: territory.ownerSquadId === currentUser.squadId ? '#10b981' : '#ef4444',
                  fillOpacity: 0.15,
                  weight: 2,
                  interactive: true
                }} 
              />
              <Marker 
                position={pos} 
                icon={L.divIcon({ 
                  className: 'territory-icon', 
                  html: `
                    <div class="flex flex-col items-center">
                      <div class="bg-zinc-900 border-2 border-emerald-500 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold shadow-lg whitespace-nowrap">
                        🚩 ${squad?.name || 'Unknown'}
                      </div>
                      <div class="w-1 h-6 bg-zinc-500"></div>
                    </div>
                  `, 
                  iconSize: [100, 40], 
                  iconAnchor: [50, 40] 
                })}
              >
                <Popup>
                  <div className="text-center">
                    <p className="font-bold text-red-600">Territory</p>
                    <p className="text-sm">Owned by: {squad?.name || 'Unknown'}</p>
                    {territory.ownerSquadId !== currentUser.squadId && (
                      <button 
                        onClick={() => purchaseTerritory(territory.id)}
                        className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                      >
                        CAPTURE (1000 BC)
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

function createPlayerIcon(squad: Squad | undefined, relation: 'self' | 'ally' | 'enemy', health?: number, name?: string, onlineStatus?: boolean, photoURL?: string) {
  const avatar = squad?.avatarUrl || photoURL || '👤';
  let borderColor = '#ef4444';
  if (relation === 'self') borderColor = '#3b82f6';
  if (relation === 'ally') borderColor = '#10b981';

  const statusDot = onlineStatus !== undefined ? `
    <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-zinc-900 ${onlineStatus ? 'bg-green-500' : 'bg-red-500'} shadow-lg"></div>
  ` : '';

  const healthBar = health !== undefined ? `
    <div class="w-10 h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
      <div 
        class="h-full transition-all duration-300 ${health > 5000 ? 'bg-emerald-500' : health > 2500 ? 'bg-yellow-500' : 'bg-red-500'}"
        style="width: ${(health / 10000) * 100}%"
      ></div>
    </div>
  ` : '';

  const nameLabel = name && relation !== 'self' ? `
    <div class="px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-[10px] font-bold mb-1 whitespace-nowrap ${relation === 'ally' ? 'text-emerald-400' : 'text-red-400'}">
      ${name}
    </div>
  ` : '';

  return L.divIcon({
    className: 'player-icon',
    html: `
      <div class="flex flex-col items-center">
        ${nameLabel}
        <div class="relative" style="
          font-size: 24px;
          background-color: #18181b;
          border: 2px solid ${borderColor};
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        ">
          ${avatar}
          ${statusDot}
        </div>
        ${healthBar}
      </div>
    `,
    iconSize: [40, 60],
    iconAnchor: [20, 40]
  });
}
