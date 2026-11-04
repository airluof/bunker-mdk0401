import React from 'react';
import { Player, Card, PlayerSlotCategory } from '../types/game';
import { CardView } from './CardView';
import { Zap, LockKeyhole } from 'lucide-react';
import { sound } from '../services/sound';

interface PersonalHandProps {
  player: Player;
  currentPhase: string;
  onRevealCard: (category: PlayerSlotCategory) => void;
  onUseAction: () => void;
  onInspectCard: (card: Card) => void;
  hasRevealedThisRound?: boolean;
}

export const PersonalHand: React.FC<PersonalHandProps> = ({
  player,
  currentPhase,
  onRevealCard,
  onUseAction,
  onInspectCard,
  hasRevealedThisRound = false,
}) => {
  const categories: PlayerSlotCategory[] = ['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'];

  const handleUseActionClick = () => {
    sound.playVoteCast();
    onUseAction();
  };

  return (
    <section className="bunker-hand" aria-labelledby="bunker-hand-title">
      <header className="bunker-hand-heading">
        <div>
          <span className="bunker-kicker">Ваш набор</span>
          <h2 id="bunker-hand-title">Личные карты</h2>
          <p>{player.name} · 5 карт в руке</p>
        </div>

        {player.revealed.actions && !player.actionUsed && (
          <button type="button" onClick={handleUseActionClick} className="bunker-action-card-button">
            <Zap aria-hidden="true" />
            Проверить карту действия
          </button>
        )}
      </header>

      <div className="bunker-hand-grid">
        {categories.map((category) => {
          const card = player.hand[category];
          const isRevealed = player.revealed[category];
          const canReveal = !isRevealed && !hasRevealedThisRound && (currentPhase === 'reveal' || currentPhase === 'briefing');

          return (
            <div key={category} className="bunker-hand-slot">
              <CardView
                card={card}
                isRevealed={isRevealed}
                canReveal={canReveal}
                onReveal={() => onRevealCard(category)}
                onInspect={() => onInspectCard(card)}
                size="md"
                className="w-full h-64"
              />
            </div>
          );
        })}
      </div>

      <p className="bunker-hand-note">
        <LockKeyhole aria-hidden="true" />
        Закрытые карты видны только вам.
      </p>
    </section>
  );
};
