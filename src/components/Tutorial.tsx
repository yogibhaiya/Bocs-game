import React, { useState } from 'react';
import { Crosshair, Rocket, Bomb, MapPin, Shield, ShoppingCart, Coins } from 'lucide-react';

interface TutorialProps {
  onComplete: () => void;
}

export default function Tutorial({ onComplete }: TutorialProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Box Wars!",
      content: "You are a soldier in a real-world battleground. Your goal is to survive, collect loot, and dominate territories with your squad.",
      icon: <MapPin className="w-16 h-16 text-cyan-400 mb-4" />
    },
    {
      title: "Movement",
      content: "This is a location-based game. To move your character on the map, you need to physically move around in the real world. Your GPS location updates automatically.",
      icon: <MapPin className="w-16 h-16 text-emerald-400 mb-4" />
    },
    {
      title: "Combat",
      content: "Tap the crosshair button to fire bullets at enemies near the center of your screen. Use Missiles for auto-targeting, and Grenades for massive splash damage.",
      icon: <div className="flex gap-4 mb-4">
        <Crosshair className="w-12 h-12 text-cyan-400" />
        <Rocket className="w-12 h-12 text-orange-400" />
        <Bomb className="w-12 h-12 text-red-500" />
      </div>
    },
    {
      title: "Treasures & Loot",
      content: "Walk within 100 meters of a treasure chest on the map and tap it to collect Box Coins. You might even find rare items like grenades!",
      icon: <Coins className="w-16 h-16 text-yellow-400 mb-4" />
    },
    {
      title: "Squads & Territories",
      content: "Join a squad to team up with other players. Work together to capture territories on the map. The squad with the most territories at the end of the week wins!",
      icon: <Shield className="w-16 h-16 text-blue-400 mb-4" />
    },
    {
      title: "The Shop",
      content: "Use your hard-earned Box Coins in the Shop to buy ammo, health packs, better weapons, and defensive items like shields and invisibility cloaks.",
      icon: <ShoppingCart className="w-16 h-16 text-purple-400 mb-4" />
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md z-[20000] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full flex flex-col items-center text-center shadow-2xl">
        {steps[step].icon}
        
        <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-4">
          {steps[step].title}
        </h2>
        
        <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
          {steps[step].content}
        </p>

        <div className="flex gap-2 mb-8">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-cyan-400' : 'bg-zinc-700'}`}
            />
          ))}
        </div>

        <button 
          onClick={handleNext}
          className="w-full py-4 bg-cyan-500 text-zinc-950 rounded-xl font-bold text-lg hover:bg-cyan-400 transition-colors uppercase tracking-wider"
        >
          {step === steps.length - 1 ? "Let's Play!" : "Next"}
        </button>
      </div>
    </div>
  );
}
