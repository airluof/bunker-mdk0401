import React, { useState } from 'react';
import { Player } from '../types/game';
import { Vote, ShieldAlert, CheckCircle2, UserX, AlertTriangle } from 'lucide-react';
import { sound } from '../services/sound';

interface VotingModalProps {
  players: Player[];
  myPlayerId: string;
  round: number;
  onCastVote: (targetPlayerId: string) => void;
  onClose: () => void;
}

export const VotingModal: React.FC<VotingModalProps> = ({
  players,
  myPlayerId,
  round,
  onCastVote,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const alivePlayers = players.filter(p => p.isAlive);
  const myPlayer = players.find(p => p.id === myPlayerId);

  const handleVoteSubmit = () => {
    if (!selectedId) return;
    sound.playVoteCast();
    onCastVote(selectedId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-slate-900 border border-rose-500/50 rounded-2xl shadow-2xl p-5 sm:p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Vote className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-tactical font-bold text-white uppercase tracking-wider">
              ПРОТОКОЛ ИЗГНАНИЯ // РАУНД {round}
            </h3>
            <p className="text-xs font-mono-tech text-slate-400">
              Выберите инженера, чей профиль наименее эффективен против текущих сбоев ЦОД
            </p>
          </div>
        </div>

        {/* Voting Rules Warning */}
        <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/60 mb-4 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>
            Голосование открытое. Инженер, набравший большинство голосов, отстраняется от участия в Бункере и не попадет в финальный аудит восстановления.
          </span>
        </div>

        {/* Candidates List */}
        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {alivePlayers.map((player) => {
            const isMe = player.id === myPlayerId;
            const isSelected = player.id === selectedId;

            return (
              <div
                key={player.id}
                onClick={() => setSelectedId(player.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-rose-950/60 border-rose-500 shadow-md shadow-rose-950/50'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-tactical font-bold text-xs ${
                    isSelected ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {player.name.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-tactical font-bold text-slate-100 truncate">
                        {player.name}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-mono-tech text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                          ВЫ
                        </span>
                      )}
                    </div>
                    {/* Revealed role / skills summary */}
                    <div className="text-[11px] font-mono-tech text-slate-400 truncate mt-0.5">
                      {player.revealed.roles ? player.hand.roles.original_title : 'Роль скрыта'} • {player.revealed.skills ? player.hand.skills.original_title : 'Навык скрыт'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSelected && (
                    <span className="text-xs font-mono-tech text-rose-400 font-semibold flex items-center gap-1">
                      <UserX className="w-3.5 h-3.5" /> ВЫБРАН
                    </span>
                  )}
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    isSelected ? 'border-rose-400 bg-rose-500 text-white' : 'border-slate-700'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-tactical text-xs uppercase tracking-wider transition-colors"
          >
            ОТМЕНА
          </button>

          <button
            onClick={handleVoteSubmit}
            disabled={!selectedId}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:pointer-events-none text-white font-tactical font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center gap-2"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>ПОДТВЕРДИТЬ ГОЛОС</span>
          </button>
        </div>
      </div>
    </div>
  );
};
