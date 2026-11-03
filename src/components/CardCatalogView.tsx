import React, { useState } from 'react';
import { Card, CardCategory } from '../types/game';
import { ALL_CARDS, CATEGORY_CONFIG } from '../data/cards';
import { CardView } from './CardView';
import {
  Search,
  Layers,
  Filter,
  UserCheck,
  Cpu,
  Briefcase,
  AlertTriangle,
  Flame,
  Zap,
  ArrowRight,
} from 'lucide-react';

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
      card.source_description.toLowerCase().includes(normalizedQuery) ||
      card.card_id.toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });

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

  return (
    <main className="incident-page incident-catalog py-4 sm:py-8">
      <div className="incident-topline">
        <span><strong>NEUROTECH</strong> / АРХИВ КАРТОТЕКИ</span>
        <span>МДК.04.01 // <strong>180 RECORDS</strong></span>
      </div>

      <header className="incident-catalog-header">
        <div>
          <div className="incident-kicker">
            <span className="incident-kicker-mark" />
            <span>РЕЕСТР ОБЪЕКТОВ</span>
            <span>/</span>
            <span>КАТАЛОГ КАРТОЧЕК</span>
          </div>
          <h1 className="incident-room-title">Архив материалов<span>.</span></h1>
          <p className="incident-lead incident-catalog-lead">
            Шесть категорий инженерных характеристик, аварийных ситуаций и специальных действий.
            Каждая запись привязана к оригинальному идентификатору и иллюстрации.
          </p>
        </div>
        <div className="incident-catalog-total">
          <strong>{filteredCards.length.toString().padStart(3, '0')}</strong>
          <span>ИЗ 180 ЗАПИСЕЙ</span>
        </div>
      </header>

      <section className="incident-catalog-toolbar" aria-label="Поиск и фильтры карточек">
        <label className="incident-catalog-search">
          <Search className="w-4 h-4" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ПОИСК ПО НАЗВАНИЮ, СВОЙСТВУ ИЛИ ID"
            aria-label="Поиск карточек"
          />
        </label>

        <div className="incident-catalog-filters">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={selectedCategory === 'all' ? 'incident-filter is-active' : 'incident-filter'}
          >
            <Layers className="w-3.5 h-3.5" />
            ВСЕ / 180
          </button>

          {categories.map((category) => {
            const config = CATEGORY_CONFIG[category];
            const selected = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={selected ? 'incident-filter is-active' : 'incident-filter'}
                style={{ '--filter-accent': config.accentHex } as React.CSSProperties}
              >
                {renderIcon(category)}
                {config.nameRu.toUpperCase()} / 30
              </button>
            );
          })}
        </div>
      </section>

      <div className="incident-catalog-result-line">
        <span>РЕЗУЛЬТАТЫ ПОИСКА</span>
        <span>{selectedCategory === 'all' ? 'ВСЕ КАТЕГОРИИ' : CATEGORY_CONFIG[selectedCategory].nameRu.toUpperCase()}</span>
      </div>

      <section className="incident-catalog-grid" aria-label="Карточки архива">
        {filteredCards.map((card) => (
          <div key={card.card_id} className="incident-catalog-card">
            <CardView
              card={card}
              isRevealed={true}
              onInspect={() => onInspectCard(card)}
              size="md"
              compact={true}
              className="w-full h-64"
            />
          </div>
        ))}
      </section>

      {filteredCards.length === 0 && (
        <div className="incident-catalog-empty">
          <Filter className="w-7 h-7" />
          <h2>ЗАПИСИ НЕ НАЙДЕНЫ</h2>
          <p>Измените поисковый запрос или выберите другую категорию.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="incident-button"
          >
            СБРОСИТЬ ФИЛЬТРЫ <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </main>
  );
};
