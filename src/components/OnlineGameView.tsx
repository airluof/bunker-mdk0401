import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Users, Crown, DoorOpen, LockKeyhole, Radio, Timer,
  Vote, ArrowRight, CheckCircle2, Circle, Skull, Bot, ShieldCheck, Zap,
} from 'lucide-react';
import type { Card, CardCategory } from '../types/game';
import { CATEGORY_CONFIG } from '../data/cards';
import { CardView } from './CardView';
import { ActionCardControls } from './ActionCardControls';
import type { RoomSnapshot } from '../services/onlineRooms';
import { OnlineConnectionStatusView } from './OnlineConnectionStatus';
import type { OnlineConnectionStatus } from './OnlineConnectionStatus';

interface OnlineGameViewProps {
  snapshot: RoomSnapshot;
  myMemberId: string;
  isHost: boolean;
  busy: boolean;
  error: string | null;
  connectionStatus: OnlineConnectionStatus;
  onRefresh: () => void;
  onTakeover: () => void;
  onExit: () => void;
  onInspectCard: (card: Card) => void;
  onRevealCard: (instanceId: string) => void;
  onUseActionCard: (instanceId: string) => void;
  onUseHotfixCard: (actionInstanceId: string, vulnerabilityInstanceId: string) => void;
  onUseActionEffect: (
    cardInstanceId: string,
    actionId: string,
    targetMemberId?: string,
    targetCardInstanceId?: string,
    actionChoice?: 'double_vote' | 'tie_save',
  ) => void;
  onStartBriefing: () => void;
  onOpenVoting: () => void;
  onVote: (targetMemberId: string) => void;
  onResolveVote: () => void;
  onNextRound: () => void;
  onSubmitAuditPlan: (planText: string) => void;
  onFinishGame: () => void;
}

interface SnapshotCard {
  instance_id?: string;
  card_instance_id?: string;
  owner_member_id?: string;
  card_id: string;
  category?: string;
  title: string;
  description: string;
  image_path?: string | null;
  status?: string;
}

const HAND_ORDER: CardCategory[] = ['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'];
const PHASE_LABELS: Record<string, string> = {
  reveal: 'Вскрытие характеристик',
  briefing: 'Технический брифинг',
  voting: 'Открытое голосование',
  elimination: 'Результат голосования',
  audit: 'Финальный аудит',
  gameover: 'Партия завершена',
};

function toDisplayCard(source: SnapshotCard): Card {
  const category: CardCategory = HAND_ORDER.includes(source.category as CardCategory)
    ? source.category as CardCategory
    : 'crises';
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

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export const OnlineGameView: React.FC<OnlineGameViewProps> = ({
  snapshot,
  myMemberId,
  isHost,
  busy,
  error,
  connectionStatus,
  onRefresh,
  onTakeover,
  onExit,
  onInspectCard,
  onRevealCard,
  onUseActionCard,
  onUseHotfixCard,
  onUseActionEffect,
  onStartBriefing,
  onOpenVoting,
  onVote,
  onResolveVote,
  onNextRound,
  onSubmitAuditPlan,
  onFinishGame,
}) => {
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  // Accept snapshots from deployments whose generated RPC type is older.
  const resultHasTieSaved =
    'tie_saved' in snapshot.current_result && snapshot.current_result.tie_saved === true;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [auditDraft, setAuditDraft] = useState(snapshot.audit_plan.plan_text || '');

  const players = snapshot.players;
  const alivePlayers = players.filter((player) => player.is_alive);
  const humanPlayers = alivePlayers.filter((player) => !player.is_bot);
  const botCount = players.filter((player) => player.is_bot).length;
  const myPlayer = players.find((player) => player.member_id === myMemberId);
  const isAlive = myPlayer?.is_alive === true;
  const phase = snapshot.session.phase;
  const isTestMode = snapshot.room.room_mode === 'test' || snapshot.public_state?.test_mode === true || botCount > 0;
  const phaseLabel = PHASE_LABELS[phase] || 'Игровой этап';

  const revealedSnapshotCards = snapshot.revealed_cards as unknown as SnapshotCard[];
  const ownEmergencyGenerator =
    (snapshot.my_cards as SnapshotCard[]).find((card) => card.card_id === 'action_28') ||
    revealedSnapshotCards.find((card) =>
      card.card_id === 'action_28' && card.owner_member_id === myMemberId
    );
  const ownHotfixCard =
    (snapshot.my_cards as SnapshotCard[]).find((card) => card.card_id === 'action_04') ||
    revealedSnapshotCards.find((card) =>
      card.card_id === 'action_04' && card.owner_member_id === myMemberId
    );
  const ownVulnerability =
    (snapshot.my_cards as SnapshotCard[]).find((card) => card.category === 'vulnerabilities') ||
    revealedSnapshotCards.find((card) =>
      card.category === 'vulnerabilities' && card.owner_member_id === myMemberId
    );
  const usedActionCardIds = Array.isArray(snapshot.public_state?.used_action_cards)
    ? snapshot.public_state.used_action_cards.filter((value): value is string => typeof value === 'string')
    : [];
  const ownActionCards = [
    ...(snapshot.my_cards as SnapshotCard[])
      .filter((card) => card.category === 'actions')
      .map((card) => ({
        instance_id: card.instance_id || card.card_instance_id || '',
        card_id: card.card_id,
        title: card.title,
      })),
    ...revealedSnapshotCards
      .filter((card) => card.category === 'actions' && card.owner_member_id === myMemberId)
      .map((card) => ({
        instance_id: card.instance_id || card.card_instance_id || '',
        card_id: card.card_id,
        title: card.title,
      })),
  ].filter((card) => card.instance_id);
  const watchdogRound = typeof snapshot.public_state?.watchdog_round === 'number'
    ? snapshot.public_state.watchdog_round
    : null;
  const vulnerabilitiesDisabledRound = typeof snapshot.public_state?.vulnerabilities_disabled_round === 'number'
    ? snapshot.public_state.vulnerabilities_disabled_round
    : null;
  const ignoredCrisisIds = Array.isArray(snapshot.public_state?.ignored_crisis_ids)
    ? snapshot.public_state.ignored_crisis_ids.filter((value): value is string => typeof value === 'string')
    : [];
  const emergencyGeneratorInstanceId = ownEmergencyGenerator?.instance_id || ownEmergencyGenerator?.card_instance_id;
  const hotfixInstanceId = ownHotfixCard?.instance_id || ownHotfixCard?.card_instance_id;
  const vulnerabilityInstanceId = ownVulnerability?.instance_id || ownVulnerability?.card_instance_id;
  const canUseEmergencyGenerator = Boolean(
    isAlive &&
    emergencyGeneratorInstanceId &&
    !usedActionCardIds.includes(emergencyGeneratorInstanceId) &&
    !['lobby', 'audit', 'gameover'].includes(phase)
  );
  const canUseHotfix = Boolean(
    isAlive &&
    hotfixInstanceId &&
    vulnerabilityInstanceId &&
    !usedActionCardIds.includes(hotfixInstanceId) &&
    !['lobby', 'audit', 'gameover'].includes(phase)
  );

  const publicCards = (snapshot.revealed_cards as unknown as SnapshotCard[]).map((source) => ({
    ownerMemberId: source.owner_member_id || '',
    card: toDisplayCard(source),
  }));

  const myPublicCards = publicCards
    .filter((entry) => entry.ownerMemberId === myMemberId)
    .map((entry) => entry.card);

  const privateCards = snapshot.my_cards.map((source) => ({
    instanceId: source.instance_id,
    card: toDisplayCard(source as SnapshotCard),
    revealed: false,
    pendingReveal: source.status === 'pending_reveal',
  }));

  const handCards = [
    ...privateCards,
    ...myPublicCards.map((card) => ({ instanceId: '', card, revealed: true, pendingReveal: false })),
  ].sort((left, right) => HAND_ORDER.indexOf(left.card.category) - HAND_ORDER.indexOf(right.card.category));

  const crisisInstances = snapshot.active_crises as unknown as SnapshotCard[];
  const crisisCards = crisisInstances.map((source) => toDisplayCard({
    ...source,
    category: 'crises',
  }));

  const realVotes = snapshot.current_round_votes.filter((vote) =>
    !players.find((player) => player.member_id === vote.voter_member_id)?.is_bot
  );
  const allHumanVotesReceived = humanPlayers.every((player) =>
    snapshot.current_round_votes.some((vote) => vote.voter_member_id === player.member_id)
  );
  const myVote = snapshot.my_vote_target_member_id;
  const canResolveVote = isHost && allHumanVotesReceived && snapshot.current_round_votes.length > 0;
  const revealedHumanCount = humanPlayers.filter((player) =>
    player.revealed_this_round || player.has_hidden_cards === false
  ).length;

  useEffect(() => {
    if (!snapshot.session.deadline_at || phase !== 'briefing') {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const deadline = new Date(snapshot.session.deadline_at as string).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [snapshot.session.deadline_at, phase]);

  useEffect(() => {
    setSelectedVote(null);
  }, [snapshot.session.round_number, phase]);

  useEffect(() => {
    setAuditDraft(snapshot.audit_plan.plan_text || '');
  }, [snapshot.audit_plan.updated_at, phase]);

  const rosterCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const entry of publicCards) {
      const list = map.get(entry.ownerMemberId) || [];
      list.push(entry.card);
      map.set(entry.ownerMemberId, list);
    }
    return map;
  }, [snapshot.revealed_cards]);

  const renderPhaseActions = () => {
    if (phase === 'reveal') {
      return (
        <div className="bunker-online-action-panel">
          <div>
            <span className="bunker-kicker">Первый этап</span>
            <h2>Выберите карту для общего вскрытия</h2>
            <p>
              В каждом раунде можно выбрать любую ещё не раскрытую карту — Роль не имеет приоритета,
              порядок категорий свободный. Выбор останется скрытым от остальных до общего вскрытия.
            </p>
            <p>Когда все живые игроки сделают выбор, ведущий начнёт брифинг — выбранные карты откроются одновременно.</p>
            <p>Если у участника не осталось закрытых карт, он пропускает вскрытие и не задерживает партию.</p>
            <p className="bunker-online-progress">Выборы сделаны: {revealedHumanCount} из {humanPlayers.length} живых игроков.</p>
            {isAlive && myPlayer?.has_hidden_cards === false && (
              <p className="bunker-online-voted">У вас не осталось закрытых карт — в этом раунде вскрытие пропускается.</p>
            )}
          </div>
          {isHost && (
            <button
              type="button"
              className="bunker-button bunker-button-primary"
              onClick={onStartBriefing}
              disabled={busy || revealedHumanCount !== humanPlayers.length}
            >
              Открыть карты и начать брифинг <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      );
    }

    if (phase === 'briefing') {
      return (
        <div className="bunker-online-action-panel">
          <div>
            <span className="bunker-kicker">Второй этап</span>
            <h2>Технический брифинг</h2>
            <p>Одна минута на аргументацию с привязкой к активным кризисам. Таймер отсчитывается по серверному времени и одинаков для всех участников.</p>
            <div className="bunker-online-timer">
              <Timer aria-hidden="true" />
              <strong>{formatClock(secondsLeft)}</strong>
              <span>{secondsLeft > 0 ? 'До открытия голосования' : 'Время вышло'}</span>
            </div>
          </div>
          {isHost && (
            <button
              type="button"
              className="bunker-button bunker-button-primary"
              onClick={onOpenVoting}
              disabled={busy || secondsLeft > 0}
            >
              Открыть голосование <Vote aria-hidden="true" />
            </button>
          )}
        </div>
      );
    }

    if (phase === 'voting') {
      return (
        <div className="bunker-online-action-panel bunker-online-voting">
          <div>
            <span className="bunker-kicker">Третий этап</span>
            <h2>Открытое голосование</h2>
            <p>Голоса видны всем участникам сразу после подачи. Выберите игрока, против которого хотите проголосовать.</p>
            <p className="bunker-online-progress">
              Подано голосов: {snapshot.current_round_votes.length} из {alivePlayers.length}
              {isTestMode && botCount > 0 ? ' · голоса ботов добавлены автоматически' : ''}
            </p>
          </div>
          {isAlive && !myVote && (
            <div className="bunker-online-candidates">
              {alivePlayers.map((player) => (
                <button
                  type="button"
                  key={player.member_id}
                  className={selectedVote === player.member_id ? 'bunker-online-candidate is-selected' : 'bunker-online-candidate'}
                  onClick={() => setSelectedVote(player.member_id)}
                  disabled={busy}
                >
                  <span>{player.display_name}</span>
                  {player.is_bot && <Bot aria-label="Тестовый бот" />}
                  {selectedVote === player.member_id ? <CheckCircle2 /> : <Circle />}
                </button>
              ))}
              <button
                type="button"
                className="bunker-button bunker-button-danger"
                onClick={() => selectedVote && onVote(selectedVote)}
                disabled={busy || !selectedVote}
              >
                Подтвердить голос
              </button>
            </div>
          )}
          {myVote && <p className="bunker-online-voted"><CheckCircle2 aria-hidden="true" /> Ваш голос принят. Изменить его нельзя.</p>}
          {!isAlive && <p className="bunker-online-voted">Вы выбыли из активного голосования. Доступен просмотр результатов.</p>}
          {isHost && (
            <button
              type="button"
              className="bunker-button bunker-button-primary"
              onClick={onResolveVote}
              disabled={busy || !canResolveVote}
            >
              Подвести итоги
            </button>
          )}
        </div>
      );
    }

    if (phase === 'elimination') {
      return (
        <div className="bunker-online-action-panel">
          <div>
            <span className="bunker-kicker">Результат раунда</span>
            <h2>{snapshot.public_state?.no_elimination === true ? 'Голосование отменено' : 'Бункер покидает участник'}</h2>
            <p>
              {snapshot.public_state?.no_elimination === true
                ? 'По карте Rollback в этом раунде никто не выбывает.'
                : snapshot.current_result.eliminated_name || 'Результат ещё не получен'}
              {snapshot.public_state?.no_elimination !== true && snapshot.current_result.vote_count != null
                ? ` · ${snapshot.current_result.vote_count} голосов`
                : ''}
            </p>
            {(snapshot.public_state?.tie_saved === true || resultHasTieSaved) && (
              <p className="bunker-help">Право Вето сработало: владелец карты спасён при равенстве голосов.</p>
            )}
            {snapshot.current_result.tie_break_used && isTestMode && (
              <p className="bunker-help">В тестовом режиме ничья разрешена случайным выбором только для проверки дальнейшего игрового цикла. Это не утверждённое правило обычной партии.</p>
            )}
          </div>
          {isHost && (
            <button type="button" className="bunker-button bunker-button-primary" onClick={onNextRound} disabled={busy}>
              Продолжить <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      );
    }

    if (phase === 'audit') {
      return (
        <section className="bunker-online-audit">
          <span className="bunker-kicker">Финальный этап</span>
          <h2>Команда для восстановления сформирована</h2>
          <p>Составьте общий пошаговый план восстановления инфраструктуры по ГОСТ Р ИСО/МЭК 12207 с учётом оставшихся специалистов, раскрытых карт и активных кризисов.</p>
          <div className="bunker-online-survivors">
            {alivePlayers.map((player) => (
              <div className="bunker-player-row" key={player.member_id}>
                <span className="bunker-player-avatar">{player.display_name.slice(0, 2).toUpperCase()}</span>
                <span className="bunker-player-details">
                  <strong>{player.display_name}</strong>
                  <small>{player.is_bot ? 'Тестовый бот' : 'Участник'}</small>
                </span>
              </div>
            ))}
          </div>
          <label className="bunker-online-audit-label" htmlFor="online-audit-plan">План восстановления</label>
          {isAlive ? (
            <textarea
              id="online-audit-plan"
              value={auditDraft}
              onChange={(event) => setAuditDraft(event.target.value)}
              rows={7}
              maxLength={12000}
              placeholder="1. Локализовать инцидент…&#10;2. Восстановить питание и сеть…&#10;3. Развернуть резервную инфраструктуру…"
              className="bunker-online-audit-textarea"
              disabled={busy}
            />
          ) : (
            <div className="bunker-online-audit-submission">
              {snapshot.audit_plan.plan_text || 'Ведущий ещё не отправил общий план.'}
            </div>
          )}
          <div className="bunker-online-audit-actions">
            <span>
              {snapshot.audit_plan.status === 'submitted'
                ? `План сохранён · ${snapshot.audit_plan.submitted_by_name || 'ведущий'}`
                : 'План ещё не отправлен'}
            </span>
            {isAlive && (
              <>
                <button
                  type="button"
                  className="bunker-button bunker-button-secondary"
                  onClick={() => onSubmitAuditPlan(auditDraft)}
                  disabled={busy || auditDraft.trim().length < 20}
                >
                  Сохранить общий план
                </button>
                <button
                  type="button"
                  className="bunker-button bunker-button-primary"
                  onClick={onFinishGame}
                  disabled={busy || snapshot.audit_plan.status !== 'submitted'}
                >
                  Завершить партию
                </button>
              </>
            )}
          </div>
        </section>
      );
    }

    if (phase === 'gameover') {
      return (
        <section className="bunker-online-audit">
          <span className="bunker-kicker">Система завершила сессию</span>
          <h2>Партия завершена</h2>
          <p>Финальный план восстановления сохранён и доступен всем участникам комнаты.</p>
          {snapshot.audit_plan.plan_text && (
            <div className="bunker-online-audit-submission">{snapshot.audit_plan.plan_text}</div>
          )}
        </section>
      );
    }

    return <p className="bunker-empty-copy">Ожидается следующее действие ведущего.</p>;
  };

  return (
    <section className="bunker-page bunker-online-game">
      <header className="bunker-online-game-heading">
        <div>
          <p className="bunker-eyebrow">
            {isTestMode ? `Тестовая партия · ${botCount} ботов` : 'Обычная онлайн-партия'}
            {' · '}{players.length} участников
          </p>
          <h1>Игровой стол</h1>
          <p className="bunker-page-description">
            Раунд {snapshot.session.round_number} из {snapshot.session.max_rounds} · {phaseLabel}
            {snapshot.bunker_capacity ? ` · мест в Бункере: ${snapshot.bunker_capacity}` : ''}
          </p>
          <OnlineConnectionStatusView status={connectionStatus} />
        </div>
        <div className="bunker-room-actions">
          <button type="button" onClick={onRefresh} disabled={busy} className="bunker-button bunker-button-secondary">
            <RefreshCw aria-hidden="true" />
            {busy ? 'Синхронизируем…' : 'Синхронизировать'}
          </button>
          {!isHost && isAlive && (
            <button type="button" onClick={onTakeover} disabled={busy} className="bunker-button bunker-button-secondary">
              <Crown aria-hidden="true" />
              Перехватить управление
            </button>
          )}
          {isTestMode && (
            <button type="button" onClick={onExit} disabled={busy} className="bunker-button bunker-online-exit-test">
              <DoorOpen aria-hidden="true" />
              {isHost ? 'Завершить тест и выйти' : 'Покинуть тестовую партию'}
            </button>
          )}
        </div>
      </header>

      {error && <div role="alert" className="bunker-error">{error}</div>}

      <section className="bunker-online-action-wrap">
        {renderPhaseActions()}
      </section>

      <section className="bunker-online-game-grid">
        <div className="bunker-online-game-main">
          <section className="bunker-panel bunker-online-crisis-panel">
            <div className="bunker-panel-heading">
              <div>
                <p className="bunker-eyebrow">Общая угроза</p>
                <h2>Активные кризисы</h2>
              </div>
              <span className="bunker-round-stamp">Раунд {snapshot.session.round_number}</span>
            </div>
            <div className="bunker-online-crisis-cards">
              {crisisInstances.map((source) => {
                const card = toDisplayCard({ ...source, category: 'crises' });
                const crisisInstanceId = source.instance_id || source.card_instance_id || '';
                const ignoredForAudit = ignoredCrisisIds.includes(crisisInstanceId);
                return (
                  <div key={crisisInstanceId || card.card_id} className="bunker-online-crisis-card-wrap">
                    {ignoredForAudit && (
                      <span className="bunker-online-crisis-ignore">Workaround · отмечен для игнорирования в финальном аудите</span>
                    )}
                    <CardView card={card} size="md" className="w-full" />
                  </div>
                );
              })}
              {crisisCards.length === 0 && <p className="bunker-empty-copy">Активные кризисы не найдены.</p>}
            </div>
          </section>

          <section className="bunker-hand bunker-online-hand">
            <header className="bunker-hand-heading">
              <div>
                <span className="bunker-kicker">Личное досье</span>
                <h2>Ваши карты</h2>
                <p>
                  {myPlayer?.display_name || 'Игрок'} · {handCards.length} карт
                  {snapshot.my_revealed_this_round ? ' · выбор на этот раунд сохранён' : ''}
                </p>
              </div>
              {canUseEmergencyGenerator && emergencyGeneratorInstanceId && (
                <button
                  type="button"
                  className="bunker-action-card-button"
                  onClick={() => onUseActionCard(emergencyGeneratorInstanceId)}
                  disabled={busy}
                >
                  <Zap aria-hidden="true" />
                  Аварийный генератор · +1 место
                </button>
              )}
              {canUseHotfix && hotfixInstanceId && vulnerabilityInstanceId && (
                <button
                  type="button"
                  className="bunker-action-card-button"
                  onClick={() => onUseHotfixCard(hotfixInstanceId, vulnerabilityInstanceId)}
                  disabled={busy}
                >
                  <ShieldCheck aria-hidden="true" />
                  Hotfix · сбросить Уязвимость
                </button>
              )}
              <span className="bunker-online-private-label"><LockKeyhole aria-hidden="true" /> Личная раздача</span>
            </header>
            <ActionCardControls
              myMemberId={myMemberId}
              cards={ownActionCards}
              players={players}
              crises={(snapshot.active_crises as unknown as SnapshotCard[]).map((crisis) => ({
                instance_id: crisis.instance_id || crisis.card_instance_id || '',
                card_id: crisis.card_id,
                title: crisis.title,
              })).filter((crisis) => crisis.instance_id)}
              usedCardInstanceIds={usedActionCardIds}
              privateEvents={snapshot.my_private_action_events || []}
              currentRound={snapshot.session.round_number}
              watchdogRound={watchdogRound}
              vulnerabilitiesDisabledRound={vulnerabilitiesDisabledRound}
              ignoredCrisisIds={ignoredCrisisIds}
              busy={busy}
              onUse={onUseActionEffect}
            />
            <p className="bunker-hand-scroll-hint">Листайте карты по горизонтали.</p>
            <div className="bunker-hand-grid bunker-online-hand-grid">
              {handCards.map(({ instanceId, card, revealed, pendingReveal }) => (
                <div key={card.card_id} className="bunker-hand-slot">
                  <CardView
                    card={card}
                    isRevealed={revealed}
                    canReveal={
                      !revealed &&
                      isAlive &&
                      phase === 'reveal' &&
                      !snapshot.my_revealed_this_round
                    }
                    lockedLabel={
                      phase === 'reveal' && isAlive && pendingReveal
                        ? 'Выбрана · ждёт общего вскрытия'
                        : phase === 'reveal' && isAlive && snapshot.my_revealed_this_round
                          ? 'Выбор уже сделан в этом раунде'
                          : 'Доступна только вам'
                    }
                    onReveal={() => onRevealCard(instanceId)}
                    onInspect={() => onInspectCard(card)}
                    size="md"
                    className="w-full h-64"
                  />
                </div>
              ))}
            </div>
            {handCards.length === 0 && (
              <p className="bunker-empty-copy">Личные карты не получены. Нажмите «Синхронизировать».</p>
            )}
          </section>

          <section className="bunker-panel bunker-online-public-cards">
            <div className="bunker-panel-heading">
              <div>
                <p className="bunker-eyebrow">Открытая информация</p>
                <h2>Раскрытые характеристики</h2>
              </div>
              <span>{publicCards.length} карт</span>
            </div>
            <div className="bunker-online-public-grid">
              {players.map((player) => {
                const cards = rosterCards.get(player.member_id) || [];
                return (
                  <article key={player.member_id} className="bunker-online-public-player">
                    <header>
                      <strong>{player.display_name}</strong>
                      <small>{player.is_bot ? 'Бот' : player.technical_role === 'host' ? 'Ведущий' : 'Игрок'}</small>
                    </header>
                    {cards.length > 0 ? (
                      <div className="bunker-online-public-card-list">
                        {cards.map((card) => (
                          <button key={card.card_id} type="button" onClick={() => onInspectCard(card)}>
                            <span>{card.category_name_ru}</span>
                            <strong>{card.original_title}</strong>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>Пока нет раскрытых карт</p>
                    )}
                  </article>
                );
              })}
            </div>
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
                <strong>{alivePlayers.length}</strong>
                <span>из {players.length} в игре</span>
              </div>
            </div>
            <div className="bunker-online-roster-list">
              {players.map((player) => (
                <div className={player.is_alive ? 'bunker-player-row' : 'bunker-player-row is-eliminated'} key={player.member_id}>
                  <span className="bunker-player-avatar">
                    {player.is_alive ? player.display_name.trim().slice(0, 2).toUpperCase() : <Skull aria-hidden="true" />}
                  </span>
                  <span className="bunker-player-details">
                    <strong>{player.display_name}</strong>
                    <small>
                      {!player.is_alive
                        ? `Выбыл · раунд ${player.eliminated_in_round || '?'}`
                        : player.is_bot
                          ? 'Тестовый бот'
                          : player.member_id === myMemberId
                            ? 'Вы'
                            : 'Игрок'}
                    </small>
                  </span>
                  {player.technical_role === 'host' && <span className="bunker-host-label"><Crown aria-hidden="true" /> Ведущий</span>}
                  {player.is_bot && <Bot aria-label="Бот" />}
                  {phase === 'voting' && player.votes_received > 0 && <strong>{player.votes_received} гол.</strong>}
                </div>
              ))}
            </div>
          </section>

          {phase === 'voting' && (
            <section className="bunker-panel bunker-online-vote-ledger">
              <div className="bunker-panel-heading">
                <div>
                  <p className="bunker-eyebrow">Публичный протокол</p>
                  <h2>Кто как проголосовал</h2>
                </div>
              </div>
              {snapshot.current_round_votes.length > 0 ? (
                snapshot.current_round_votes.map((vote) => (
                  <div className="bunker-online-vote-row" key={vote.voter_member_id}>
                    <span>{vote.voter_name}</span>
                    <ArrowRight aria-hidden="true" />
                    <strong>{vote.target_name}</strong>
                  </div>
                ))
              ) : (
                <p className="bunker-empty-copy">Голосов пока нет.</p>
              )}
            </section>
          )}

          <section className="bunker-panel bunker-online-status">
            <Radio aria-hidden="true" />
            <h2>Состояние комнаты</h2>
            <p>
              Карты, фазы и голоса хранятся на сервере. При активном соединении изменения поступают на устройства участников автоматически.
            </p>
            {isTestMode && <p className="bunker-help"><Bot aria-hidden="true" /> Боты выполняют простые тестовые действия и не используют игровой ИИ.</p>}
          </section>
        </aside>
      </section>
    </section>
  );
};
