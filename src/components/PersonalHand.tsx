import React from 'react';
import { Player, Card, PlayerSlotCategory } from '../types/game';
import { CardView } from './CardView';
import { Zap, ShieldCheck, LockKeyhole, Sparkles } from 'lucide-react';
import { sound } from '../services/sound';

interface PersonalHandProps {
  player: Player;
  currentPhase: string;
  onRevealCard: (category: PlayerSlotCategory, cardId?: string) => void;
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
  const totalCards = 5 + (player.hand.extraSkills?.length || 0) - (player.vulnerabilityDiscarded ? 1 : 0);
  const supportedActionCards = ['action_04', 'action_11', 'action_28'];

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
          <p>{player.name} · {totalCards} карт в руке</p>
        </div>

        {supportedActionCards.includes(player.hand.actions.card_id) && !player.actionUsed && player.isAlive && !['audit', 'gameover', 'lobby'].includes(currentPhase) && (
          <button type="button" onClick={handleUseActionClick} className="bunker-action-card-button">
            {player.hand.actions.card_id === 'action_28' ? (
              <><Zap aria-hidden="true" /> Аварийный генератор · +1 место</>
            ) : player.hand.actions.card_id === 'action_04' ? (
              <><ShieldCheck aria-hidden="true" /> Hotfix · сбросить Уязвимость</>
            ) : (
              <><Sparkles aria-hidden="true" /> Эксплойт · второй Навык</>
            )}
          </button>
        )}
        {player.revealed.actions && !player.actionUsed && !supportedActionCards.includes(player.hand.actions.card_id) && (
          <span className="bunker-help">Эффект этой карты пока не автоматизирован.</span>
        )}
      </header>

      <p className="bunker-hand-scroll-hint">Листайте карты по горизонтали.</p>
      <div className="bunker-hand-grid">
        {categories.filter((category) => !(category === 'vulnerabilities' && player.vulnerabilityDiscarded)).flatMap((category) => {
          const cards = category === 'skills'
            ? [player.hand.skills, ...(player.hand.extraSkills || [])]
            : [player.hand[category]];

          return cards.map((card, index) => {
            const isExtraSkill = category === 'skills' && index > 0;
            const isRevealed = isExtraSkill
              ? (player.hand.revealedExtraSkills || []).includes(card.card_id)
              : player.revealed[category];
            const canReveal = !isRevealed && !hasRevealedThisRound && (currentPhase === 'reveal' || currentPhase === 'briefing');
            const reveal = () => onRevealCard(category, isExtraSkill ? card.card_id : undefined);

            return (
              <div key={card.card_id} className="bunker-hand-slot">
                <CardView
                  card={card}
                  isRevealed={isRevealed}
                  canReveal={canReveal}
                  onReveal={reveal}
                  onInspect={() => onInspectCard(card)}
                  size="md"
                  className="w-full h-64"
                />
              </div>
            );
          });
        })}
      </div>

      <p className="bunker-hand-note">
        <LockKeyhole aria-hidden="true" />
        Закрытые карты видны только вам.
      </p>
    </section>
  );
};
