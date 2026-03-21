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
  type?: 'bullet' | 'missile' | 'grenade' | 'assault' | 'landmine';
}

export interface User {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  lat: number;
  lng: number;
  lastActive: string;
  health: number;
  ammo: number;
  coins: number;
  points: number;
  level: number;
  squadId: string;
  gunQuality: GunQuality;
  hasAssaultRifle: boolean;
  autoMissiles: number;
  grenades: number;
  landmines: number;
  territoryCount: number;
  onlineStatus: boolean;
  kills: number;
  deaths: number;
  tutorialCompleted?: boolean;
  shieldUntil?: string;
  invisibleUntil?: string;
  createdAt?: any;
}

export interface Landmine {
  id: string;
  ownerId: string;
  lat: number;
  lng: number;
  active: boolean;
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
}

export interface Territory {
  id: string;
  ownerId: string;
  ownerSquadId?: string;
  lat: number;
  lng: number;
  radius: number;
  color: string;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  kills: number;
  territories: number;
}
