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
  const alivePlayers = players.filter((player) => player.isAlive);

  const handleVoteSubmit = () => {
    if (!selectedId) return;
    sound.playVoteCast();
    onCastVote(selectedId);
    onClose();
  };

  return (
    <div className="bunker-vote-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <section
        className="bunker-vote-panel w-full max-w-xl max-h-[90vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bunker-vote-title"
      >
        <header className="bunker-vote-heading">
          <div className="bunker-vote-mark"><Vote aria-hidden="true" /></div>
          <div>
            <span className="bunker-kicker">Раунд {round}</span>
            <h2 id="bunker-vote-title">Открытое голосование</h2>
            <p>Выберите участника, который покинет Бункер.</p>
          </div>
        </header>

        <div className="bunker-vote-warning">
          <AlertTriangle aria-hidden="true" />
          <p>Голоса открыты для всех участников. После подтверждения выбор изменить нельзя.</p>
        </div>

        <div className="bunker-vote-list">
          {alivePlayers.map((player) => {
            const isMe = player.id === myPlayerId;
            const isSelected = player.id === selectedId;

            return (
              <button
                key={player.id}
                type="button"
                onClick={() => setSelectedId(player.id)}
                className={isSelected ? 'bunker-vote-candidate is-selected' : 'bunker-vote-candidate'}
                aria-pressed={isSelected}
              >
                <span className="bunker-vote-avatar">{player.name.trim().slice(0, 2).toUpperCase()}</span>
                <span className="bunker-vote-person">
                  <strong>{player.name}{isMe ? ' · вы' : ''}{player.isBot ? ' · бот' : ''}</strong>
                  <small>
                    {player.revealed.roles ? player.hand.roles.original_title : 'Роль скрыта'}
                    {' · '}
                    {player.revealed.skills ? player.hand.skills.original_title : 'Навык скрыт'}
                  </small>
                </span>
                <span className="bunker-vote-check">
                  {isSelected ? <CheckCircle2 aria-hidden="true" /> : <span />}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="bunker-vote-actions">
          <button type="button" onClick={onClose} className="bunker-vote-cancel">Отмена</button>
          <button type="button" onClick={handleVoteSubmit} disabled={!selectedId} className="bunker-vote-confirm">
            <UserX aria-hidden="true" />
            Подтвердить голос
          </button>
        </footer>
      </section>
    </div>
  );
};
