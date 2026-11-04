import React, { useState } from 'react';
import {
  ShieldCheck,
  Layers,
  BookOpen,
  Volume2,
  VolumeX,
  LogOut,
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
    <header className="bunker-nav sticky top-0 z-40">
      <div className="bunker-nav-inner">
        <button
          type="button"
          className="bunker-brand"
          onClick={() => onViewChange('game')}
          aria-label="На главную"
        >
          <span className="bunker-brand-mark" aria-hidden="true">
            <ShieldCheck />
          </span>
          <span className="bunker-brand-copy">
            <span className="bunker-brand-name">Бункер</span>
            <span className="bunker-brand-subtitle">ПРОТОКОЛ ВЫЖИВАНИЯ</span>
          </span>
        </button>

        {roomCode && (
          <div className="bunker-nav-room" title="Код приглашения">
            <span>Комната</span>
            <strong>{roomCode}</strong>
          </div>
        )}

        <nav className="bunker-nav-actions" aria-label="Основная навигация">
          <button
            type="button"
            onClick={() => onViewChange('game')}
            aria-current={currentView === 'game' ? 'page' : undefined}
            className={currentView === 'game' ? 'bunker-nav-link is-active' : 'bunker-nav-link'}
          >
            <Activity aria-hidden="true" />
            <span>Игра</span>
          </button>

          <button
            type="button"
            onClick={() => onViewChange('catalog')}
            aria-current={currentView === 'catalog' ? 'page' : undefined}
            className={currentView === 'catalog' ? 'bunker-nav-link is-active' : 'bunker-nav-link'}
          >
            <Layers aria-hidden="true" />
            <span>Карточки</span>
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            className="bunker-nav-icon"
            title="Правила игры"
            aria-label="Открыть правила"
          >
            <BookOpen aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={toggleSound}
            className="bunker-nav-icon"
            title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
            aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          >
            {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>

          {onExitGame && (
            <button
              type="button"
              onClick={onExitGame}
              className="bunker-nav-exit"
              title={isHost ? 'Закрыть комнату' : 'Покинуть комнату'}
              aria-label={isHost ? 'Закрыть комнату' : 'Покинуть комнату'}
            >
              <LogOut aria-hidden="true" />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
