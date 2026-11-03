import React, { useState } from 'react';
import { Card, CardCategory } from '../types/game';
import { CATEGORY_CONFIG, getCardImagePath } from '../data/cards';
import {
  UserCheck,
  Cpu,
  Briefcase,
  AlertTriangle,
  Flame,
  Zap,
  Lock,
  Eye,
  ZoomIn,
} from 'lucide-react';
import { sound } from '../services/sound';

interface CardViewProps {
  card: Card;
  isRevealed?: boolean;
  canReveal?: boolean;
  onReveal?: () => void;
  onInspect?: () => void;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  isRevealed = true,
  canReveal = false,
  onReveal,
  onInspect,
  size = 'md',
  compact = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const config = CATEGORY_CONFIG[card.category] || CATEGORY_CONFIG.roles;

  const renderIcon = (category: CardCategory) => {
    switch (category) {
      case 'roles': return <UserCheck />;
      case 'skills': return <Cpu />;
      case 'baggage': return <Briefcase />;
      case 'vulnerabilities': return <AlertTriangle />;
      case 'crises': return <Flame />;
      case 'actions': return <Zap />;
    }
  };

  const handleRevealClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (canReveal && onReveal) {
      sound.playCardReveal();
      onReveal();
    }
  };

  const handleInspectClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onInspect?.();
  };

  const sizeClass = size === 'sm'
    ? 'w-36 h-48'
    : size === 'lg'
      ? 'w-64 h-84'
      : 'w-48 h-64';

  if (!isRevealed) {
    return (
      <article
        onClick={handleInspectClick}
        className={`bunker-card bunker-card-sealed ${sizeClass} ${className}`}
        style={{ '--category-color': config.accentHex } as React.CSSProperties}
      >
        <div className="bunker-card-topline">
          <span className="bunker-card-category">{config.nameRu}</span>
        </div>

        <div className="bunker-card-seal">
          <div className="bunker-card-lock">
            <Lock aria-hidden="true" />
          </div>
          <span>Карта закрыта</span>
        </div>

        <div className="bunker-card-bottom">
          {canReveal && onReveal ? (
            <button type="button" onClick={handleRevealClick} className="bunker-card-reveal">
              <Eye aria-hidden="true" />
              Открыть карту
            </button>
          ) : (
            <span className="bunker-card-access">
              <Lock aria-hidden="true" />
              Доступна только вам
            </span>
          )}
        </div>
      </article>
    );
  }

  const imageSrc = getCardImagePath(card);

  return (
    <article
      onClick={handleInspectClick}
      className={`bunker-card bunker-card-open ${sizeClass} ${className}`}
      style={{ '--category-color': config.accentHex } as React.CSSProperties}
    >
      <div className="bunker-card-topline">
        <span className="bunker-card-category">{config.nameRu}</span>
        <button
          type="button"
          onClick={handleInspectClick}
          className="bunker-card-inspect"
          title="Открыть карточку"
          aria-label={`Открыть карточку «${card.original_title}»`}
        >
          <ZoomIn aria-hidden="true" />
        </button>
      </div>

      <div className="bunker-card-art">
        {!imgError ? (
          <img
            src={imageSrc}
            alt=""
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="bunker-card-art-fallback" role="img" aria-label={card.original_title}>
            {renderIcon(card.category)}
          </div>
        )}
      </div>

      <div className="bunker-card-copy">
        <h3>{card.original_title}</h3>
        <p className={compact ? 'is-compact' : ''}>{card.source_description}</p>
      </div>
    </article>
  );
};
