import React from 'react';
import { User } from '../types';
import { ShoppingCart, Heart, Crosshair, Shield, EyeOff, Rocket, Zap } from 'lucide-react';

interface ShopProps {
  user: User;
  onBuy: (type: 'ammo' | 'health' | 'gun_standard' | 'gun_expensive' | 'shield' | 'invisibility' | 'missile', cost: number) => void;
  onClose: () => void;
}

export default function Shop({ user, onBuy, onClose }: ShopProps) {
  const items = [
    { id: 'ammo', name: 'Ammo Pack (+30)', cost: 10, icon: Crosshair, type: 'ammo' },
    { id: 'health', name: 'Medkit (Full HP)', cost: 20, icon: Heart, type: 'health' },
    { id: 'gun_standard', name: 'Standard Gun', cost: 100, icon: Zap, type: 'gun_standard', desc: 'Higher accuracy' },
    { id: 'gun_expensive', name: 'Pro Gun', cost: 300, icon: Zap, type: 'gun_expensive', desc: 'Max accuracy, low recoil' },
    { id: 'shield', name: 'Energy Shield', cost: 50, icon: Shield, type: 'shield', desc: 'Invincible for 4 mins' },
    { id: 'invisibility', name: 'Stealth Cloak', cost: 150, icon: EyeOff, type: 'invisibility', desc: 'Invisible on map for 30 mins' },
    { id: 'missile', name: 'Auto Missile', cost: 200, icon: Rocket, type: 'missile', desc: 'Tracks enemy automatically' },
  ];

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-50 flex flex-col p-6 pt-[max(8rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <ShoppingCart className="text-cyan-400" />
          BOCS SHOP
        </h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">Close</button>
      </div>

      <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex justify-between items-center">
        <span className="text-zinc-400">Your Balance</span>
        <span className="text-2xl font-mono text-yellow-400 font-bold">{user.coins} BC</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{item.name}</h3>
                  {item.desc && <p className="text-xs text-zinc-500">{item.desc}</p>}
                </div>
              </div>
              <span className="font-mono text-yellow-500 font-bold">{item.cost} BC</span>
            </div>
            
            <button
              onClick={() => onBuy(item.type as any, item.cost)}
              disabled={user.coins < item.cost}
              className="w-full py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
            >
              {user.coins >= item.cost ? 'PURCHASE' : 'INSUFFICIENT FUNDS'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
