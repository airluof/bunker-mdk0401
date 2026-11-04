import React from 'react';
import { Player, Card, PlayerSlotCategory } from '../types/game';
import { CATEGORY_CONFIG } from '../data/cards';
import { Crown, Skull, Mic, LockKeyhole, Eye, Vote, UserRound } from 'lucide-react';

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
  const aliveCount = players.filter((player) => player.isAlive).length;

  return (
    <section className="bunker-roster" aria-labelledby="bunker-roster-title">
      <header className="bunker-roster-heading">
        <div className="bunker-roster-title">
          <span className="bunker-section-mark"><UserRound aria-hidden="true" /></span>
          <div>
            <span className="bunker-kicker">Участники партии</span>
            <h2 id="bunker-roster-title">Игроки</h2>
          </div>
        </div>
        <div className="bunker-roster-count">
          <strong>{aliveCount}</strong>
          <span>из {players.length} в игре</span>
        </div>
      </header>

      <div className="bunker-roster-grid">
        {players.map((player) => {
          const isMe = player.id === myPlayerId;
          const isSpeaker = player.id === activeSpeakerId;

          return (
            <article
              key={player.id}
              className={[
                'bunker-player-card',
                !player.isAlive ? 'is-eliminated' : '',
                isSpeaker && player.isAlive ? 'is-speaking' : '',
                isMe ? 'is-you' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="bunker-player-card-head">
                <span className="bunker-player-avatar" aria-hidden="true">
                  {!player.isAlive ? <Skull /> : player.name.trim().slice(0, 2).toUpperCase()}
                </span>

                <div className="bunker-player-identity">
                  <div className="bunker-player-name-line">
                    <h3>{player.name}</h3>
                    {player.isHost && <Crown className="bunker-player-crown" aria-label="Ведущий" />}
                    {player.isBot && <span className="bunker-player-you">БОТ</span>}
                    {isMe && <span className="bunker-player-you">Вы</span>}
                  </div>
                  <span className="bunker-player-status">
                    {!player.isAlive
                      ? `Выбыл · раунд ${player.eliminatedInRound || 1}`
                      : isSpeaker
                        ? 'Сейчас говорит'
                        : player.isBot
                          ? 'Тестовый участник'
                          : player.isHost
                            ? 'Ведущий'
                            : 'Участник'}
                  </span>
                </div>

                {(currentPhase === 'voting' || currentPhase === 'elimination') && player.votesReceived > 0 && (
                  <span className="bunker-player-votes">
                    <Vote aria-hidden="true" /> {player.votesReceived}
                  </span>
                )}
              </div>

              {player.isAlive && currentPhase === 'briefing' && onSelectSpeaker && (
                <button
                  type="button"
                  className={isSpeaker ? 'bunker-speaker-button is-active' : 'bunker-speaker-button'}
                  onClick={() => onSelectSpeaker(player.id)}
                  aria-pressed={isSpeaker}
                >
                  <Mic aria-hidden="true" />
                  {isSpeaker ? 'Говорит сейчас' : 'Передать слово'}
                </button>
              )}

              <div className="bunker-player-card-slots" aria-label="Карты игрока">
                {categories
                  .filter((category) => !(category === 'vulnerabilities' && player.vulnerabilityDiscarded))
                  .flatMap((category) => {
                    const cards = category === 'skills'
                      ? [player.hand.skills, ...(player.hand.extraSkills || [])]
                      : [player.hand[category]];
                    const config = CATEGORY_CONFIG[category];

                    return cards.map((card, index) => {
                      const isExtraSkill = category === 'skills' && index > 0;
                      const isRevealed = isExtraSkill
                        ? (player.hand.revealedExtraSkills || []).includes(card.card_id)
                        : player.revealed[category];
                      const label = category === 'skills' && cards.length > 1
                        ? `Навык ${index + 1}`
                        : config.nameRu;

                      return isRevealed ? (
                        <button
                          key={card.card_id}
                          type="button"
                          className="bunker-player-card-slot is-revealed"
                          onClick={() => onInspectCard(card)}
                          title={`${label}: ${card.original_title}`}
                        >
                          <span>{label}</span>
                          <strong>{card.original_title}</strong>
                          <Eye aria-hidden="true" />
                        </button>
                      ) : (
                        <div key={card.card_id} className="bunker-player-card-slot is-hidden">
                          <span>{label}</span>
                          <strong>Закрыта</strong>
                          <LockKeyhole aria-hidden="true" />
                        </div>
                      );
                    });
                  })}
              </div>
          </article>
          );
        })}
      </div>
    </section>
  );
};
