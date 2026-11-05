import React from 'react';
import { Card } from '../types/game';
import { CATEGORY_CONFIG, getCardImagePath } from '../data/cards';
import { getCardGuidance } from '../data/cardGuidance';
import { X } from 'lucide-react';

interface CardInspectModalProps {
  card: Card | null;
  onClose: () => void;
}

export const CardInspectModal: React.FC<CardInspectModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  const config = CATEGORY_CONFIG[card.category] || CATEGORY_CONFIG.roles;
  const imageSrc = getCardImagePath(card);
  const guidance = getCardGuidance(card.card_id);

  return (
    <div
      className="bunker-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        className="bunker-modal-panel relative w-full max-w-4xl max-h-[90vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="bunker-modal-close"
          title="Закрыть"
          aria-label="Закрыть карточку"
        >
          <X aria-hidden="true" />
        </button>

        <div className="bunker-modal-art">
          <img src={imageSrc} alt="" className="w-full h-full object-contain" />
        </div>

        <div className="bunker-modal-copy">
          <span className="bunker-category-label">{config.nameRu}</span>
          <h2 id="card-modal-title">{card.original_title}</h2>
                    <p>{card.source_description}</p>
          {guidance && (
            <section className="bunker-card-guidance" aria-label="Связи и пояснения карточки">
              <div className="bunker-card-guidance-heading">
                <h3>{guidance.heading}</h3>
                {guidance.actionStatusLabel && (
                  <span className={`bunker-card-guidance-status is-${guidance.actionStatus}`}>
                    {guidance.actionStatusLabel}
                  </span>
                )}
              </div>
              <p>{guidance.explanation}</p>
              {guidance.relatedCategories.length > 0 && (
                <div className="bunker-card-guidance-tags">
                  {guidance.relatedCategories.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              )}
              {guidance.relatedCards.length > 0 && (
                <ul className="bunker-card-guidance-list">
                  {guidance.relatedCards.slice(0, 8).map((relatedCard) => (
                    <li key={relatedCard.card_id}>
                      <span>{CATEGORY_CONFIG[relatedCard.category].nameRu}</span>
                      <strong>{relatedCard.original_title}</strong>
                    </li>
                  ))}
                  {guidance.relatedCards.length > 8 && (
                    <li className="is-more">Ещё {guidance.relatedCards.length - 8} связанных карточек</li>
                  )}
                </ul>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
};
