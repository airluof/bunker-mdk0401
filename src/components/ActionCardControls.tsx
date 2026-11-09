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
  joined_at?: string;
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
  onUse: (
    cardInstanceId: string,
    actionId: string,
    targetMemberId?: string,
    targetCardInstanceId?: string,
    actionChoice?: 'double_vote' | 'tie_save',
  ) => void;
}

const AVAILABLE_EFFECTS: Record<string, { description: string; target: 'none' | 'player' | 'expelled' | 'hot-swap' | 'crisis' | 'self-or-player' | 'neighbour' | 'choice' }> = {
  action_02: { description: 'Отменить результат текущего голосования. До конца раунда никто не выбывает.', target: 'none' },
  action_03: { description: 'Обменять свой Багаж с колодой или Багажом изгнанного игрока.', target: 'hot-swap' },
  action_05: { description: 'В фазе брифинга или голосования заставить соперника раскрыть одну случайную закрытую карту.', target: 'player' },
  action_06: { description: 'Поменять карты Ролей с выбранным участником.', target: 'player' },
  action_07: { description: 'Во время голосования выбрать один режим: двойной голос или спасение при равенстве.', target: 'choice' },
  action_09: { description: 'Защитить себя или другого живого игрока от направленных действий до конца текущего раунда.', target: 'self-or-player' },
  action_08: { description: 'Посмотреть следующую скрытую карту будущего Кризиса. Результат увидите только вы.', target: 'none' },
  action_10: { description: 'Немедленно раскрыть Багаж всех участников.', target: 'none' },
  action_11: { description: 'Получить вторую карту Навыка из колоды. Она останется скрытой, пока вы не решите раскрыть её в одном из следующих раундов.', target: 'none' },
  action_12: { description: 'Списать самую старую карту Багажа выбранного участника. Если предметов несколько, выбирается первый полученный.', target: 'player' },
  action_14: { description: 'Скопировать самую старую карту Навыка ближайшего живого соседа справа или слева. Копия станет открытой.', target: 'neighbour' },
  action_15: { description: 'Сбросить выбранный активный Кризис и открыть следующий из колоды.', target: 'crisis' },
  action_16: { description: 'Забрать Багаж у выбранного изгнанного участника.', target: 'expelled' },
  action_17: { description: 'Сократить текущий брифинг или задать 30 секунд для предстоящего брифинга этого раунда.', target: 'none' },
  action_18: { description: 'Поменять картами Уязвимостей с выбранным участником.', target: 'player' },
  action_20: { description: 'Посмотреть все скрытые карты выбранного участника. Результат увидите только вы.', target: 'player' },
  action_24: { description: 'Взять дополнительную карту Багажа из колоды.', target: 'none' },
  action_29: { description: 'Сбросить все текущие Роль, Навыки, Багаж и Уязвимости, затем получить по одной новой закрытой карте каждой категории.', target: 'none' },
};

const PENDING_RULES: Record<string, string> = {
  action_01: 'Нужно определить, кто задаёт вопрос, кто оценивает ответ и как именно добавляется голос.',
  action_13: 'Нужны критерий победы в дуэли, судья и длительность иммунитета.',
  action_19: 'Не определено, кто считается похожим игроком и как округляется половина голосов.',
  action_21: 'Сервер сохраняет отметку о выбранном Кризисе, но финальный аудит пока не исключает его из проверки. Карта отключена до появления структурированного аудита.',
  action_25: 'В игре нет формализованных автоматических эффектов Уязвимостей, которые Safe Boot мог бы отключить. Карта отключена до реализации этой системы.',
  action_22: 'В базовых правилах нет процедуры ввода паролей и подсчёта ошибок.',
  action_23: 'Нужно определить влияние пары на вместимость, голосование и изгнание.',
  action_26: 'Нужен порядок отправки запроса преподавателю и получения подсказки.',
  action_27: 'Нужно определить, как подтверждаются одинаковые роли и заменяет ли это обычное голосование.',
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
    () => players.filter((player) => player.membership_status === 'active' && player.is_alive),
    [players],
  );
  const expelledPlayers = useMemo(
    () => players.filter((player) => player.membership_status === 'active' && !player.is_alive),
    [players],
  );
  const availableCards = cards.filter((card) =>
    AVAILABLE_EFFECTS[card.card_id] && !usedCardInstanceIds.includes(card.instance_id)
  );
  const pendingCards = cards.filter((card) => PENDING_RULES[card.card_id]);

  const submit = (card: ActionCard) => {
    const mode = AVAILABLE_EFFECTS[card.card_id]?.target;
    const selected = selections[card.instance_id] || (mode === 'hot-swap' ? 'deck' : '');
    if (mode === 'choice') {
      if (selected !== 'double_vote' && selected !== 'tie_save') return;
      onUse(card.instance_id, card.card_id, undefined, undefined, selected);
      return;
    }
    if (mode === 'player' || mode === 'expelled' || mode === 'self-or-player' || mode === 'neighbour') {
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
              const neighbours = (() => {
                const ordered = [...activePlayers].sort((a, b) =>
                  (a.joined_at || '').localeCompare(b.joined_at || '') || a.member_id.localeCompare(b.member_id)
                );
                const index = ordered.findIndex((player) => player.member_id === myMemberId);
                if (index < 0 || ordered.length < 2) return [];
                const left = ordered[(index - 1 + ordered.length) % ordered.length];
                const right = ordered[(index + 1) % ordered.length];
                return [...new Map([left, right].map((player) => [player.member_id, player])).values()];
              })();
              const selected = selections[card.instance_id] || (config.target === 'hot-swap' ? 'deck' : '');
              const options = config.target === 'crisis'
                ? crises.map((crisis) => ({ value: crisis.instance_id, label: crisis.title }))
                : config.target === 'choice'
                  ? [
                      { value: 'double_vote', label: 'Мой голос считается за два' },
                      { value: 'tie_save', label: 'Спастись при равенстве голосов' },
                    ]
                  : config.target === 'hot-swap'
                    ? [
                        { value: 'deck', label: 'Взять случайную карту из колоды Багажа' },
                        ...expelledPlayers.map((player) => ({
                          value: player.member_id,
                          label: 'Обмен с изгнанным: ' + player.display_name,
                        })),
                      ]
                    : config.target === 'expelled'
                      ? expelledPlayers.map((player) => ({
                          value: player.member_id,
                          label: player.display_name + ' · изгнан',
                        }))
                      : config.target === 'self-or-player'
                        ? [
                            { value: myMemberId, label: 'Защитить себя' },
                            ...otherPlayers.map((player) => ({ value: player.member_id, label: player.display_name })),
                          ]
                        : config.target === 'neighbour'
                          ? neighbours.map((player) => ({ value: player.member_id, label: player.display_name + ' · сосед' }))
                          : otherPlayers.map((player) => ({ value: player.member_id, label: player.display_name }));
              const needsSelection = config.target !== 'none';
              const selectionValid = config.target === 'none'
                || (config.target === 'hot-swap' && selected === 'deck')
                || Boolean(selected && options.some((option) => option.value === selected));
              return (
                <div className="bunker-online-action-tool" key={card.instance_id}>
                  <div className="bunker-online-action-tool-copy">
                    <strong>{card.card_id === 'action_17' ? 'Сторожевой таймер (Watchdog)' : card.title}</strong>
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
                        <option value="">{config.target === 'choice' ? 'Выберите режим' : 'Выберите цель'}</option>
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
          <span className="bunker-kicker">Нужны доработка или уточнение правил</span>
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
        <p className="bunker-online-action-state"><ShieldAlert aria-hidden="true" /> В состоянии партии есть отметка Safe Boot, но автоматические эффекты Уязвимостей не формализованы и не подавляются.</p>
      )}
      {ignoredCrisisIds.length > 0 && (
        <p className="bunker-online-action-state"><ShieldAlert aria-hidden="true" /> Есть отметка Workaround, но финальный аудит пока не исключает отмеченный Кризис из проверки.</p>
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
