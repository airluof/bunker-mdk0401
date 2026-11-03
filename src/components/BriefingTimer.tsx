import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Clock, AlertCircle } from 'lucide-react';
import { sound } from '../services/sound';

interface BriefingTimerProps {
  initialSeconds?: number;
  activeSpeakerName?: string;
  onTimeExpired?: () => void;
}

export const BriefingTimer: React.FC<BriefingTimerProps> = ({
  initialSeconds = 60,
  activeSpeakerName,
  onTimeExpired,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    setIsActive(false);
  }, [initialSeconds, activeSpeakerName]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((previous) => {
          if (previous <= 1) {
            sound.playTimerTick(true);
            setIsActive(false);
            onTimeExpired?.();
            return 0;
          }
          if (previous <= 10) sound.playTimerTick(previous <= 3);
          return previous - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, secondsLeft, onTimeExpired]);

  const resetTimer = (seconds = initialSeconds) => {
    setIsActive(false);
    setSecondsLeft(seconds);
  };

  const toggleSound = () => {
    sound.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${remainder.toString().padStart(2, '0')}`;
  };

  const progress = (secondsLeft / initialSeconds) * 100;
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;

  return (
    <section className={`bunker-briefing-timer ${isUrgent ? 'is-urgent' : ''}`} aria-label="Таймер выступления">
      <header className="bunker-timer-heading">
        <div>
          <span className="bunker-kicker">Время на обсуждение</span>
          <h2>{activeSpeakerName || 'Технический брифинг'}</h2>
        </div>
        <Clock aria-hidden="true" />
      </header>

      <div className="bunker-timer-presets">
        <button type="button" onClick={() => resetTimer(30)} className="bunker-timer-preset">30 сек</button>
        <button type="button" onClick={() => resetTimer(60)} className="bunker-timer-preset">60 сек</button>
        <button
          type="button"
          onClick={toggleSound}
          className="bunker-timer-sound"
          aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
        >
          {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        </button>
      </div>

      <div className="bunker-timer-display">
        <strong>{formatTime(secondsLeft)}</strong>
        {secondsLeft === 0 && (
          <span className="bunker-timer-expired"><AlertCircle aria-hidden="true" /> Время вышло</span>
        )}
      </div>

      <div
        className="bunker-timer-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={initialSeconds}
        aria-valuenow={secondsLeft}
        aria-label="Оставшееся время"
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="bunker-timer-actions">
        <button
          type="button"
          onClick={() => setIsActive((active) => !active)}
          className={isActive ? 'bunker-timer-start is-running' : 'bunker-timer-start'}
        >
          {isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {isActive ? 'Пауза' : 'Старт'}
        </button>
        <button type="button" onClick={() => resetTimer()} className="bunker-timer-reset" aria-label="Сбросить таймер">
          <RotateCcw aria-hidden="true" />
        </button>
      </div>
      <p className="bunker-timer-note">Таймер работает на этом устройстве.</p>
    </section>
  );
};
