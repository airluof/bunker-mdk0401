import React from 'react';
import { Card, CardCategory } from '../types/game';
import { CATEGORY_CONFIG, getCardImagePath } from '../data/cards';
import { 
  X, 
  UserCheck, 
  Cpu, 
  Briefcase, 
  AlertTriangle, 
  Flame, 
  Zap, 
  FileText,
  Sparkles,
  ShieldAlert,
  Hash
} from 'lucide-react';

interface CardInspectModalProps {
  card: Card | null;
  onClose: () => void;
}

export const CardInspectModal: React.FC<CardInspectModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  const config = CATEGORY_CONFIG[card.category] || CATEGORY_CONFIG.roles;
  const imageSrc = getCardImagePath(card);

  const renderIcon = (category: CardCategory) => {
    switch (category) {
      case 'roles': return <UserCheck className="w-4 h-4" />;
      case 'skills': return <Cpu className="w-4 h-4" />;
      case 'baggage': return <Briefcase className="w-4 h-4" />;
      case 'vulnerabilities': return <AlertTriangle className="w-4 h-4" />;
      case 'crises': return <Flame className="w-4 h-4" />;
      case 'actions': return <Zap className="w-4 h-4" />;
    }
  };

  return (
    <div 
      className="incident-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Card Artwork Side */}
        <div className="md:w-1/2 bg-slate-950 relative flex items-center justify-center min-h-[280px] md:min-h-[460px] p-4 overflow-hidden">
          <div className="absolute inset-0 bg-tactical-grid opacity-30" />
          <div className="relative z-10 w-full max-w-[320px] aspect-[3/4] rounded-xl overflow-hidden border-2 shadow-2xl transition-transform hover:scale-[1.02]"
            style={{ borderColor: config.accentHex }}
          >
            <img 
              src={imageSrc} 
              alt={card.original_title}
              className="w-full h-full object-cover object-top"
            />
            {/* Category Ribbon */}
            <div className={`absolute top-2 left-2 px-2.5 py-1 rounded text-xs font-mono-tech tracking-wider uppercase flex items-center gap-1.5 border shadow-lg ${config.badgeClass}`}>
              {renderIcon(card.category)}
              <span className="font-bold">{config.nameRu}</span>
            </div>
          </div>
        </div>

        {/* Card Data & Specification Side */}
        <div className="md:w-1/2 p-5 sm:p-7 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Header / ID */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded text-xs font-mono-tech uppercase border ${config.badgeClass} flex items-center gap-1.5`}>
                {renderIcon(card.category)}
                <span>{config.nameRu}</span>
              </span>
              <span className="text-xs font-mono-tech text-slate-400 flex items-center gap-0.5">
                <Hash className="w-3.5 h-3.5" />
                {card.card_id.toUpperCase()}
              </span>
            </div>

            {/* Original Card Title */}
            <h2 className="text-xl sm:text-2xl font-tactical font-bold text-white tracking-wide mt-2">
              {card.original_title}
            </h2>

            {/* Technical Subtitle */}
            <p className="text-xs text-slate-400 font-mono-tech mt-1">
              {config.description}
            </p>

            <div className="h-px bg-slate-800 my-4" />

            {/* Source Description */}
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-mono-tech text-amber-400 font-semibold mb-1.5">
                  <FileText className="w-4 h-4" />
                  <span>СВОЙСТВА И ВЛИЯНИЕ НА СИСТЕМУ:</span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {card.source_description}
                </p>
              </div>

              {card.source_illustration_idea && (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono-tech text-slate-400 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>КОНЦЕПТ ИЛЛЮСТРАЦИИ:</span>
                  </div>
                  <p className="text-xs text-slate-400 italic">
                    "{card.source_illustration_idea}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Footer */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono-tech text-slate-400">
            <span className="flex items-center gap-1.5 text-sky-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              МДК.04.01 // ИНЦИДЕНТ 2036
            </span>
            <span className="text-slate-400">
              {card.format || 'PNG'} • {card.width || 1200}×{card.height || 1600}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
