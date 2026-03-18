import React, { useState } from 'react';
import { User, Squad as SquadType } from '../types';
import { Users, Plus, LogOut } from 'lucide-react';
import { doc, setDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../hooks/useGameData';

interface SquadProps {
  user: User;
  squads: SquadType[];
  players: User[];
  onClose: () => void;
}

const SQUAD_AVATARS = ['🥷', '🧙‍♂️', '🧟', '🤖', '👽', '🤠', '🧛', '🦸‍♂️', '🦹', '👮'];

export default function Squad({ user, squads, players, onClose }: SquadProps) {
  const [newSquadName, setNewSquadName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(SQUAD_AVATARS[0]);

  const mySquad = squads.find(s => s.id === user.squadId);
  const squadMembers = players.filter(p => p.squadId === mySquad?.id);

  const createSquad = async () => {
    if (!newSquadName.trim()) return;
    const newId = `squad_${Date.now()}`;
    
    try {
      await setDoc(doc(db, 'squads', newId), {
        id: newId,
        name: newSquadName,
        leaderId: user.uid,
        score: 0,
        avatarUrl: selectedAvatar
      });

      await updateDoc(doc(db, 'users', user.uid), {
        squadId: newId
      });
      
      setNewSquadName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `squads/${newId}`);
    }
  };

  const joinSquad = async (squadId: string) => {
    const targetSquadMembers = players.filter(p => p.squadId === squadId);
    if (targetSquadMembers.length >= 6) {
      alert("Squad is full (max 6 players)");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        squadId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const leaveSquad = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        squadId: null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-50 flex flex-col p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <Users className="text-emerald-400" />
          SQUAD
        </h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">Close</button>
      </div>

      {mySquad ? (
        <div className="flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-4xl">
              {mySquad.avatarUrl}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">{mySquad.name}</h3>
              <p className="text-emerald-400 font-mono">Score: {mySquad.score}</p>
            </div>
            <button onClick={leaveSquad} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <div>
            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">Members ({squadMembers.length}/6)</h4>
            <div className="grid gap-3">
              {squadMembers.map(member => (
                <div key={member.uid} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xl">
                      {mySquad.avatarUrl}
                    </div>
                    <span className="text-white font-medium">{member.displayName}</span>
                    {member.uid === mySquad.leaderId && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">LEADER</span>}
                  </div>
                  <span className="text-zinc-500 font-mono text-sm">{member.health} HP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Create a Squad</h3>
            
            <div className="mb-4">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Choose Squad Character</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {SQUAD_AVATARS.map(avatar => (
                  <button
                    key={avatar}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`w-12 h-12 flex-shrink-0 rounded-xl text-2xl flex items-center justify-center transition-all ${
                      selectedAvatar === avatar 
                        ? 'bg-emerald-500/20 border-2 border-emerald-500' 
                        : 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={newSquadName}
                onChange={e => setNewSquadName(e.target.value)}
                placeholder="Squad Name"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={createSquad}
                disabled={!newSquadName.trim()}
                className="bg-emerald-500 text-zinc-950 px-6 py-2 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" /> CREATE
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">Join a Squad</h4>
            <div className="grid gap-3">
              {squads.map(squad => {
                const memberCount = players.filter(p => p.squadId === squad.id).length;
                return (
                  <div key={squad.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
                        {squad.avatarUrl}
                      </div>
                      <div>
                        <h4 className="text-white font-bold">{squad.name}</h4>
                        <p className="text-zinc-500 text-sm">{memberCount}/6 Members</p>
                      </div>
                    </div>
                    <button
                      onClick={() => joinSquad(squad.id)}
                      disabled={memberCount >= 6}
                      className="px-4 py-2 bg-zinc-800 text-white rounded-lg font-bold text-sm hover:bg-zinc-700 disabled:opacity-50"
                    >
                      JOIN
                    </button>
                  </div>
                );
              })}
              {squads.length === 0 && <p className="text-zinc-500 italic">No squads available. Create one!</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
