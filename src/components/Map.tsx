import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { User, Treasure, Territory } from '../types';
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

interface GameMapProps {
  currentUser: User | null;
  players: User[];
  treasures: Treasure[];
  territories: Territory[];
  onAttack: (enemy: User, useMissile?: boolean) => void;
  onCollectTreasure: (treasure: Treasure) => void;
}

export default function GameMap({ currentUser, players, treasures, territories, onAttack, onCollectTreasure }: GameMapProps) {
  if (!currentUser || !currentUser.lat || !currentUser.lng) {
    return <div className="flex items-center justify-center h-full bg-zinc-900 text-white">Waiting for GPS location...</div>;
  }

  const center: [number, number] = [currentUser.lat, currentUser.lng];

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer center={center} zoom={16} className="w-full h-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ChangeView center={center} zoom={16} />

        {/* Current Player */}
        <Marker position={center} icon={playerIcon}>
          <Popup>
            <div className="text-center">
              <p className="font-bold">{currentUser.displayName}</p>
              <p className="text-sm">Health: {currentUser.health}</p>
              <p className="text-sm">Ammo: {currentUser.ammo}</p>
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
          const inRange = distance <= 100;
          
          // Check invisibility
          const isInvisible = player.invisibleUntil && new Date(player.invisibleUntil) > new Date();
          if (isInvisible) return null;

          return (
            <Marker key={player.uid} position={[player.lat, player.lng]} icon={enemyIcon}>
              <Popup>
                <div className="text-center">
                  <p className="font-bold">{player.displayName}</p>
                  <p className="text-sm">Health: {player.health}</p>
                  <p className="text-xs text-gray-500">{distance}m away</p>
                  <button 
                    onClick={() => onAttack(player)}
                    disabled={!inRange || currentUser.ammo <= 0}
                    className="mt-2 px-4 py-1 bg-red-600 text-white rounded disabled:opacity-50 text-sm font-bold w-full"
                  >
                    {!inRange ? 'Out of Range' : currentUser.ammo <= 0 ? 'No Ammo' : 'ATTACK'}
                  </button>
                  {currentUser.autoMissiles > 0 && (
                    <button 
                      onClick={() => onAttack(player, true)}
                      className="mt-1 px-4 py-1 bg-orange-600 text-white rounded text-sm font-bold w-full flex items-center justify-center gap-1"
                    >
                      🚀 FIRE MISSILE
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Treasures */}
        {treasures.filter(t => t.active).map(treasure => {
          const distance = getDistance(
            { latitude: currentUser.lat, longitude: currentUser.lng },
            { latitude: treasure.lat, longitude: treasure.lng }
          );
          const inRange = distance <= 20;

          return (
            <Marker key={treasure.id} position={[treasure.lat, treasure.lng]} icon={treasureIcon}>
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-yellow-500">Treasure Box</p>
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
            </Marker>
          );
        })}

        {/* Territories */}
        {territories.map(territory => (
          <Circle 
            key={territory.id}
            center={[territory.lat, territory.lng]} 
            pathOptions={{ color: 'rgba(239, 68, 68, 0.4)', fillColor: 'rgba(239, 68, 68, 0.2)' }} 
            radius={500} // ~1km diameter
          >
            <Popup>
              <div className="text-center">
                <p className="font-bold text-red-500">Territory</p>
                <p className="text-sm">Owned by: {territory.ownerSquadId}</p>
              </div>
            </Popup>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}
