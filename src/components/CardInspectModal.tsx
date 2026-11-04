import React from 'react';
import { Card } from '../types/game';
import { CATEGORY_CONFIG, getCardImagePath } from '../data/cards';
import { X } from 'lucide-react';

interface CardInspectModalProps {
  card: Card | null;
  onClose: () => void;
}

export const CardInspectModal: React.FC<CardInspectModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  const config = CATEGORY_CONFIG[card.category] || CATEGORY_CONFIG.roles;
  const imageSrc = getCardImagePath(card);

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
        </div>
      </section>
    </div>
  );
};
