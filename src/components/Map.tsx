import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin, 
  InfoWindow, 
  useMap, 
  useMapsLibrary,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import { User, Treasure, Territory, Squad, Attack } from '../types';
import { getDistance } from 'geolib';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// Custom Circle component for Google Maps
function GoogleCircle({ center, radius, options }: { 
  center: google.maps.LatLngLiteral, 
  radius: number, 
  options?: google.maps.CircleOptions 
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    circleRef.current = new google.maps.Circle({
      map,
      center,
      radius,
      ...options
    });
    return () => {
      if (circleRef.current) circleRef.current.setMap(null);
    };
  }, [map, center, radius, options]);

  return null;
}

// Custom Rectangle component for Google Maps
function GoogleRectangle({ bounds, options }: { 
  bounds: google.maps.LatLngBoundsLiteral, 
  options?: google.maps.RectangleOptions 
}) {
  const map = useMap();
  const rectRef = useRef<google.maps.Rectangle | null>(null);

  useEffect(() => {
    if (!map) return;
    rectRef.current = new google.maps.Rectangle({
      map,
      bounds,
      ...options
    });
    return () => {
      if (rectRef.current) rectRef.current.setMap(null);
    };
  }, [map, bounds, options]);

  return null;
}

const Projectile = ({ start, end, type }: { start: [number, number], end: [number, number], type?: 'bullet' | 'missile' | 'grenade' }) => {
  const [pos, setPos] = useState({ lat: start[0], lng: start[1] });
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setPos({ lat: end[0], lng: end[1] });
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

  return (
    <AdvancedMarker position={pos} zIndex={1000}>
      <div style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: type === 'missile' ? '2px' : '50%',
        transform: type === 'missile' ? 'rotate(45deg)' : 'none',
        boxShadow: shadow,
        transition: 'all 0.5s linear'
      }} />
    </AdvancedMarker>
  );
};

function MapTargeter({ fireTrigger, missileTrigger, players, currentUser, onAttack }: { 
  fireTrigger: number, 
  missileTrigger: number,
  players: User[], 
  currentUser: User, 
  onAttack: (enemy: User, useMissile?: boolean) => void 
}) {
  const map = useMap();
  const lastFireTrigger = useRef(fireTrigger);
  const lastMissileTrigger = useRef(missileTrigger);

  useEffect(() => {
    const isWeaponFire = fireTrigger > lastFireTrigger.current;
    const isMissileFire = missileTrigger > lastMissileTrigger.current;

    if (isWeaponFire || isMissileFire) {
      if (currentUser.health <= 0 || !map) return;
      
      const center = map.getCenter();
      if (!center) return;
      const targetLatLng = { latitude: center.lat(), longitude: center.lng() };
      
      const enemies = players.filter(p => 
        p.uid !== currentUser.uid && 
        p.squadId !== currentUser.squadId && 
        p.health > 0
      );

      let bestTarget: User | null = null;
      let minTargetDist = Infinity;

      for (const enemy of enemies) {
        const distToCrosshair = getDistance(targetLatLng, { latitude: enemy.lat, longitude: enemy.lng });
        const distToPlayer = getDistance({ latitude: currentUser.lat, longitude: currentUser.lng }, { latitude: enemy.lat, longitude: enemy.lng });
        
        const maxRange = isMissileFire ? 300 : 100;
        
        if (distToCrosshair < 50 && distToPlayer < maxRange) {
          if (distToCrosshair < minTargetDist) {
            minTargetDist = distToCrosshair;
            bestTarget = enemy;
          }
        }
      }

      if (bestTarget) {
        onAttack(bestTarget, isMissileFire);
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } else {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
        audio.volume = 0.1;
        audio.play().catch(() => {});
      }
    }

    lastFireTrigger.current = fireTrigger;
    lastMissileTrigger.current = missileTrigger;
  }, [fireTrigger, missileTrigger, map, players, currentUser, onAttack]);

  return null;
}

interface GameMapProps {
  currentUser: User | null;
  players: User[];
  squads: Squad[];
  treasures: Treasure[];
  territories: Territory[];
  attacks: Attack[];
  onAttack: (enemy: User, useMissile?: boolean) => void;
  onCollectTreasure: (treasure: Treasure) => void;
  onClaimTerritory: (territoryId?: string) => void;
  fireTrigger: number;
  missileTrigger: number;
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
    onCollectTreasure, 
    onClaimTerritory, 
    fireTrigger,
    missileTrigger,
    targetId
  } = props;

  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900 text-white p-6">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-cyan-400">Google Maps API Key Required</h2>
          <p className="mb-6 text-zinc-400">To enable the tactical map, please add your Google Maps API key to the project secrets.</p>
          <div className="bg-zinc-800 p-4 rounded-lg text-left space-y-4 text-sm">
            <p><strong>Step 1:</strong> Get an API Key from the <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" className="text-cyan-400 underline">Google Cloud Console</a>.</p>
            <p><strong>Step 2:</strong> Open <strong>Settings</strong> (⚙️ gear icon) → <strong>Secrets</strong>.</p>
            <p><strong>Step 3:</strong> Add <code>GOOGLE_MAPS_PLATFORM_KEY</code> with your key value.</p>
          </div>
          <p className="mt-6 text-xs text-zinc-500 italic">The app will rebuild automatically once the secret is added.</p>
        </div>
      </div>
    );
  }

  if (!currentUser || !currentUser.lat || !currentUser.lng) {
    return <div className="flex items-center justify-center h-full bg-zinc-900 text-white">Waiting for GPS location...</div>;
  }

  const center = { lat: currentUser.lat, lng: currentUser.lng };
  const targetPlayer = targetId ? players.find(p => p.uid === targetId) : null;
  const mapCenter = targetPlayer ? { lat: targetPlayer.lat, lng: targetPlayer.lng } : center;
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

  const gridCells = useMemo(() => {
    const cells = [];
    const latStep = 1 / 111.32;
    const lngStep = 1 / (111.32 * Math.cos(currentUser.lat * (Math.PI / 180)));
    const currentLatIndex = Math.floor(currentUser.lat / latStep);
    const currentLngIndex = Math.floor(currentUser.lng / lngStep);
    const GRID_RADIUS = 3;
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

    for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) {
      for (let j = -GRID_RADIUS; j <= GRID_RADIUS; j++) {
        const latIdx = currentLatIndex + i;
        const lngIdx = currentLngIndex + j;
        const south = latIdx * latStep;
        const north = (latIdx + 1) * latStep;
        const west = lngIdx * lngStep;
        const east = (lngIdx + 1) * lngStep;
        const hash = Math.abs(latIdx * 73856093 ^ lngIdx * 19349663);
        const color = colors[hash % colors.length];
        cells.push({
          id: `${latIdx}_${lngIdx}`,
          bounds: { south, north, west, east },
          color
        });
      }
    }
    return cells;
  }, [currentUser.lat, currentUser.lng]);

  const [selectedInfo, setSelectedInfo] = useState<{
    type: 'player' | 'treasure' | 'territory' | 'self',
    data: any,
    position: google.maps.LatLngLiteral
  } | null>(null);

  return (
    <div className="w-full h-full relative z-0">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none">
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

      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={mapCenter}
          center={mapCenter}
          defaultZoom={16}
          mapId="DEMO_MAP_ID"
          disableDefaultUI={true}
          gestureHandling={'greedy'}
          // @ts-ignore
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className="w-full h-full"
          styles={[
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
            { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
            { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
            { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
            { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
            { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
          ]}
        >
          <MapTargeter 
            fireTrigger={fireTrigger} 
            missileTrigger={missileTrigger}
            currentUser={currentUser} 
            players={players} 
            onAttack={onAttack} 
          />

          {/* 1km Grid Overlay */}
          {gridCells.map(cell => (
            <GoogleRectangle 
              key={cell.id}
              bounds={cell.bounds}
              options={{ 
                strokeColor: cell.color, 
                strokeOpacity: 0.5,
                strokeWeight: 2,
                fillColor: cell.color, 
                fillOpacity: 0.15,
                clickable: false
              }}
            />
          ))}

          {/* Current Player */}
          <AdvancedMarker 
            position={center} 
            onClick={() => setSelectedInfo({ type: 'self', data: currentUser, position: center })}
          >
            <PlayerMarker squad={mySquad} relation="self" />
          </AdvancedMarker>

          {/* Attack Range Circle (100m) */}
          <GoogleCircle 
            center={center} 
            radius={100} 
            options={{ 
              strokeColor: '#3b82f6', 
              strokeOpacity: 0.2, 
              fillColor: '#3b82f6', 
              fillOpacity: 0.1,
              clickable: false
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
          {players.filter(p => p.uid !== currentUser.uid).map(player => {
            const isAlly = currentUser.squadId && currentUser.squadId === player.squadId;
            const relation = isAlly ? 'ally' : 'enemy';
            const isInvisible = player.invisibleUntil && new Date(player.invisibleUntil) > new Date();
            if (isInvisible && !isAlly) return null;

            const playerSquad = squads.find(s => s.id === player.squadId);
            const pos = { lat: player.lat, lng: player.lng };

            return (
              <AdvancedMarker 
                key={player.uid} 
                position={pos} 
                onClick={() => setSelectedInfo({ type: 'player', data: player, position: pos })}
              >
                <div className="flex flex-col items-center">
                  <div className={`px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-800 text-[10px] font-bold mb-1 whitespace-nowrap ${isAlly ? 'text-emerald-400' : 'text-red-400'}`}>
                    {player.displayName}
                  </div>
                  <PlayerMarker squad={playerSquad} relation={relation} health={player.health} />
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Treasures */}
          {treasures.filter(t => t.active).map(treasure => {
            const pos = { lat: treasure.lat, lng: treasure.lng };
            const latOffset = 20 / 111320;
            const lngOffset = 20 / (111320 * Math.cos(treasure.lat * Math.PI / 180));
            const bounds = {
              south: treasure.lat - latOffset,
              north: treasure.lat + latOffset,
              west: treasure.lng - lngOffset,
              east: treasure.lng + lngOffset
            };

            return (
              <React.Fragment key={treasure.id}>
                <GoogleRectangle 
                  bounds={bounds}
                  options={{
                    strokeColor: '#eab308',
                    strokeWeight: 2,
                    fillColor: '#fef08a',
                    fillOpacity: 0.3,
                    clickable: true
                  }}
                />
                <AdvancedMarker 
                  position={pos} 
                  onClick={() => setSelectedInfo({ type: 'treasure', data: treasure, position: pos })}
                >
                  <div className="text-xl">💰</div>
                </AdvancedMarker>
              </React.Fragment>
            );
          })}

          {/* Territories */}
          {territories.map(territory => {
            const squad = squads.find(s => s.id === territory.ownerSquadId);
            const pos = { lat: territory.lat, lng: territory.lng };

            return (
              <React.Fragment key={territory.id}>
                <GoogleCircle 
                  center={pos} 
                  radius={500} 
                  options={{ strokeColor: '#ef4444', strokeOpacity: 0.4, fillOpacity: 0.05, clickable: false }} 
                />
                <GoogleCircle 
                  center={pos} 
                  radius={200} 
                  options={{ 
                    strokeColor: territory.ownerSquadId === currentUser.squadId ? '#10b981' : '#ef4444', 
                    fillColor: territory.ownerSquadId === currentUser.squadId ? '#10b981' : '#ef4444',
                    fillOpacity: 0.2,
                    clickable: true
                  }} 
                />
                <AdvancedMarker 
                  position={pos} 
                  onClick={() => setSelectedInfo({ type: 'territory', data: territory, position: pos })}
                >
                  <div className="flex flex-col items-center">
                    <div className="bg-zinc-900 border-2 border-emerald-500 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold shadow-lg">
                      🚩 {squad?.name || 'Unknown'}
                    </div>
                    <div className="w-1 h-6 bg-zinc-500" />
                  </div>
                </AdvancedMarker>
              </React.Fragment>
            );
          })}

          {/* Info Windows */}
          {selectedInfo && (
            <InfoWindow 
              position={selectedInfo.position} 
              onCloseClick={() => setSelectedInfo(null)}
            >
              <div className="p-2 text-zinc-900 min-w-[150px]">
                {selectedInfo.type === 'self' && (
                  <div className="text-center">
                    <p className="font-bold">{currentUser.displayName}</p>
                    <p className="text-sm">Health: {currentUser.health}</p>
                    <p className="text-sm">Ammo: {currentUser.ammo}</p>
                    {currentUser.squadId && (
                      <button 
                        onClick={() => { onClaimTerritory(); setSelectedInfo(null); }}
                        className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                      >
                        CLAIM TERRITORY (100 BC)
                      </button>
                    )}
                  </div>
                )}
                {selectedInfo.type === 'player' && (
                  <div className="text-center">
                    <p className="font-bold">{selectedInfo.data.displayName}</p>
                    <p className="text-sm">Health: {selectedInfo.data.health}</p>
                    <button 
                      onClick={() => { onAttack(selectedInfo.data); setSelectedInfo(null); }}
                      disabled={currentUser.ammo <= 0 || selectedInfo.data.health <= 0}
                      className="mt-2 px-4 py-1 bg-red-600 text-white rounded disabled:opacity-50 text-sm font-bold w-full"
                    >
                      ATTACK
                    </button>
                  </div>
                )}
                {selectedInfo.type === 'treasure' && (
                  <div className="text-center">
                    <p className="font-bold text-yellow-600">Treasure Zone</p>
                    <p className="text-sm">{selectedInfo.data.coins} Box Coins</p>
                    <button 
                      onClick={() => { onCollectTreasure(selectedInfo.data); setSelectedInfo(null); }}
                      className="mt-2 px-4 py-1 bg-yellow-500 text-black rounded text-sm font-bold w-full"
                    >
                      COLLECT
                    </button>
                  </div>
                )}
                {selectedInfo.type === 'territory' && (
                  <div className="text-center">
                    <p className="font-bold text-red-600">Capture Zone</p>
                    <p className="text-sm">Owned by: {squads.find(s => s.id === selectedInfo.data.ownerSquadId)?.name || 'Unknown'}</p>
                    {selectedInfo.data.ownerSquadId !== currentUser.squadId && (
                      <button 
                        onClick={() => { onClaimTerritory(selectedInfo.data.id); setSelectedInfo(null); }}
                        className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded text-sm font-bold w-full"
                      >
                        CAPTURE (100 BC)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}

function PlayerMarker({ squad, relation, health }: { squad?: Squad, relation: 'self' | 'ally' | 'enemy', health?: number }) {
  const avatar = squad?.avatarUrl || '👤';
  let borderColor = '#ef4444';
  if (relation === 'self') borderColor = '#3b82f6';
  if (relation === 'ally') borderColor = '#10b981';

  return (
    <div className="flex flex-col items-center">
      <div style={{
        fontSize: '24px',
        backgroundColor: '#18181b',
        border: `2px solid ${borderColor}`,
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
      }}>
        {avatar}
      </div>
      {health !== undefined && (
        <div className="w-10 h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${health > 5000 ? 'bg-emerald-500' : health > 2500 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${(health / 10000) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
