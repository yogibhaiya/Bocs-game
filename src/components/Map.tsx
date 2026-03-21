import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { User, Territory, Treasure, Attack, Landmine } from "../types";

interface MapProps {
  currentUser: User | null;
  players: User[];
  territories: Territory[];
  treasures: Treasure[];
  attacks: Attack[];
  landmines: Landmine[];
  onMapClick: (lat: number, lng: number) => void;
  onCollectTreasure: (treasure: Treasure) => void;
  onAttackPlayer: (targetId: string) => void;
  onTargetChange: (lat: number, lng: number) => void;
}

export default function GameMap({ 
  currentUser, 
  players, 
  territories, 
  treasures, 
  attacks, 
  landmines,
  onMapClick, 
  onCollectTreasure, 
  onAttackPlayer,
  onTargetChange
}: MapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const crosshairRef = useRef<google.maps.Marker | null>(null);
  const markerClasses = useRef<{
    AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
    PinElement: typeof google.maps.marker.PinElement;
  } | null>(null);
  const markers = useRef<Record<string, any>>({});
  const territoryCircles = useRef<Record<string, google.maps.Circle>>({});
  const treasureMarkers = useRef<Record<string, google.maps.Marker>>({});
  const landmineMarkers = useRef<Record<string, google.maps.Marker>>({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // 🟢 INIT MAP (ONLY ONCE)
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const initMap = async () => {
      const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || "";
      
      setOptions({
        key: apiKey,
        v: "weekly",
        libraries: ["maps", "marker"]
      });

      try {
        const [{ Map }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker") as Promise<google.maps.MarkerLibrary>
        ]);
        
        markerClasses.current = { AdvancedMarkerElement, PinElement };

        if (mapRef.current && !mapInstance.current) {
          mapInstance.current = new Map(mapRef.current, {
            center: currentUser ? { lat: currentUser.lat, lng: currentUser.lng } : { lat: 22.57, lng: 88.36 },
            zoom: 15,
            mapId: "DEMO_MAP_ID",
            disableDefaultUI: true,
            zoomControl: true,
          });

          mapInstance.current.addListener("click", (e: any) => {
            onMapClick(e.latLng.lat(), e.latLng.lng());
            onTargetChange(e.latLng.lat(), e.latLng.lng());
            if (crosshairRef.current) {
              crosshairRef.current.setPosition(e.latLng);
            }
          });

          mapInstance.current.addListener("mousemove", (e: any) => {
            onTargetChange(e.latLng.lat(), e.latLng.lng());
            if (crosshairRef.current) {
              crosshairRef.current.setPosition(e.latLng);
            }
          });

          // Create crosshair marker
          crosshairRef.current = new google.maps.Marker({
            position: currentUser ? { lat: currentUser.lat, lng: currentUser.lng } : { lat: 22.57, lng: 88.36 },
            map: mapInstance.current,
            icon: {
              path: "M -10,0 10,0 M 0,-10 0,10",
              strokeColor: "#00FFFF",
              strokeWeight: 2,
              scale: 1
            },
            clickable: false,
            zIndex: 9999
          });

          setIsMapLoaded(true);
        }
      } catch (e) {
        console.error("Error loading Google Maps:", e);
      }
    };

    initMap();
  }, []);

  // 👥 UPDATE PLAYER MARKERS
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current || !markerClasses.current) return;

    const { AdvancedMarkerElement, PinElement } = markerClasses.current;

    players.forEach(player => {
      const isMe = currentUser?.uid === player.uid;
      const isBot = player.uid.startsWith('bot_');
      
      if (!markers.current[player.uid]) {
        const container = document.createElement('div');
        container.className = 'player-marker-container';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        
        const healthBar = document.createElement('div');
        healthBar.className = 'health-bar-bg';
        healthBar.style.width = '40px';
        healthBar.style.height = '4px';
        healthBar.style.background = 'rgba(0,0,0,0.5)';
        healthBar.style.borderRadius = '2px';
        healthBar.style.marginBottom = '2px';
        
        const healthFill = document.createElement('div');
        healthFill.className = 'health-bar-fill';
        healthFill.style.height = '100%';
        healthFill.style.borderRadius = '2px';
        healthFill.style.transition = 'width 0.3s ease';
        healthBar.appendChild(healthFill);
        
        const label = document.createElement('div');
        label.style.fontSize = '10px';
        label.style.fontWeight = 'bold';
        label.style.color = 'white';
        label.style.textShadow = '1px 1px 2px black';
        // Only show label if it's not a URL
        const isUrl = (str: string) => str.startsWith('http://') || str.startsWith('https://');
        label.innerText = isUrl(player.displayName) ? '' : player.displayName;

        let glyphElement: string | Element = '👤';
        if (player.photoURL && isUrl(player.photoURL)) {
          const img = document.createElement('img');
          img.src = player.photoURL;
          img.style.width = '20px';
          img.style.height = '20px';
          img.style.borderRadius = '50%';
          img.referrerPolicy = 'no-referrer';
          glyphElement = img;
        } else if (player.photoURL) {
          glyphElement = player.photoURL;
        }

        const pin = new PinElement({
          glyph: glyphElement,
          background: isMe ? '#4ade80' : (isBot ? '#f87171' : '#60a5fa'),
          borderColor: 'white',
        });

        container.appendChild(healthBar);
        container.appendChild(label);
        container.appendChild(pin.element);

        markers.current[player.uid] = new AdvancedMarkerElement({
          map: mapInstance.current,
          position: { lat: player.lat, lng: player.lng },
          content: container,
          title: player.displayName,
        });

        if (!isMe) {
          markers.current[player.uid].addListener('click', () => {
            onAttackPlayer(player.uid);
          });
        }
      } else {
        const marker = markers.current[player.uid];
        marker.position = { lat: player.lat, lng: player.lng };
        
        const container = marker.content;
        const healthFill = container.querySelector('.health-bar-fill');
        if (healthFill) {
          const healthPct = Math.max(0, Math.min(100, (player.health / 10000) * 100));
          healthFill.style.width = `${healthPct}%`;
          healthFill.style.background = healthPct > 50 ? '#4ade80' : (healthPct > 20 ? '#fbbf24' : '#f87171');
        }
        
        // Hide if dead
        container.style.opacity = player.health > 0 ? '1' : '0.3';
      }
    });

    // Cleanup left players
    Object.keys(markers.current).forEach(uid => {
      if (!players.find(p => p.uid === uid)) {
        markers.current[uid].map = null;
        delete markers.current[uid];
      }
    });
  }, [players, isMapLoaded]);

  // 💥 ATTACK ANIMATIONS
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current || attacks.length === 0) return;

    attacks.forEach(attack => {
      if (attack.type === 'bullet') {
        const line = new google.maps.Polyline({
          path: [
            { lat: attack.fromLat, lng: attack.fromLng },
            { lat: attack.toLat, lng: attack.toLng }
          ],
          geodesic: true,
          strokeColor: '#FF0000',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          map: mapInstance.current
        });
        setTimeout(() => line.setMap(null), 200);
      } else if (attack.type === 'missile') {
        const missile = new google.maps.Marker({
          position: { lat: attack.fromLat, lng: attack.fromLng },
          map: mapInstance.current,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: "#f97316",
            fillOpacity: 1,
            strokeWeight: 1,
            rotation: 0
          }
        });

        let progress = 0;
        const animate = () => {
          progress += 0.05;
          if (progress >= 1) {
            missile.setMap(null);
            return;
          }
          const lat = attack.fromLat + (attack.toLat - attack.fromLat) * progress;
          const lng = attack.fromLng + (attack.toLng - attack.fromLng) * progress;
          missile.setPosition({ lat, lng });
          requestAnimationFrame(animate);
        };
        animate();
      } else if (attack.type === 'grenade') {
        const circle = new google.maps.Circle({
          strokeColor: "#ef4444",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#ef4444",
          fillOpacity: 0.35,
          map: mapInstance.current,
          center: { lat: attack.toLat, lng: attack.toLng },
          radius: 0,
        });

        let radius = 0;
        const animate = () => {
          radius += 5;
          circle.setRadius(radius);
          if (radius < 100) {
            requestAnimationFrame(animate);
          } else {
            setTimeout(() => circle.setMap(null), 500);
          }
        };
        animate();
      } else if (attack.type === 'landmine') {
        const circle = new google.maps.Circle({
          strokeColor: "#ef4444",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#ef4444",
          fillOpacity: 0.5,
          map: mapInstance.current,
          center: { lat: attack.toLat, lng: attack.toLng },
          radius: 0,
        });

        let radius = 0;
        const animate = () => {
          radius += 2;
          circle.setRadius(radius);
          if (radius < 15) {
            requestAnimationFrame(animate);
          } else {
            setTimeout(() => circle.setMap(null), 300);
          }
        };
        animate();
      }
    });
  }, [attacks, isMapLoaded]);

  // 💣 UPDATE LANDMINES
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;

    landmines.forEach(m => {
      // Only show my landmines (as per requirement: Only the player who plays the landmine can see it)
      if (currentUser?.uid !== m.ownerId) {
        if (landmineMarkers.current[m.id]) {
          landmineMarkers.current[m.id].setMap(null);
          delete landmineMarkers.current[m.id];
        }
        return;
      }

      if (!m.active) {
        if (landmineMarkers.current[m.id]) {
          landmineMarkers.current[m.id].setMap(null);
          delete landmineMarkers.current[m.id];
        }
        return;
      }

      if (!landmineMarkers.current[m.id]) {
        landmineMarkers.current[m.id] = new google.maps.Marker({
          position: { lat: m.lat, lng: m.lng },
          map: mapInstance.current,
          icon: {
            url: "https://cdn-icons-png.flaticon.com/512/565/565547.png", // Landmine/Explosive icon
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 12)
          },
          title: `Landmine at ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`,
          clickable: false
        });
      }
    });

    // Cleanup detonated landmines
    Object.keys(landmineMarkers.current).forEach(id => {
      if (!landmines.find(m => m.id === id)) {
        landmineMarkers.current[id].setMap(null);
        delete landmineMarkers.current[id];
      }
    });
  }, [landmines, isMapLoaded, currentUser]);

  // 💎 UPDATE TREASURES
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;

    treasures.forEach(t => {
      if (!t.active) {
        if (treasureMarkers.current[t.id]) {
          treasureMarkers.current[t.id].setMap(null);
          delete treasureMarkers.current[t.id];
        }
        return;
      }

      if (!treasureMarkers.current[t.id]) {
        treasureMarkers.current[t.id] = new google.maps.Marker({
          position: { lat: t.lat, lng: t.lng },
          map: mapInstance.current,
          icon: {
            url: "https://cdn-icons-png.flaticon.com/512/1164/1164957.png",
            scaledSize: new google.maps.Size(30, 30)
          },
          title: `Treasure: ${t.coins} coins`
        });

        treasureMarkers.current[t.id].addListener('click', () => {
          onCollectTreasure(t);
        });
      }
    });
  }, [treasures, isMapLoaded]);

  // 🚩 UPDATE TERRITORIES
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) return;

    territories.forEach(t => {
      const color = t.color || '#10b981';
      if (!territoryCircles.current[t.id]) {
        territoryCircles.current[t.id] = new google.maps.Circle({
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.35,
          map: mapInstance.current,
          center: { lat: t.lat, lng: t.lng },
          radius: t.radius || 100,
        });
      } else {
        const circle = territoryCircles.current[t.id];
        circle.setOptions({
          fillColor: color,
          strokeColor: color,
          radius: t.radius || 100,
          center: { lat: t.lat, lng: t.lng }
        });
      }
    });
  }, [territories, isMapLoaded]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full"
      id="game-map-container"
    />
  );
}
