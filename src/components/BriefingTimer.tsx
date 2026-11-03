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
    let interval: any = null;
    if (isActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            sound.playTimerTick(true);
            setIsActive(false);
            if (onTimeExpired) onTimeExpired();
            return 0;
          }
          if (prev <= 10) {
            sound.playTimerTick(prev <= 3);
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, secondsLeft, onTimeExpired]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = (secs: number = initialSeconds) => {
    setIsActive(false);
    setSecondsLeft(secs);
  };

  const toggleSound = () => {
    sound.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = (secondsLeft / initialSeconds) * 100;
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;

  return (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${
      isUrgent 
        ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/50' 
        : 'bg-slate-900/90 border-slate-800 shadow-md'
    }`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isUrgent ? 'text-rose-400 animate-pulse' : 'text-sky-400'}`} />
          <span className="text-xs font-mono-tech uppercase tracking-wider text-slate-300 font-semibold">
            {activeSpeakerName ? `Спикер: ${activeSpeakerName}` : 'Регламент брифинга'}
          </span>
        </div>

        {/* Sound toggle & Preset controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => resetTimer(30)}
            className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Таймер Watchdog (30 сек)"
          >
            30с
          </button>
          <button
            onClick={() => resetTimer(60)}
            className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Стандартный брифинг (60 сек)"
          >
            60с
          </button>
          <button
            onClick={toggleSound}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title={soundEnabled ? 'Звук включен' : 'Звук выключен'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Countdown Display */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className={`text-3xl sm:text-4xl font-mono-tech font-bold tracking-tight ${
            isUrgent ? 'text-rose-400 animate-pulse' : 'text-cyan-300'
          }`}>
            {formatTime(secondsLeft)}
          </span>
          {secondsLeft === 0 && (
            <span className="text-xs font-mono-tech text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> ВРЕМЯ ИСТЕКЛО
            </span>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTimer}
            className={`px-3.5 py-1.5 rounded-lg font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 shadow-md ${
              isActive 
                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' 
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isActive ? 'ПАУЗА' : 'СТАРТ'}</span>
          </button>

          <button
            onClick={() => resetTimer()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Сброс таймера"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 rounded-full h-1.5 mt-3 overflow-hidden border border-slate-800">
        <div 
          className={`h-full transition-all duration-300 ${
            isUrgent ? 'bg-rose-500' : 'bg-cyan-400'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
