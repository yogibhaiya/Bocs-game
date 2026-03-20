export type GunQuality = 'cheap' | 'standard' | 'expensive' | 'elite';

export interface Attack {
  id: string;
  attackerId: string;
  targetId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  timestamp: any;
  type?: 'bullet' | 'missile' | 'grenade';
}

export interface User {
  uid: string;
  displayName: string;
  photoURL: string;
  lat: number;
  lng: number;
  lastActive: string;
  health: number;
  ammo: number;
  coins: number;
  squadId?: string;
  gunQuality: GunQuality;
  shieldUntil?: string;
  invisibleUntil?: string;
  autoMissiles: number;
  grenades: number;
  territoryCount: number;
  onlineStatus: boolean;
}

export interface Squad {
  id: string;
  name: string;
  leaderId: string;
  score: number;
  avatarUrl: string;
  territoryCount: number;
  isWeeklyWinner?: boolean;
}

export interface Treasure {
  id: string;
  lat: number;
  lng: number;
  coins: number;
  active: boolean;
  createdAt: string;
}

export interface Territory {
  id: string;
  ownerId: string;
  ownerSquadId: string;
  lat: number;
  lng: number;
  createdAt: string;
}
