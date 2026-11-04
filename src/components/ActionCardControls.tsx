import React, { useMemo, useState } from 'react';
import { LockKeyhole, Play, ShieldAlert } from 'lucide-react';
import type { ActionPrivateEvent } from '../services/onlineRooms';

interface ActionCard {
  instance_id: string;
  card_id: string;
  title: string;
}

interface ActionPlayer {
  member_id: string;
  display_name: string;
  is_alive: boolean;
  membership_status: 'active' | 'left';
}

interface ActionCrisis {
  instance_id: string;
  card_id: string;
  title: string;
}

interface ActionCardControlsProps {
  myMemberId: string;
  cards: ActionCard[];
  players: ActionPlayer[];
  crises: ActionCrisis[];
  usedCardInstanceIds: string[];
  privateEvents: ActionPrivateEvent[];
  currentRound: number;
  watchdogRound: number | null;
  vulnerabilitiesDisabledRound: number | null;
  ignoredCrisisIds: string[];
  busy: boolean;
  onUse: (cardInstanceId: string, actionId: string, targetMemberId?: string, targetCardInstanceId?: string) => void;
}

const AVAILABLE_EFFECTS: Record<string, { description: string; target: 'none' | 'player' | 'expelled' | 'hot-swap' | 'crisis' }> = {
  action_03: { description: 'Обменять свой Багаж с колодой или Багажом изгнанного игрока.', target: 'hot-swap' },
  action_06: { description: 'Поменять карты Ролей с выбранным участником.', target: 'player' },
  action_08: { description: 'Посмотреть следующую скрытую карту будущего Кризиса. Результат увидите только вы.', target: 'none' },
  action_10: { description: 'Немедленно раскрыть Багаж всех участников.', target: 'none' },
  action_11: { description: 'Получить вторую карту Навыка из колоды. Она останется скрытой, пока вы не решите раскрыть её в одном из следующих раундов.', target: 'none' },
  action_12: { description: 'Списать Багаж выбранного участника. Эффект сработает, если у него ровно одна карта Багажа.', target: 'player' },
  action_15: { description: 'Сбросить выбранный активный Кризис и открыть следующий из колоды.', target: 'crisis' },
  action_16: { description: 'Забрать Багаж у выбранного изгнанного участника.', target: 'expelled' },
  action_17: { description: 'Сократить текущий брифинг или задать 30 секунд для предстоящего брифинга этого раунда.', target: 'none' },
  action_18: { description: 'Поменять картами Уязвимостей с выбранным участником.', target: 'player' },
  action_20: { description: 'Посмотреть все скрытые карты выбранного участника. Результат увидите только вы.', target: 'player' },
  action_21: { description: 'Выбрать один активный Кризис, который будет отмечен для игнорирования при финальном аудите.', target: 'crisis' },
  action_24: { description: 'Взять дополнительную карту Багажа из колоды.', target: 'none' },
  action_25: { description: 'Активировать Safe Boot и записать состояние Уязвимостей на этот раунд.', target: 'none' },
};

const PENDING_RULES: Record<string, string> = {
  action_01: 'Нужно определить, кто задаёт вопрос, кто оценивает ответ и как именно добавляется голос.',
  action_02: 'Нужно определить момент отката и какие результаты или действия отменяются.',
  action_05: 'Не указано, какую категорию закрытой карты нужно раскрыть.',
  action_07: 'В исходнике два разных варианта эффекта: двойной голос или спасение при ничьей.',
  action_09: 'Нужно определить точную область защиты и её взаимодействие с другими действиями.',
  action_13: 'Нужны критерий победы в дуэли, судья и длительность иммунитета.',
  action_14: 'Нужно определить соседа справа/слева и что именно копируется.',
  action_19: 'Не определено, кто считается похожим игроком и как округляется половина голосов.',
  action_22: 'В базовых правилах нет процедуры ввода паролей и подсчёта ошибок.',
  action_23: 'Нужно определить влияние пары на вместимость, голосование и изгнание.',
  action_26: 'Нужен порядок отправки запроса преподавателю и получения подсказки.',
  action_27: 'Нужно определить, как подтверждаются одинаковые роли и заменяет ли это обычное голосование.',
  action_29: 'Нужно определить состав нового набора из четырёх карт и судьбу пятой карты.',
  action_30: 'Нужно определить, что считается ошибкой и кто оценивает защиту плана.',
};

export const ActionCardControls: React.FC<ActionCardControlsProps> = ({
  myMemberId,
  cards,
  players,
  crises,
  usedCardInstanceIds,
  privateEvents,
  currentRound,
  watchdogRound,
  vulnerabilitiesDisabledRound,
  ignoredCrisisIds,
  busy,
  onUse,
}) => {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const activePlayers = useMemo(
    () => players.filter((player) => player.membership_status === 'active'),
    [players],
  );
  const availableCards = cards.filter((card) =>
    AVAILABLE_EFFECTS[card.card_id] && !usedCardInstanceIds.includes(card.instance_id)
  );
  const pendingCards = cards.filter((card) => PENDING_RULES[card.card_id]);

  const submit = (card: ActionCard) => {
    const mode = AVAILABLE_EFFECTS[card.card_id]?.target;
    const selected = selections[card.instance_id] || (mode === 'hot-swap' ? 'deck' : '');
    if (mode === 'player' || mode === 'expelled') {
      if (!selected) return;
      onUse(card.instance_id, card.card_id, selected);
      return;
    }
    if (mode === 'hot-swap' && selected !== 'deck') {
      onUse(card.instance_id, card.card_id, selected);
      return;
    }
    if (mode === 'crisis') {
      if (!selected) return;
      onUse(card.instance_id, card.card_id, undefined, selected);
      return;
    }
    onUse(card.instance_id, card.card_id);
  };

  if (cards.length === 0 && privateEvents.length === 0) return null;

  return (
    <section className="bunker-online-action-tools" aria-label="Действия из личной руки">
      {availableCards.length > 0 && (
        <>
          <div className="bunker-online-action-tools-heading">
            <span className="bunker-kicker">Специальные действия</span>
            <p>Сервер проверит владельца карты, цель и возможность применения.</p>
          </div>
          <div className="bunker-online-action-tools-list">
            {availableCards.map((card) => {
              const config = AVAILABLE_EFFECTS[card.card_id];
              const otherPlayers = activePlayers.filter((player) => player.member_id !== myMemberId);
              const eligiblePlayers = config.target === 'expelled'
                ? otherPlayers.filter((player) => !player.is_alive)
                : otherPlayers;
              const selected = selections[card.instance_id] || (config.target === 'hot-swap' ? 'deck' : '');
              const options = config.target === 'crisis'
                ? crises.map((crisis) => ({ value: crisis.instance_id, label: crisis.title }))
                : config.target === 'hot-swap'
                  ? [
                      { value: 'deck', label: 'Взять случайную карту из колоды Багажа' },
                      ...eligiblePlayers.filter((player) => !player.is_alive).map((player) => ({
                        value: player.member_id,
                        label: 'Обмен с изгнанным: ' + player.display_name,
                      })),
                    ]
                  : eligiblePlayers.map((player) => ({
                      value: player.member_id,
                      label: player.display_name + (player.is_alive ? '' : ' · изгнан'),
                    }));
              const needsSelection = config.target !== 'none';
              const selectionValid = config.target === 'none'
                || (config.target === 'hot-swap' && selected === 'deck')
                || Boolean(selected && options.some((option) => option.value === selected));
              return (
                <div className="bunker-online-action-tool" key={card.instance_id}>
                  <div className="bunker-online-action-tool-copy">
                    <strong>{card.title}</strong>
                    <span>{config.description}</span>
                  </div>
                  <div className="bunker-online-action-tool-controls">
                    {needsSelection && (
                      <select
                        className="bunker-input bunker-action-target-select"
                        value={selected}
                        onChange={(event) => setSelections((current) => ({
                          ...current,
                          [card.instance_id]: event.target.value,
                        }))}
                        disabled={busy || options.length === 0}
                        aria-label={'Цель действия: ' + card.title}
                      >
                        <option value="">Выберите цель</option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="bunker-button bunker-button-secondary"
                      onClick={() => submit(card)}
                      disabled={busy || !selectionValid || (needsSelection && options.length === 0)}
                    >
                      <Play aria-hidden="true" />
                      Применить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pendingCards.length > 0 && (
        <div className="bunker-online-pending-actions">
          <span className="bunker-kicker">Ожидают уточнения правил</span>
          {pendingCards.map((card) => (
            <div className="bunker-online-pending-action" key={card.instance_id}>
              <strong>{card.title}</strong>
              <span>{PENDING_RULES[card.card_id]}</span>
            </div>
          ))}
        </div>
      )}

      {watchdogRound === currentRound && (
        <p className="bunker-online-action-state"><ShieldAlert aria-hidden="true" /> Watchdog активирован: брифинг этого раунда рассчитан на 30 секунд.</p>
      )}
      {vulnerabilitiesDisabledRound === currentRound && (
        <p className="bunker-online-action-state"><ShieldAlert aria-hidden="true" /> Safe Boot: сервер записал флаг действия на этот раунд. Автоматическое подавление эффектов Уязвимостей ещё не подключено.</p>
      )}
      {ignoredCrisisIds.length > 0 && (
        <p className="bunker-online-action-state"><ShieldAlert aria-hidden="true" /> Есть Кризис, отмеченный картой Workaround для финального аудита.</p>
      )}

      {privateEvents.length > 0 && (
        <div className="bunker-online-private-action-results">
          <span className="bunker-kicker"><LockKeyhole aria-hidden="true" /> Только вам</span>
          {privateEvents.slice(0, 5).map((event, index) => {
            const payload = event.private_payload || {};
            const actionId = String(payload.action_id || '');
            const title = actionId === 'action_08'
              ? 'S.M.A.R.T. · просмотр будущего кризиса'
              : actionId === 'action_20'
                ? 'Memory Dump · скрытые карты участника'
                : 'Результат личного действия';
            const cards = Array.isArray(payload.cards) ? payload.cards as Array<Record<string, unknown>> : [];
            return (
              <div className="bunker-online-private-action-result" key={event.created_at + ':' + index}>
                <strong>{title}</strong>
                {actionId === 'action_08' && (
                  <p>{String(payload.title || 'Карта кризиса')} — {String(payload.description || '')}</p>
                )}
                {actionId === 'action_20' && (
                  <>
                    <p>Карты игрока: {String(payload.target_name || 'участник')}</p>
                    {cards.length > 0 ? (
                      <ul>
                        {cards.map((card, cardIndex) => (
                          <li key={String(card.card_id || cardIndex)}>
                            <span>{String(card.category || 'Карта')}</span>
                            <strong>{String(card.title || 'Без названия')}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p>Скрытых карт не найдено.</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
