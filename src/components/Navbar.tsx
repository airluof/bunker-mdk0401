import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Layers, 
  BookOpen, 
  Volume2, 
  VolumeX, 
  LogOut, 
  Radio, 
  Terminal,
  Activity
} from 'lucide-react';
import { sound } from '../services/sound';

interface NavbarProps {
  currentView: 'game' | 'catalog';
  onViewChange: (view: 'game' | 'catalog') => void;
  onOpenRules: () => void;
  roomCode?: string;
  isHost?: boolean;
  onExitGame?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  onOpenRules,
  roomCode,
  isHost,
  onExitGame,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);

  const toggleSound = () => {
    sound.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-900/30">
            <ShieldAlert className="w-5 h-5 text-slate-950" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-tactical font-bold text-white tracking-wider">
                БУНКЕР // МДК.04.01
              </span>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono-tech bg-rose-500/20 text-rose-300 border border-rose-500/40">
                DRP-SITE 2036
              </span>
            </div>
            <div className="text-[10px] font-mono-tech text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-status-pulse" />
              <span>НЕЙРОТЕХ • АВАРИЙНЫЙ ЦОД</span>
            </div>
          </div>
        </div>

        {/* Room Code Indicator if in game */}
        {roomCode && (
          <div className="hidden md:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-xs font-mono-tech text-slate-400">СЕССИЯ:</span>
            <span className="text-xs font-mono-tech font-bold text-cyan-300 tracking-wider">
              {roomCode}
            </span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <button
            onClick={() => onViewChange('game')}
            className={`px-3 py-1.5 rounded-lg text-xs font-tactical font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              currentView === 'game'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СТОЛ</span>
          </button>

          <button
            onClick={() => onViewChange('catalog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-tactical font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              currentView === 'catalog'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">180 КАРТ</span>
          </button>

          <button
            onClick={onOpenRules}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-tactical uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            title="Регламент и правила"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">ПРАВИЛА</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            title={soundEnabled ? 'Звук включен' : 'Звук выключен'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Exit / Reset */}
          {onExitGame && (
            <button
              onClick={onExitGame}
              className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 transition-colors"
              title="Покинуть сессию"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
