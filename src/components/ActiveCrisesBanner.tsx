import React from 'react';
import { Card } from '../types/game';
import { getCardImagePath } from '../data/cards';
import { Flame, ShieldAlert, ArrowUpRight } from 'lucide-react';

interface ActiveCrisesBannerProps {
  crises: Card[];
  currentRound: number;
  onInspectCrisis: (card: Card) => void;
}

export const ActiveCrisesBanner: React.FC<ActiveCrisesBannerProps> = ({
  crises,
  currentRound,
  onInspectCrisis,
}) => {
  if (!crises || crises.length === 0) return null;

  return (
    <section className="bunker-crises" aria-labelledby="active-crises-title">
      <header className="bunker-crises-heading">
        <div className="bunker-crises-title">
          <span className="bunker-section-mark"><Flame aria-hidden="true" /></span>
          <div>
            <span className="bunker-kicker">Угрозы для убежища</span>
            <h2 id="active-crises-title">Активные кризисы</h2>
          </div>
        </div>
        <span className="bunker-round-stamp">
          Раунд <strong>{currentRound}</strong> / 5
        </span>
      </header>

      <div className="bunker-crisis-list">
        {crises.map((crisis, index) => (
          <button
            key={crisis.card_id}
            type="button"
            className="bunker-crisis-card"
            onClick={() => onInspectCrisis(crisis)}
            aria-label={`Подробнее о кризисе: ${crisis.original_title}`}
          >
            <span className="bunker-crisis-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="bunker-crisis-image">
              <img src={getCardImagePath(crisis)} alt="" loading="lazy" />
            </span>
            <span className="bunker-crisis-copy">
              <strong>{crisis.original_title}</strong>
              <span>{crisis.source_description}</span>
            </span>
            <span className="bunker-crisis-open" aria-hidden="true">
              <ArrowUpRight />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
