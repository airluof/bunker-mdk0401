import React from 'react';
import { Player, Card, PlayerSlotCategory } from '../types/game';
import { CATEGORY_CONFIG } from '../data/cards';
import { 
  User, 
  Crown, 
  Skull, 
  Mic, 
  CheckCircle, 
  Lock, 
  Vote, 
  Eye, 
  AlertCircle 
} from 'lucide-react';

interface PlayerRosterProps {
  players: Player[];
  activeSpeakerId: string | null;
  currentPhase: string;
  myPlayerId: string;
  onSelectSpeaker?: (playerId: string) => void;
  onInspectCard: (card: Card) => void;
}

export const PlayerRoster: React.FC<PlayerRosterProps> = ({
  players,
  activeSpeakerId,
  currentPhase,
  myPlayerId,
  onSelectSpeaker,
  onInspectCard,
}) => {
  const categories: PlayerSlotCategory[] = ['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm sm:text-base font-tactical font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <User className="w-4 h-4 text-sky-400" />
            <span>СОСТАВ ИНЖЕНЕРНОГО ОТРЯДА // {players.filter(p => p.isAlive).length} В СТРОЮ</span>
          </h3>
          <p className="text-xs font-mono-tech text-slate-400 mt-0.5">
            Публично раскрытые характеристики специалистов в Бункере
          </p>
        </div>

        <div className="text-xs font-mono-tech text-slate-400">
          Всего участников: <span className="text-slate-200 font-bold">{players.length}</span>
        </div>
      </div>

      {/* Grid of Players */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {players.map((p) => {
          const isMe = p.id === myPlayerId;
          const isSpeaker = p.id === activeSpeakerId;

          return (
            <div
              key={p.id}
              className={`rounded-xl border p-3.5 transition-all relative overflow-hidden ${
                !p.isAlive
                  ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  : isSpeaker
                  ? 'bg-slate-900 border-amber-500/80 shadow-lg shadow-amber-950/40'
                  : isMe
                  ? 'bg-slate-900 border-sky-500/50 shadow-md'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Top row: Name, Badges, Speaker Selector */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-tactical font-bold text-xs shrink-0 ${
                    !p.isAlive 
                      ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40' 
                      : isMe 
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' 
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {!p.isAlive ? <Skull className="w-4 h-4" /> : p.name.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-tactical font-bold text-slate-100 truncate">
                        {p.name}
                      </span>
                      {p.isHost && (
                        <span title="Ведущий" className="inline-flex">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </span>
                      )}
                      {isMe && (
                        <span className="text-[10px] font-mono-tech text-sky-400 bg-sky-500/10 px-1 rounded">
                          ВЫ
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Speaker button during briefing */}
                <div className="flex items-center gap-1 shrink-0">
                  {p.isAlive && currentPhase === 'briefing' && onSelectSpeaker && (
                    <button
                      onClick={() => onSelectSpeaker(p.id)}
                      className={`p-1.5 rounded text-xs font-mono-tech flex items-center gap-1 transition-colors ${
                        isSpeaker
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={isSpeaker ? 'Активный докладчик' : 'Передать микрофон'}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Votes received in voting phase */}
                  {currentPhase === 'voting' && p.votesReceived > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono-tech font-bold flex items-center gap-1">
                      <Vote className="w-3 h-3" />
                      {p.votesReceived}
                    </span>
                  )}

                  {!p.isAlive && (
                    <span className="text-[10px] font-mono-tech text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900/60 uppercase">
                      Изгнан (Р.{p.eliminatedInRound || 1})
                    </span>
                  )}
                </div>
              </div>

              {/* Revealed Cards Indicators */}
              <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-slate-800/60">
                {categories.map((cat) => {
                  const card = p.hand[cat];
                  const isRevealed = p.revealed[cat];
                  const cfg = CATEGORY_CONFIG[cat];

                  if (isRevealed) {
                    return (
                      <button
                        key={cat}
                        onClick={() => onInspectCard(card)}
                        className={`p-1 rounded text-left border transition-all text-[10px] flex flex-col justify-between h-14 overflow-hidden group ${cfg.accentBorder} ${cfg.accentBg} hover:brightness-125`}
                        title={`Раскрыто: ${cfg.nameRu} — ${card.original_title}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`font-mono-tech font-bold uppercase ${cfg.accentText}`}>
                            {cfg.nameRu.substring(0, 3)}
                          </span>
                          <Eye className="w-2.5 h-2.5 text-slate-400 group-hover:text-white" />
                        </div>
                        <span className="text-[9px] text-slate-200 line-clamp-2 leading-tight font-sans">
                          {card.original_title}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div
                      key={cat}
                      className="p-1 rounded text-left border border-slate-800 bg-slate-950/80 text-[10px] flex flex-col justify-between h-14 overflow-hidden opacity-60"
                      title={`${cfg.nameRu}: Карта ещё не раскрыта`}
                    >
                      <span className="font-mono-tech uppercase text-slate-400">
                        {cfg.nameRu.substring(0, 3)}
                      </span>
                      <div className="flex items-center justify-center my-auto">
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
