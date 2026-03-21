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
  type?: 'bullet' | 'missile' | 'grenade' | 'assault';
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
  squadId: string;
  gunQuality: GunQuality;
  hasAssaultRifle: boolean;
  autoMissiles: number;
  grenades: number;
  territoryCount: number;
  onlineStatus: boolean;
  kills: number;
  deaths: number;
  tutorialCompleted?: boolean;
  shieldUntil?: string;
  invisibleUntil?: string;
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
