import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Rectangle, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { User, Treasure, Territory, Squad } from '../types';
import { getDistance } from 'geolib';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const playerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/2.0.0/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const enemyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/2.0.0/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const treasureIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/2.0.0/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to dynamically update map center
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

const getPlayerIcon = (squad?: Squad, relation: 'self' | 'ally' | 'enemy' = 'enemy') => {
  const avatar = squad?.avatarUrl || '👤';
  let borderColor = '#ef4444'; // red for enemies
  if (relation === 'self') borderColor = '#3b82f6'; // blue for me
  if (relation === 'ally') borderColor = '#10b981'; // emerald for squad members
  
  return L.divIcon({
    className: 'bg-transparent border-none',
    html: `<div style="
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
    ">${avatar}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
};

interface GameMapProps {
  currentUser: User | null;
  players: User[];
  squads: Squad[];
  treasures: Treasure[];
  territories: Territory[];
  onAttack: (enemy: User, useMissile?: boolean) => void;
  onCollectTreasure: (treasure: Treasure) => void;
  onClaimTerritory: (territoryId?: string) => void;
}

export default function GameMap({ currentUser, players, squads, treasures, territories, onAttack, onCollectTreasure, onClaimTerritory }: GameMapProps) {
  if (!currentUser || !currentUser.lat || !currentUser.lng) {
    return <div className="flex items-center justify-center h-full bg-zinc-900 text-white">Waiting for GPS location...</div>;
  }

  const center: [number, number] = [currentUser.lat, currentUser.lng];
  const mySquad = squads.find(s => s.id === currentUser.squadId);

  // Calculate 1km grid cells
  const gridCells = useMemo(() => {
    const cells = [];
    const latStep = 1 / 111.32; // ~1km in degrees latitude
    const lngStep = 1 / (111.32 * Math.cos(currentUser.lat * (Math.PI / 180))); // ~1km in degrees longitude

    const currentLatIndex = Math.floor(currentUser.lat / latStep);
    const currentLngIndex = Math.floor(currentUser.lng / lngStep);

    const GRID_RADIUS = 3; // 3 cells in each direction = 7x7 grid

    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
      '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'
    ];

    for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) {
      for (let j = -GRID_RADIUS; j <= GRID_RADIUS; j++) {
        const latIdx = currentLatIndex + i;
        const lngIdx = currentLngIndex + j;
        
        const south = latIdx * latStep;
        const north = (latIdx + 1) * latStep;
        const west = lngIdx * lngStep;
        const east = (lngIdx + 1) * lngStep;

        // Deterministic color based on coordinates
        const hash = Math.abs(latIdx * 73856093 ^ lngIdx * 19349663);
        const color = colors[hash % colors.length];

        cells.push({
          id: `${latIdx}_${lngIdx}`,
          bounds: [[south, west], [north, east]] as [[number, number], [number, number]],
          color
        });
      }
    }
    return cells;
  }, [currentUser.lat, currentUser.lng]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer center={center} zoom={16} className="w-full h-full z-0" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ChangeView center={center} zoom={16} />

        {/* 1km Grid Overlay */}
        {gridCells.map(cell => (
          <Rectangle 
            key={cell.id}
            bounds={cell.bounds}
            pathOptions={{ 
              color: cell.color, 
              fillColor: cell.color, 
              fillOpacity: 0.15, 
              weight: 2,
              opacity: 0.5
            }}
            interactive={false}
          />
        ))}

        {/* Current Player */}
        <Marker position={center} icon={getPlayerIcon(mySquad, 'self')}>
          <Tooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent className="bg-zinc-900 border-zinc-800 text-white font-bold">
            You {mySquad && <span className="text-blue-400">[{mySquad.name}]</span>}
          </Tooltip>
          <Popup>
            <div className="text-center">
              <p className="font-bold">{currentUser.displayName}</p>
              <p className="text-sm">Health: {currentUser.health}</p>
              <p className="text-sm">Ammo: {currentUser.ammo}</p>
              {currentUser.squadId && (
                <button 
                  onClick={onClaimTerritory}
                  className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                >
                  BUY / CLAIM TERRITORY (100 BC)
                </button>
              )}
            </div>
          </Popup>
        </Marker>

        {/* Attack Range Circle (100m) */}
        <Circle center={center} pathOptions={{ color: 'rgba(59, 130, 246, 0.2)', fillColor: 'rgba(59, 130, 246, 0.1)' }} radius={100} />

        {/* Other Players */}
        {players.filter(p => p.uid !== currentUser.uid).map(player => {
          const distance = getDistance(
            { latitude: currentUser.lat, longitude: currentUser.lng },
            { latitude: player.lat, longitude: player.lng }
          );
          const inRange = true; // Allow attacking players in different zones
          
          const isAlly = currentUser.squadId && currentUser.squadId === player.squadId;
          const relation = isAlly ? 'ally' : 'enemy';

          // Check invisibility
          const isInvisible = player.invisibleUntil && new Date(player.invisibleUntil) > new Date();
          if (isInvisible && !isAlly) return null; // Allies can always see each other

          const playerSquad = squads.find(s => s.id === player.squadId);

          return (
            <Marker key={player.uid} position={[player.lat, player.lng]} icon={getPlayerIcon(playerSquad, relation)}>
              <Tooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent className={`bg-zinc-900 border-zinc-800 font-bold ${isAlly ? 'text-emerald-400' : 'text-red-400'}`}>
                {player.displayName} {playerSquad && <span className="opacity-75">[{playerSquad.name}]</span>}
              </Tooltip>
              <Popup>
                <div className="text-center">
                  <p className="font-bold">{player.displayName}</p>
                  {playerSquad && <p className="text-xs text-zinc-400 mb-1">{playerSquad.name}</p>}
                  <p className="text-sm">Health: {player.health}</p>
                  <p className="text-xs text-gray-500">{distance}m away</p>
                  {!isAlly && (
                    <>
                      <button 
                        onClick={() => onAttack(player)}
                        disabled={currentUser.ammo <= 0 || player.health <= 0}
                        className="mt-2 px-4 py-1 bg-red-600 text-white rounded disabled:opacity-50 text-sm font-bold w-full"
                      >
                        {player.health <= 0 ? 'Eliminated' : currentUser.ammo <= 0 ? 'No Ammo' : 'ATTACK'}
                      </button>
                      {currentUser.autoMissiles > 0 && player.health > 0 && (
                        <button 
                          onClick={() => onAttack(player, true)}
                          className="mt-1 px-4 py-1 bg-orange-600 text-white rounded text-sm font-bold w-full flex items-center justify-center gap-1"
                        >
                          🚀 FIRE MISSILE
                        </button>
                      )}
                    </>
                  )}
                  {isAlly && (
                    <p className="mt-2 text-xs font-bold text-emerald-500 bg-emerald-500/10 py-1 rounded">SQUAD ALLY</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Treasures (Square Zones) */}
        {treasures.filter(t => t.active).map(treasure => {
          const distance = getDistance(
            { latitude: currentUser.lat, longitude: currentUser.lng },
            { latitude: treasure.lat, longitude: treasure.lng }
          );
          const inRange = distance <= 20;

          // Create a 20m square around the treasure
          const latOffset = 20 / 111320;
          const lngOffset = 20 / (111320 * Math.cos(treasure.lat * Math.PI / 180));
          const bounds: [[number, number], [number, number]] = [
            [treasure.lat - latOffset, treasure.lng - lngOffset],
            [treasure.lat + latOffset, treasure.lng + lngOffset]
          ];

          return (
            <Rectangle 
              key={treasure.id} 
              bounds={bounds}
              pathOptions={{ 
                color: '#eab308', 
                weight: 2, 
                fillColor: '#fef08a', 
                fillOpacity: inRange ? 0.6 : 0.3,
                dashArray: '4, 4'
              }}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-yellow-500">Treasure Hunt Zone</p>
                  <p className="text-sm">{treasure.coins} Box Coins</p>
                  <p className="text-xs text-gray-500">{distance}m away</p>
                  <button 
                    onClick={() => onCollectTreasure(treasure)}
                    disabled={!inRange}
                    className="mt-2 px-4 py-1 bg-yellow-500 text-black rounded disabled:opacity-50 text-sm font-bold w-full"
                  >
                    {inRange ? 'COLLECT' : 'Move Closer (20m)'}
                  </button>
                </div>
              </Popup>
            </Rectangle>
          );
        })}

        {/* Territories */}
        {territories.map(territory => {
          const squad = squads.find(s => s.id === territory.ownerSquadId);
          const distance = getDistance(
            { latitude: currentUser.lat, longitude: currentUser.lng },
            { latitude: territory.lat, longitude: territory.lng }
          );
          const inCaptureZone = distance <= 200;

          const flagIcon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `<div style="display: flex; flex-direction: column; align-items: center;">
                     <div style="background-color: #18181b; border: 2px solid #10b981; color: #34d399; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);">
                       🚩 ${squad?.name || 'Unknown Squad'}
                     </div>
                     <div style="width: 4px; height: 24px; background-color: #a1a1aa;"></div>
                   </div>`,
            iconSize: [120, 50],
            iconAnchor: [60, 50]
          });

          return (
            <React.Fragment key={territory.id}>
              {/* Influence Zone (500m) */}
              <Circle 
                center={[territory.lat, territory.lng]} 
                pathOptions={{ color: 'rgba(239, 68, 68, 0.4)', fillColor: 'rgba(239, 68, 68, 0.1)', dashArray: '5, 10' }} 
                radius={500}
              />
              
              {/* Capture Zone (200m) */}
              <Circle 
                center={[territory.lat, territory.lng]} 
                pathOptions={{ 
                  color: inCaptureZone ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.6)', 
                  fillColor: inCaptureZone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                  weight: inCaptureZone ? 3 : 2
                }} 
                radius={200}
              >
                <Popup>
                  <div className="text-center">
                    <p className="font-bold text-red-500">Capture Zone</p>
                    <p className="text-sm">Owned by: {squad?.name || territory.ownerSquadId}</p>
                    {inCaptureZone && (
                      <>
                        <p className="text-xs text-emerald-500 font-bold mt-1">You are in the capture zone!</p>
                        {territory.ownerSquadId !== currentUser.squadId && (
                          <button 
                            onClick={() => onClaimTerritory(territory.id)}
                            className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                          >
                            CAPTURE (100 BC)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </Popup>
              </Circle>

              {/* Squad Flag */}
              <Marker position={[territory.lat, territory.lng]} icon={flagIcon} />
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
