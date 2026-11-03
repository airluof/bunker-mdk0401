import React, { useState } from 'react';
import { Card, CardCategory } from '../types/game';
import { CATEGORY_CONFIG, getCardImagePath } from '../data/cards';
import { 
  UserCheck, 
  Cpu, 
  Briefcase, 
  AlertTriangle, 
  Flame, 
  Zap, 
  Lock, 
  Eye, 
  CheckCircle2,
  ZoomIn
} from 'lucide-react';
import { sound } from '../services/sound';

interface CardViewProps {
  card: Card;
  isRevealed?: boolean;
  canReveal?: boolean;
  onReveal?: () => void;
  onInspect?: () => void;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  isRevealed = true,
  canReveal = false,
  onReveal,
  onInspect,
  size = 'md',
  compact = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const config = CATEGORY_CONFIG[card.category] || CATEGORY_CONFIG.roles;

  const renderIcon = (category: CardCategory) => {
    switch (category) {
      case 'roles': return <UserCheck className="w-3.5 h-3.5" />;
      case 'skills': return <Cpu className="w-3.5 h-3.5" />;
      case 'baggage': return <Briefcase className="w-3.5 h-3.5" />;
      case 'vulnerabilities': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'crises': return <Flame className="w-3.5 h-3.5" />;
      case 'actions': return <Zap className="w-3.5 h-3.5" />;
    }
  };

  const handleRevealClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canReveal && onReveal) {
      sound.playCardReveal();
      onReveal();
    }
  };

  const handleInspectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInspect) {
      onInspect();
    }
  };

  // Closed Card (Face Down)
  if (!isRevealed) {
    return (
      <div 
        onClick={handleInspectClick}
        className={`group relative rounded-xl border border-slate-700/80 bg-slate-900/95 overflow-hidden transition-all duration-300 shadow-lg hover:shadow-cyan-950/40 select-none flex flex-col justify-between p-3 cursor-pointer ${
          size === 'sm' ? 'w-36 h-48' : size === 'lg' ? 'w-64 h-84' : 'w-48 h-64'
        } ${className}`}
      >
        {/* Holographic Security Pattern */}
        <div className="absolute inset-0 bg-tactical-grid opacity-20 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-800/40 via-transparent to-slate-950/80 pointer-events-none" />
        
        {/* Category Top Banner */}
        <div className="relative z-10 flex items-center justify-between">
          <div className={`px-2 py-0.5 rounded text-[10px] font-mono-tech tracking-wider uppercase flex items-center gap-1.5 border ${config.badgeClass}`}>
            {renderIcon(card.category)}
            <span>{config.nameRu}</span>
          </div>
          <span className="text-[10px] font-mono-tech text-slate-400">#{(card.card_number || 1).toString().padStart(2, '0')}</span>
        </div>

        {/* Center Encrypted Emblem */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center px-2">
          <div className="w-12 h-12 rounded-full border border-slate-700 bg-slate-950/80 flex items-center justify-center text-slate-400 mb-2 group-hover:border-cyan-500/50 group-hover:text-cyan-400 transition-colors">
            <Lock className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-tactical font-semibold tracking-wider text-slate-300 uppercase">
            ЗАСЕКРЕЧЕНО
          </span>
          <span className="text-[9px] font-mono-tech text-slate-400 mt-0.5">
            DRP-SITE // CLASSIFIED
          </span>
        </div>

        {/* Action Button */}
        <div className="relative z-10 pt-2 border-t border-slate-800/80 flex items-center justify-center">
          {canReveal ? (
            <button
              onClick={handleRevealClick}
              className="w-full py-1.5 px-2 bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-tactical font-bold text-xs rounded tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>РАСКРЫТЬ КАРТУ</span>
            </button>
          ) : (
            <span className="text-[10px] font-mono-tech text-slate-400 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Доступ закрыт</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  // Revealed Card (Face Up)
  const imageSrc = getCardImagePath(card);

  return (
    <div
      onClick={handleInspectClick}
      className={`group relative rounded-xl border ${config.accentBorder} ${config.accentBg} bg-slate-900/90 overflow-hidden transition-all duration-300 shadow-xl hover:-translate-y-1 hover:shadow-2xl select-none flex flex-col cursor-pointer ${
        size === 'sm' ? 'w-36 h-48' : size === 'lg' ? 'w-64 h-84' : 'w-48 h-64'
      } ${className}`}
    >
      {/* Background illustration */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-slate-950">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={card.original_title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-slate-950/90 text-center">
            {renderIcon(card.category)}
            <span className="text-xs font-mono-tech text-slate-400 mt-2">{card.file_name}</span>
          </div>
        )}
        {/* Subtle Dark Gradient Overlay to ensure text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/30" />
      </div>

      {/* Top Header Badge */}
      <div className="relative z-10 p-2 flex items-center justify-between bg-slate-950/60 backdrop-blur-sm border-b border-slate-800/60">
        <div className={`px-2 py-0.5 rounded text-[10px] font-mono-tech tracking-wider uppercase flex items-center gap-1.5 border ${config.badgeClass}`}>
          {renderIcon(card.category)}
          <span className="font-semibold">{config.nameRu}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono-tech text-slate-400">
            {card.card_id.toUpperCase()}
          </span>
          <button 
            onClick={handleInspectClick}
            className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Осмотреть карту подробно"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="relative z-10 flex-1 pointer-events-none" />

      {/* Bottom Content Area */}
      <div className="relative z-10 p-2.5 bg-gradient-to-t from-slate-950 via-slate-950/95 to-slate-950/80 backdrop-blur-sm border-t border-slate-800/70">
        <h4 className="text-xs font-tactical font-bold text-slate-100 tracking-wide line-clamp-1 group-hover:text-amber-300 transition-colors">
          {card.original_title}
        </h4>
        <p className={`text-[10px] leading-relaxed text-slate-300 mt-1 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
          {card.source_description}
        </p>

        {/* Technical Footer Indicator */}
        <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[9px] font-mono-tech text-slate-400">
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Раскрыто
          </span>
          <span>ГОСТ // DRP-2036</span>
        </div>
      </div>
    </div>
  );
};
