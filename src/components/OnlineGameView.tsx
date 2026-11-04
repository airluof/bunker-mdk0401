import React from 'react';
import { RefreshCw, Users, Crown, LockKeyhole, Radio } from 'lucide-react';
import type { Card, CardCategory } from '../types/game';
import { CATEGORY_CONFIG } from '../data/cards';
import { CardView } from './CardView';
import type { RoomSnapshot } from '../services/onlineRooms';

interface OnlineGameViewProps {
  snapshot: RoomSnapshot;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
}

interface SnapshotCard {
  card_id: string;
  category?: string;
  title: string;
  description: string;
  image_path?: string | null;
}

const CARD_CATEGORIES: CardCategory[] = [
  'roles',
  'skills',
  'baggage',
  'vulnerabilities',
  'crises',
  'actions',
];

const HAND_ORDER: CardCategory[] = [
  'roles',
  'skills',
  'baggage',
  'vulnerabilities',
  'actions',
];

function toDisplayCard(source: SnapshotCard, fallbackCategory: CardCategory): Card {
  const category = CARD_CATEGORIES.includes(source.category as CardCategory)
    ? source.category as CardCategory
    : fallbackCategory;

  return {
    card_id: source.card_id,
    category,
    category_name_ru: CATEGORY_CONFIG[category].nameRu,
    card_number: 0,
    original_title: source.title,
    source_description: source.description,
    exported_title: source.title,
    file_name: source.image_path?.split('/').pop() || '',
    relative_path: source.image_path || '',
  };
}

const PHASE_LABELS: Record<string, string> = {
  reveal: 'Вскрытие характеристик',
  briefing: 'Технический брифинг',
  voting: 'Открытое голосование',
  elimination: 'Итоги голосования',
  audit: 'Финальный аудит',
  gameover: 'Партия завершена',
};

export const OnlineGameView: React.FC<OnlineGameViewProps> = ({
  snapshot,
  busy,
  error,
  onRefresh,
}) => {
  const myCards = [...snapshot.my_cards]
    .sort((left, right) => HAND_ORDER.indexOf(left.category as CardCategory) - HAND_ORDER.indexOf(right.category as CardCategory))
    .map((card) => toDisplayCard(card, 'roles'));

  const activeCrises = (snapshot.active_crises as unknown as SnapshotCard[])
    .map((card) => toDisplayCard({ ...card, category: 'crises' }, 'crises'));

  const phaseLabel = PHASE_LABELS[snapshot.session.phase] || 'Игровой этап';

  return (
    <main className="bunker-page bunker-online-game">
      <header className="bunker-online-game-heading">
        <div>
          <p className="bunker-eyebrow">Онлайн-партия · {snapshot.players.length} участников</p>
          <h1>Игровой стол</h1>
          <p className="bunker-page-description">
            Раунд {snapshot.session.round_number} из {snapshot.session.max_rounds} · {phaseLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="bunker-button bunker-button-secondary"
        >
          <RefreshCw aria-hidden="true" />
          {busy ? 'Обновляем…' : 'Синхронизировать'}
        </button>
      </header>

      {error && <div role="alert" className="bunker-error">{error}</div>}

      <section className="bunker-online-game-grid">
        <div className="bunker-online-game-main">
          <section className="bunker-panel bunker-online-crisis-panel">
            <div className="bunker-panel-heading">
              <div>
                <p className="bunker-eyebrow">Общая угроза</p>
                <h2>Активный кризис</h2>
              </div>
              <span className="bunker-round-stamp">Раунд {snapshot.session.round_number}</span>
            </div>
            {activeCrises.length > 0 ? (
              <div className="bunker-online-crisis-cards">
                {activeCrises.map((card) => (
                  <CardView key={card.card_id} card={card} size="md" className="w-full" />
                ))}
              </div>
            ) : (
              <p className="bunker-empty-copy">Активный кризис пока не назначен.</p>
            )}
          </section>

          <section className="bunker-hand bunker-online-hand">
            <header className="bunker-hand-heading">
              <div>
                <span className="bunker-kicker">Личное досье</span>
                <h2>Ваши карты</h2>
                <p>Эти карты доступны только вашей игровой сессии.</p>
              </div>
              <span className="bunker-online-private-label">
                <LockKeyhole aria-hidden="true" /> Личная раздача
              </span>
            </header>
            {myCards.length === 5 ? (
              <div className="bunker-hand-grid bunker-online-hand-grid">
                {myCards.map((card) => (
                  <div key={card.card_id} className="bunker-hand-slot">
                    <CardView card={card} isRevealed size="md" className="w-full h-64" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="bunker-empty-copy">
                Сервер пока не вернул полную раздачу. Нажмите «Синхронизировать».
              </p>
            )}
          </section>
        </div>

        <aside className="bunker-online-game-sidebar">
          <section className="bunker-panel bunker-online-roster">
            <div className="bunker-panel-heading">
              <div>
                <p className="bunker-eyebrow">Состав партии</p>
                <h2>Участники</h2>
              </div>
              <div className="bunker-player-count">
                <Users aria-hidden="true" />
                <strong>{snapshot.players.length}</strong>
                <span>игроков</span>
              </div>
            </div>
            <div className="bunker-online-roster-list">
              {snapshot.players.map((player) => (
                <div className="bunker-player-row" key={player.member_id}>
                  <span className="bunker-player-avatar">
                    {player.display_name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <span className="bunker-player-details">
                    <strong>{player.display_name}</strong>
                    <small>{player.member_id === snapshot.my_member_id ? 'Вы' : 'Участник'}</small>
                  </span>
                  {player.technical_role === 'host' && (
                    <span className="bunker-host-label"><Crown aria-hidden="true" /> Ведущий</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bunker-panel bunker-online-status">
            <Radio aria-hidden="true" />
            <h2>Синхронизация активна</h2>
            <p>
              Раздача и состояние комнаты загружаются с сервера. Обновите экран,
              чтобы запросить актуальный снимок партии.
            </p>
          </section>
        </aside>
      </section>

      <p className="bunker-online-game-footnote">
        Сейчас подключены серверный запуск и личная раздача. Вскрытие карточек,
        таймер брифинга и голосование будут добавлены отдельными серверными действиями,
        чтобы каждый участник видел одинаковый результат.
      </p>
    </main>
  );
};
