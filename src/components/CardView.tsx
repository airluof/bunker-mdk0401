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
      case 'roles': return <UserCheck className="w-4 h-4" />;
      case 'skills': return <Cpu className="w-4 h-4" />;
      case 'baggage': return <Briefcase className="w-4 h-4" />;
      case 'vulnerabilities': return <AlertTriangle className="w-4 h-4" />;
      case 'crises': return <Flame className="w-4 h-4" />;
      case 'actions': return <Zap className="w-4 h-4" />;
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
        className={`incident-card incident-card-sealed ${sizeClass} ${className}`}
        style={{ '--card-accent': config.accentHex } as React.CSSProperties}
      >
        <div className="incident-card-topline">
          <span className="incident-card-category">
            <span className="incident-card-mark" />
            {config.nameRu}
          </span>
          <span className="incident-card-number">#{String(card.card_number || 1).padStart(2, '0')}</span>
        </div>

        <div className="incident-card-seal">
          <div className="incident-card-lock">
            <Lock className="w-5 h-5" />
          </div>
          <span className="incident-card-seal-title">ЗАСЕКРЕЧЕНО</span>
          <span className="incident-card-seal-code">DRP-SITE / CLASSIFIED</span>
        </div>

        <div className="incident-card-bottom">
          {canReveal && onReveal ? (
            <button type="button" onClick={handleRevealClick} className="incident-card-reveal">
              <Eye className="w-4 h-4" />
              РАСКРЫТЬ КАРТУ
            </button>
          ) : (
            <span className="incident-card-access">
              <Lock className="w-3 h-3" />
              ДОСТУП ЗАКРЫТ
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
      className={`incident-card incident-card-open ${sizeClass} ${className}`}
      style={{ '--card-accent': config.accentHex } as React.CSSProperties}
    >
      <div className="incident-card-topline">
        <span className="incident-card-category">
          <span className="incident-card-mark" />
          {config.nameRu}
        </span>
        <div className="incident-card-actions">
          <span className="incident-card-number">{card.card_id.toUpperCase()}</span>
          <button
            type="button"
            onClick={handleInspectClick}
            className="incident-card-inspect"
            title="Осмотреть карту подробно"
            aria-label={`Осмотреть карту ${card.original_title}`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="incident-card-art">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={card.original_title}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="incident-card-art-fallback">
            {renderIcon(card.category)}
            <span>{card.file_name}</span>
          </div>
        )}
      </div>

      <div className="incident-card-copy">
        <h4>{card.original_title}</h4>
        <p className={compact ? 'is-compact' : ''}>{card.source_description}</p>
      </div>
    </article>
  );
};
