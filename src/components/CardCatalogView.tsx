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
  BookOpen
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
    const matchesSearch = 
      card.original_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.source_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.card_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const renderIcon = (cat: CardCategory) => {
    switch (cat) {
      case 'roles': return <UserCheck className="w-3.5 h-3.5" />;
      case 'skills': return <Cpu className="w-3.5 h-3.5" />;
      case 'baggage': return <Briefcase className="w-3.5 h-3.5" />;
      case 'vulnerabilities': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'crises': return <Flame className="w-3.5 h-3.5" />;
      case 'actions': return <Zap className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-tactical-grid opacity-20 pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-tactical font-bold text-white tracking-wide">
                АРХИВ МАТЕРИАЛОВ // 180 ОРИГИНАЛЬНЫХ КАРТОЧЕК
              </h2>
              <p className="text-xs font-mono-tech text-slate-400 mt-0.5">
                Полный каталог спецификации МДК.04.01: 6 категорий по 30 карточек с авторскими иллюстрациями
              </p>
            </div>
          </div>

          <div className="text-xs font-mono-tech text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
            Отображается: <span className="text-amber-400 font-bold">{filteredCards.length}</span> из 180 карт
          </div>
        </div>

        {/* Search Bar & Filter Tabs */}
        <div className="relative z-10 mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию, свойству или ID (например: RAID, GPO, BIOS, role_01)..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors font-mono-tech"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono-tech transition-all flex items-center gap-1.5 ${
                selectedCategory === 'all'
                  ? 'bg-slate-200 text-slate-950 font-bold shadow'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ВСЕ (180)</span>
            </button>

            {categories.map((cat) => {
              const cfg = CATEGORY_CONFIG[cat];
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-tech transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? `${cfg.badgeClass} font-bold shadow`
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {renderIcon(cat)}
                  <span>{cfg.nameRu} (30)</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 justify-items-center">
        {filteredCards.map((card) => (
          <div key={card.card_id} className="w-full max-w-[190px]">
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
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Filter className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-tactical font-bold text-slate-400">КАРТОЧЕК НЕ НАЙДЕНО</h4>
          <p className="text-xs font-mono-tech text-slate-500 mt-1">
            Попробуйте изменить поисковый запрос или категорию
          </p>
        </div>
      )}
    </div>
  );
};
