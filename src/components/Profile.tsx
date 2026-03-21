import React from 'react';
import { User } from '../types';
import { logout } from '../firebase';
import { LogOut, UserCircle, Bot, Coins } from 'lucide-react';

interface ProfileProps {
  user: User;
  onSpawnBots: () => void;
  onSpawnTenBots: () => void;
  onSpawnTestEntities: () => void;
  onAddCoins: () => void;
  onUpdateAvatar: (avatar: string) => void;
  onClose: () => void;
}

const AVATARS = ['🤠', '👽', '🤖', '👻', '🤡', '👹', '👺', '👾', '🎃', '💀', '💩', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔', '🐉', '🐲'];

export default function Profile({ user, onSpawnBots, onSpawnTenBots, onSpawnTestEntities, onAddCoins, onUpdateAvatar, onClose }: ProfileProps) {
  const [showAvatars, setShowAvatars] = React.useState(false);

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-[10000] overflow-y-auto p-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-wider">Profile</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white font-bold">CLOSE</button>
      </div>
      
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div 
            className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-3xl cursor-pointer hover:bg-zinc-700 transition-colors overflow-hidden relative group"
            onClick={() => setShowAvatars(!showAvatars)}
          >
            {user.photoURL ? (
              user.photoURL.startsWith('http') ? (
                <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user.photoURL}</span>
              )
            ) : (
              <UserCircle className="w-10 h-10 text-cyan-400" />
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] font-bold text-white uppercase">Edit</span>
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{user.displayName}</h3>
            <p className="text-zinc-400 text-sm font-mono">ID: {user.uid.slice(0, 8)}</p>
          </div>
        </div>

        {showAvatars && (
          <div className="mb-6 p-4 bg-zinc-950 rounded-lg border border-zinc-800">
            <h4 className="text-sm font-bold text-zinc-400 uppercase mb-3">Choose Avatar</h4>
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {AVATARS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onUpdateAvatar(emoji);
                    setShowAvatars(false);
                  }}
                  className="text-2xl hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Health</p>
            <p className="text-emerald-400 font-mono text-xl">{user.health}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Box Coins</p>
            <p className="text-yellow-400 font-mono text-xl">{user.coins}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Ammo</p>
            <p className="text-cyan-400 font-mono text-xl">{user.ammo}</p>
          </div>
          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Missiles</p>
            <p className="text-orange-400 font-mono text-xl">{user.autoMissiles}</p>
          </div>
        </div>
      </div>

      <button 
        onClick={onAddCoins}
        className="mb-4 w-full py-4 bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 rounded-xl font-bold text-lg hover:bg-yellow-500/30 transition-colors flex items-center justify-center gap-3"
      >
        <Coins className="w-5 h-5" />
        CLAIM 10,000 BOX COINS
      </button>

      <button 
        onClick={onSpawnTestEntities}
        className="mb-4 w-full py-4 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-bold text-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-3"
      >
        <Bot className="w-5 h-5 text-emerald-400" />
        SPAWN TEST ENEMY & TREASURE
      </button>

      <button 
        onClick={onSpawnTenBots}
        className="mb-4 w-full py-4 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-bold text-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-3"
      >
        <Bot className="w-5 h-5 text-cyan-400" />
        SPAWN 10 BOTS NEARBY
      </button>

      <button 
        onClick={onSpawnBots}
        className="mb-4 w-full py-4 bg-zinc-800 text-white border border-zinc-700 rounded-xl font-bold text-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-3"
      >
        <Bot className="w-5 h-5 text-cyan-400" />
        SPAWN TRAINING BOTS (WORLDWIDE)
      </button>

      <button 
        onClick={logout}
        className="mt-auto w-full py-4 bg-red-600/20 text-red-500 border border-red-600/50 rounded-xl font-bold text-lg hover:bg-red-600/30 transition-colors flex items-center justify-center gap-3"
      >
        <LogOut className="w-5 h-5" />
        SIGN OUT
      </button>
    </div>
  );
}
