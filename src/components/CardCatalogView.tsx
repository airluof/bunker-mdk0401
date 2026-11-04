import React, { useState } from 'react';
import { Card, CardCategory } from '../types/game';
import { ALL_CARDS, CATEGORY_CONFIG } from '../data/cards';
import { CardView } from './CardView';
import { Search, Layers, UserCheck, Cpu, Briefcase, AlertTriangle, Flame, Zap, Filter, ArrowRight } from 'lucide-react';

interface CardCatalogViewProps {
  onInspectCard: (card: Card) => void;
}

export const CardCatalogView: React.FC<CardCatalogViewProps> = ({ onInspectCard }) => {
  const [selectedCategory, setSelectedCategory] = useState<CardCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categories: CardCategory[] = ['roles', 'skills', 'baggage', 'vulnerabilities', 'crises', 'actions'];

  const filteredCards = ALL_CARDS.filter((card) => {
    const matchesCategory = selectedCategory === 'all' || card.category === selectedCategory;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !normalizedQuery ||
      card.original_title.toLowerCase().includes(normalizedQuery) ||
      card.source_description.toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });

  const renderIcon = (category: CardCategory) => {
    switch (category) {
      case 'roles': return <UserCheck aria-hidden="true" />;
      case 'skills': return <Cpu aria-hidden="true" />;
      case 'baggage': return <Briefcase aria-hidden="true" />;
      case 'vulnerabilities': return <AlertTriangle aria-hidden="true" />;
      case 'crises': return <Flame aria-hidden="true" />;
      case 'actions': return <Zap aria-hidden="true" />;
    }
  };

  return (
    <section className="bunker-page bunker-catalog">
      <header className="bunker-page-heading">
        <div>
          <p className="bunker-eyebrow">Бункер · Колода</p>
          <h1>Карточки</h1>
        </div>
        <div className="bunker-catalog-total">
          <strong>{filteredCards.length}</strong>
          <span>из {ALL_CARDS.length}</span>
        </div>
      </header>

      <section className="bunker-catalog-toolbar" aria-label="Поиск и фильтры карточек">
        <label className="bunker-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по названию или описанию"
            aria-label="Поиск карточек"
          />
        </label>

        <div className="bunker-category-filters">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={selectedCategory === 'all' ? 'bunker-filter is-active' : 'bunker-filter'}
          >
            <Layers aria-hidden="true" />
            Все
          </button>

          {categories.map((category) => {
            const config = CATEGORY_CONFIG[category];
            const selected = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={selected ? 'bunker-filter is-active' : 'bunker-filter'}
                style={{ '--filter-color': config.accentHex } as React.CSSProperties}
              >
                {renderIcon(category)}
                {config.nameRu}
              </button>
            );
          })}
        </div>
      </section>

      <div className="bunker-catalog-result">
        <span>{selectedCategory === 'all' ? 'Все карточки' : CATEGORY_CONFIG[selectedCategory].nameRu}</span>
        <span>{filteredCards.length} шт.</span>
      </div>

      <section className="bunker-catalog-grid" aria-label="Карточки">
        {filteredCards.map((card) => (
          <div key={card.card_id} className="bunker-catalog-item">
            <CardView
              card={card}
              isRevealed
              onInspect={() => onInspectCard(card)}
              size="md"
              compact
              className="w-full h-64"
            />
          </div>
        ))}
      </section>

      {filteredCards.length === 0 && (
        <div className="bunker-empty">
          <Filter aria-hidden="true" />
          <h2>Карточки не найдены</h2>
          <p>Попробуй изменить запрос или выбрать другую категорию.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="bunker-button"
          >
            Сбросить фильтры <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="bunker-catalog-note">
        Карточки в каталоге видны всем посетителям. Не используй его для хранения закрытой информации партии.
      </p>
    </main>
  );
};
