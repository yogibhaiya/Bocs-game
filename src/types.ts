export type GunQuality = 'cheap' | 'standard' | 'expensive';

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
}

export interface Squad {
  id: string;
  name: string;
  leaderId: string;
  score: number;
  avatarUrl: string;
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
  ownerSquadId: string;
  lat: number;
  lng: number;
}
