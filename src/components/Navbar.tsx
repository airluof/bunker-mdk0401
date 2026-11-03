import React, { useState } from 'react';
import {
  ShieldAlert,
  Layers,
  BookOpen,
  Volume2,
  VolumeX,
  LogOut,
  Radio,
  Activity,
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
    <header className="incident-nav sticky top-0 z-40">
      <div className="incident-nav-inner max-w-7xl mx-auto">
        <div className="incident-nav-brand">
          <div className="incident-nav-mark" aria-hidden="true">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="incident-nav-name">БУНКЕР / МДК.04.01</div>
            <div className="incident-nav-subtitle">
              <span className="incident-nav-status" />
              НЕЙРОТЕХ · DRP-SITE · 2036
            </div>
          </div>
        </div>

        <div className="incident-nav-center">
          {roomCode && (
            <div className="incident-nav-room">
              <Radio className="w-3.5 h-3.5" />
              <span>СЕССИЯ</span>
              <strong>{roomCode}</strong>
            </div>
          )}
        </div>

        <nav className="incident-nav-actions" aria-label="Основная навигация">
          <button
            type="button"
            onClick={() => onViewChange('game')}
            aria-current={currentView === 'game' ? 'page' : undefined}
            className={currentView === 'game' ? 'incident-nav-link is-active' : 'incident-nav-link'}
          >
            <Activity className="w-4 h-4" />
            <span>СТОЛ</span>
          </button>

          <button
            type="button"
            onClick={() => onViewChange('catalog')}
            aria-current={currentView === 'catalog' ? 'page' : undefined}
            className={currentView === 'catalog' ? 'incident-nav-link is-active' : 'incident-nav-link'}
          >
            <Layers className="w-4 h-4" />
            <span>АРХИВ / 180</span>
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            className="incident-nav-icon"
            title="Регламент и правила"
            aria-label="Открыть правила"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleSound}
            className="incident-nav-icon"
            title={soundEnabled ? 'Отключить звук' : 'Включить звук'}
            aria-label={soundEnabled ? 'Отключить звук' : 'Включить звук'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {onExitGame && (
            <button
              type="button"
              onClick={onExitGame}
              className="incident-nav-exit"
              title={isHost ? 'Закрыть комнату или выйти' : 'Покинуть сессию'}
              aria-label={isHost ? 'Закрыть комнату или выйти' : 'Покинуть сессию'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
