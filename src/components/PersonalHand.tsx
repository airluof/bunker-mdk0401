import React from 'react';
import { Player, Card, PlayerSlotCategory } from '../types/game';
import { CardView } from './CardView';
import { Zap, Shield, User, HelpCircle } from 'lucide-react';
import { sound } from '../services/sound';

interface PersonalHandProps {
  player: Player;
  currentPhase: string;
  onRevealCard: (category: PlayerSlotCategory) => void;
  onUseAction: () => void;
  onInspectCard: (card: Card) => void;
}

export const PersonalHand: React.FC<PersonalHandProps> = ({
  player,
  currentPhase,
  onRevealCard,
  onUseAction,
  onInspectCard,
}) => {
  const categories: PlayerSlotCategory[] = ['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'];

  const handleUseActionClick = () => {
    sound.playVoteCast();
    onUseAction();
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-2xl relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-tactical font-bold text-white tracking-wide">
                ЛИЧНОЕ ДОСЬЕ ИНЖЕНЕРА: {player.name}
              </h3>
              {player.isHost && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ВЕДУЩИЙ
                </span>
              )}
            </div>
            <p className="text-xs font-mono-tech text-slate-400 mt-0.5">
              5 оригинальных карт спецификации МДК.04.01 // Раскройте карту в соответствии с раундом
            </p>
          </div>
        </div>

        {/* Action card trigger button if action is revealed and not used */}
        {player.revealed.actions && !player.actionUsed && (
          <button
            onClick={handleUseActionClick}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>ПРИМЕНИТЬ ДЕЙСТВИЕ [{player.hand.actions.original_title}]</span>
          </button>
        )}
      </div>

      {/* Grid of 5 Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 sm:gap-4 justify-items-center">
        {categories.map((cat) => {
          const card = player.hand[cat];
          const isRevealed = player.revealed[cat];
          const canReveal = !isRevealed && (currentPhase === 'reveal' || currentPhase === 'briefing');

          return (
            <div key={cat} className="flex flex-col items-center gap-2 w-full max-w-[190px]">
              <CardView
                card={card}
                isRevealed={isRevealed}
                canReveal={canReveal}
                onReveal={() => onRevealCard(cat)}
                onInspect={() => onInspectCard(card)}
                size="md"
                className="w-full h-64"
              />
            </div>
          );
        })}
      </div>

      {/* Instructional helper text */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tech text-slate-400">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Конфиденциальность: закрытые карты видны только вам в текущем окне терминала</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Кликните по любой карте для увеличения</span>
        </div>
      </div>
    </div>
  );
};
