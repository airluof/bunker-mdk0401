import React, { useState, useEffect } from 'react';
import { 
  GameState, 
  Player, 
  Card, 
  PlayerSlotCategory, 
  GameLogEntry, 
  GamePhase,
} from './types/game';
import { 
  ALL_CARDS, 
  dealNewGame, 
  shuffleArray, 
  CARDS_BY_CATEGORY,
} from './data/cards';
import { Navbar } from './components/Navbar';
import { ActiveCrisesBanner } from './components/ActiveCrisesBanner';
import { PersonalHand } from './components/PersonalHand';
import { PlayerRoster } from './components/PlayerRoster';
import { BriefingTimer } from './components/BriefingTimer';
import { VotingModal } from './components/VotingModal';
import { FinalAuditView } from './components/FinalAuditView';
import { CardCatalogView } from './components/CardCatalogView';
import { CardInspectModal } from './components/CardInspectModal';
import { GameRulesModal } from './components/GameRulesModal';
import { IncidentLog } from './components/IncidentLog';
import { OnlineRoomLobby } from './components/OnlineRoomLobby';
import { OnlineGameView } from './components/OnlineGameView';
import { OnlineConnectionStatusView } from './components/OnlineConnectionStatus';
import type { OnlineConnectionStatus } from './components/OnlineConnectionStatus';
import {
  createOnlineRoom,
  createOnlineTestRoom,
  joinOnlineRoom,
  getOnlineRoomSnapshot,
  heartbeatOnlineRoom,
  takeoverOnlineRoomControl,
  subscribeToOnlineRoom,
  leaveOnlineRoom,
  closeOnlineRoom,
  updateOnlineRoomSettings,
  startOnlineGame,
  addOnlineTestBots,
  exitOnlineTestRoom,
  revealOnlineCard,
  useOnlineActionCard,
  useOnlineActionEffect,
  useOnlineExploitSkillCard,
  useOnlineHotfixCard,
  transitionOnlineGamePhase,
  submitOnlineVote,
  resolveOnlineVote,
  advanceOnlineGameRound,
  submitOnlineAuditPlan,
  finishOnlineGame,
} from './services/onlineRooms';
import type { RoomSnapshot } from './services/onlineRooms';
import { isSupabaseConfigured } from './services/supabase';
import { 
  saveGameState, 
  loadGameState, 
  clearGameState, 
  loadLocalUser, 
  saveLocalUser 
} from './services/storage';
import { sound } from './services/sound';
import { 
  ShieldAlert, 
  Users, 
  Plus, 
  Play, 
  Radio, 
  Copy, 
  Check, 
  ArrowRight, 
  RefreshCw, 
  AlertTriangle, 
  Flame, 
  Layers, 
  Cpu, 
  Zap, 
  Terminal,
  Clock,
  Vote,
  Sparkles,
  Info
} from 'lucide-react';

interface OnlineRoomSession {
  roomId: string;
  memberId: string;
  inviteCode?: string;
  snapshot: RoomSnapshot;
}

const ONLINE_ROOM_STORAGE_KEY = 'bunker_mdk0401_online_room_id';
const ONLINE_INVITE_STORAGE_KEY = 'bunker_mdk0401_online_invite_code';

function isValidOnlineInviteCode(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{5}$/.test(normalized) || /^[0-9A-F]{32}$/.test(normalized);
}

function getSavedOnlineInviteCode(): string | undefined {
  try {
    // Migrate invitation codes saved by the previous sessionStorage version.
    const inviteCode = localStorage.getItem(ONLINE_INVITE_STORAGE_KEY)
      || sessionStorage.getItem(ONLINE_INVITE_STORAGE_KEY);
    if (inviteCode) {
      localStorage.setItem(ONLINE_INVITE_STORAGE_KEY, inviteCode);
    }
    sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
    return inviteCode || undefined;
  } catch {
    return undefined;
  }
}

function formatOnlineError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toUpperCase();

  if (
    normalized.includes('FAILED TO FETCH') ||
    normalized.includes('NETWORK REQUEST FAILED') ||
    normalized.includes('NETWORKERROR') ||
    normalized.includes('ERR_INTERNET_DISCONNECTED')
  ) {
    return 'Нет соединения с сервером. Проверьте интернет и повторите попытку — сохранённая комната не удалится.';
  }
  if (normalized.includes('SUPABASE_NOT_CONFIGURED')) {
    return 'Онлайн-режим не настроен. Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.';
  }
  if (normalized.includes('UNAUTHENTICATED') || normalized.includes('ANONYMOUS_SIGN_IN_FAILED')) {
    return 'Не удалось создать гостевую сессию. Обновите страницу и попробуйте снова.';
  }
  if (normalized.includes('ROOM_NOT_FOUND')) {
    return 'Комната не найдена. Проверьте код приглашения.';
  }
  if (normalized.includes('ROOM_NOT_JOINABLE')) {
    return 'Эта комната уже запущена или закрыта и не принимает новых участников.';
  }
  if (normalized.includes('ROOM_FULL')) {
    return 'В комнате уже максимальное количество участников — 16.';
  }
  if (normalized.includes('ACTIVE_ROOM_OR_DUPLICATE_NAME')) {
    return 'Вы уже участвуете в другой комнате или такой позывной занят.';
  }
  if (normalized.includes('PLAYER_COUNT_OUT_OF_RANGE')) {
    return 'Для запуска нужно от 8 до 16 активных участников.';
  }
  if (normalized.includes('INVALID_MAX_PLAYERS')) {
    return 'Лимит комнаты должен быть от 8 до 16 участников.';
  }
  if (normalized.includes('ROOM_CAPACITY_BELOW_CURRENT')) {
    return 'Нельзя установить лимит ниже числа уже подключённых игроков.';
  }
  if (normalized.includes('ROOM_NOT_EDITABLE')) {
    return 'Настройки можно менять только до начала игры.';
  }
  if (normalized.includes('FORBIDDEN')) {
    return 'Изменять настройки комнаты может только её создатель.';
  }
  if (normalized.includes('CARD_CATALOG_INCOMPLETE')) {
    return 'Каталог карточек ещё не загружен в Supabase. Обратитесь к создателю игры.';
  }
  if (normalized.includes('ROOM_CONTROLLER_STILL_ACTIVE')) {
    return 'Ведущий ещё отвечает. Перехват управления станет доступен после 90 секунд без связи.';
  }
  if (normalized.includes('ROOM_CONTROLLER_NOT_FOUND') || normalized.includes('ROOM_NOT_AVAILABLE_FOR_TAKEOVER')) {
    return 'Сейчас нельзя передать управление этой комнатой.';
  }
  if (normalized.includes('HOST_MUST_CLOSE_ROOM')) {
    return 'Создатель должен закрыть комнату, прежде чем выйти из неё.';
  }
  if (normalized.includes('BOTS_ALLOWED_ONLY_IN_TEST_ROOMS')) {
    return 'Боты разрешены только в тестовых комнатах. Создайте тестовую комнату, чтобы добавить их.';
  }
  if (normalized.includes('PLAYERS_MUST_REVEAL_FIRST')) {
    return 'Сначала каждый живой участник, у которого остались закрытые карты, должен раскрыть одну карту текущего раунда.';
  }
  if (normalized.includes('FIRST_ROUND_REQUIRES_ROLE')) {
    return 'В первом раунде можно раскрыть только карту «Роль».';
  }
  if (normalized.includes('ALREADY_REVEALED_THIS_ROUND')) {
    return 'Вы уже раскрыли карту в этом раунде.';
  }
  if (normalized.includes('BRIEFING_TIMER_RUNNING')) {
    return 'Брифинг ещё идёт. Голосование откроется после завершения 60 секунд.';
  }
  if (normalized.includes('ALREADY_VOTED_THIS_ROUND')) {
    return 'Вы уже проголосовали в этом раунде.';
  }
  if (normalized.includes('WAITING_FOR_PLAYER_VOTES')) {
    return 'Не все реальные участники ещё проголосовали.';
  }
  if (normalized.includes('VOTE_TIE_NEEDS_RULE')) {
    return 'Получилась ничья. Для обычной партии способ её разрешения ещё не утверждён.';
  }
  if (normalized.includes('AUDIT_PLAN_INVALID')) {
    return 'План восстановления должен содержать от 20 до 12 000 символов.';
  }
  if (normalized.includes('AUDIT_NOT_OPEN')) {
    return 'Финальный аудит ещё не открыт.';
  }
  if (normalized.includes('AUDIT_PLAN_REQUIRED')) {
    return 'Сначала сохраните общий план восстановления, затем завершите партию.';
  }
  if (normalized.includes('ACTIVE_GAME_CANNOT_BE_LEFT')) {
    return 'Нельзя покинуть обычную партию до её завершения.';
  }
  if (normalized.includes('NOT_ACTIVE_PLAYER')) {
    return 'Вы не можете выполнять это действие: возможно, вы выбыли из партии.';
  }
  if (normalized.includes('NOT_ELIGIBLE_TO_VOTE')) {
    return 'Вы не можете голосовать в текущем состоянии партии.';
  }
  if (normalized.includes('VOTING_NOT_OPEN')) {
    return 'Голосование пока не открыто.';
  }
  if (normalized.includes('REVEAL_PHASE_CLOSED')) {
    return 'Этап вскрытия уже завершён.';
  }
  if (normalized.includes('SKILL_DECK_EMPTY')) {
    return 'В колоде Навыков больше нет карт. Эксплойт не был потрачен.';
  }
  if (normalized.includes('CARD_NOT_AVAILABLE')) {
    return 'Эта карта уже раскрыта или не принадлежит вашей руке.';
  }
  if (normalized.includes('RULE_NOT_APPROVED')) {
    return 'Это действие пока недоступно: соответствующая игровая процедура ещё не утверждена.';
  }
  return message || fallback;
}

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(() => {
    const savedGame = loadGameState();
    if (savedGame?.isLocalDemo && !savedGame?.isOnlineBotTest) {
      clearGameState();
      return null;
    }
    return savedGame;
  });
  const [currentUser, setCurrentUser] = useState(() => loadLocalUser());
  const [currentView, setCurrentView] = useState<'game' | 'catalog'>('game');
  const [inspectingCard, setInspectingCard] = useState<Card | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSession | null>(null);
  const [savedRoomId, setSavedRoomId] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineConnectionStatus, setOnlineConnectionStatus] = useState<OnlineConnectionStatus>('disconnected');


  // Restore the last online room after a page refresh. A temporary network
  // failure must not erase the saved room or its invitation code.
  useEffect(() => {
    const storedRoomId = localStorage.getItem(ONLINE_ROOM_STORAGE_KEY);
    if (!storedRoomId) return;

    let cancelled = false;
    setSavedRoomId(storedRoomId);
    setOnlineBusy(true);

    void getOnlineRoomSnapshot(storedRoomId)
      .then((snapshot) => {
        if (cancelled) return;
        setOnlineRoom({
          roomId: storedRoomId,
          memberId: snapshot.my_member_id,
          inviteCode: getSavedOnlineInviteCode(),
          snapshot,
        });
        setSavedRoomId(null);
        setOnlineError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOnlineError(formatOnlineError(
            error,
            'Не удалось восстановить подключение. Сохранённая комната не удалена — попробуйте ещё раз.',
          ));
        }
      })
      .finally(() => {
        if (!cancelled) setOnlineBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime messages are invalidation signals; always reload the permitted server snapshot.
  useEffect(() => {
    if (!onlineRoom?.roomId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setOnlineConnectionStatus('connecting');

    void subscribeToOnlineRoom(
      onlineRoom.roomId,
      () => {
        void getOnlineRoomSnapshot(onlineRoom.roomId)
          .then((snapshot) => {
            if (cancelled) return;
            setOnlineError(null);
            if (snapshot.room.status === 'archived') {
              showToast('Комната закрыта создателем. Нажмите «Вернуться на главную».');
            }
            setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
              ? { ...current, snapshot }
              : current);
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              setOnlineConnectionStatus('reconnecting');
              setOnlineError(formatOnlineError(error, 'Не удалось обновить комнату.'));
            }
          });
      },
      (status) => {
        if (!cancelled) setOnlineConnectionStatus(status);
      },
    )
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOnlineConnectionStatus('disconnected');
          setOnlineError(formatOnlineError(error, 'Не удалось подключить обновления комнаты.'));
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [onlineRoom?.roomId]);

  // When Realtime is unavailable, keep the visible game state fresh through a
  // low-frequency snapshot fallback. This does not pretend the live channel is healthy.
  useEffect(() => {
    const roomId = onlineRoom?.roomId;
    if (!roomId || onlineConnectionStatus === 'connected' || onlineConnectionStatus === 'connecting') return;

    let cancelled = false;
    const refreshFallbackSnapshot = async () => {
      try {
        const snapshot = await getOnlineRoomSnapshot(roomId);
        if (cancelled) return;
        setOnlineError(null);
        setOnlineRoom((current) => current?.roomId === roomId
          ? { ...current, snapshot }
          : current);
      } catch {
        if (!cancelled) setOnlineConnectionStatus('disconnected');
      }
    };

    void refreshFallbackSnapshot();
    const interval = window.setInterval(() => {
      void refreshFallbackSnapshot();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onlineRoom?.roomId, onlineConnectionStatus]);

  // Keep an authenticated heartbeat while this participant is inside a room.
  // Heartbeats are written to a private table and do not trigger room-wide Realtime refreshes.
  useEffect(() => {
    const roomId = onlineRoom?.roomId;
    if (!roomId) return;

    let cancelled = false;
    const sendHeartbeat = async () => {
      try {
        await heartbeatOnlineRoom(roomId);
      } catch (error: unknown) {
        if (!cancelled) {
          setOnlineError(formatOnlineError(error, 'Не удалось обновить подключение к комнате.'));
        }
      }
    };

    void sendHeartbeat();
    const interval = window.setInterval(() => {
      void sendHeartbeat();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onlineRoom?.roomId]);

  // Sync state changes with session storage
  useEffect(() => {
    if (gameState) {
      saveGameState(gameState);
    }
  }, [gameState]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleRestoreSavedOnlineRoom = async () => {
    const storedRoomId = localStorage.getItem(ONLINE_ROOM_STORAGE_KEY) || savedRoomId;
    if (!storedRoomId) return;

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const snapshot = await getOnlineRoomSnapshot(storedRoomId);
      setOnlineRoom({
        roomId: storedRoomId,
        memberId: snapshot.my_member_id,
        inviteCode: getSavedOnlineInviteCode(),
        snapshot,
      });
      setSavedRoomId(null);
      setCurrentView('game');
      showToast('Подключение к сохранённой комнате восстановлено.');
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(
        error,
        'Не удалось восстановить подключение. Проверьте сеть и повторите попытку.',
      ));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleForgetSavedOnlineRoom = () => {
    localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
    localStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
    sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
    setSavedRoomId(null);
    setOnlineError(null);
  };

  const addLog = (
    type: GameLogEntry['type'], 
    message: string, 
    actorName?: string, 
    cardId?: string
  ) => {
    const entry: GameLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      round: gameState ? gameState.round : 1,
      type,
      message,
      actorName,
      cardId,
    };
    return entry;
  };


  const handleCreateOnlineRoom = async (roomMode: 'players' | 'test' = 'players') => {
    const displayName = currentUser.name.trim();
    if (displayName.length < 2 || displayName.length > 24) {
      setOnlineError('Позывной должен содержать от 2 до 24 символов.');
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const result = roomMode === 'test'
        ? await createOnlineTestRoom(displayName)
        : await createOnlineRoom(displayName);
      localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, result.room_id);
      if (result.invite_code) {
        localStorage.setItem(ONLINE_INVITE_STORAGE_KEY, result.invite_code);
        sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      } else {
        localStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
        sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      }
      setSavedRoomId(result.room_id);

      const snapshot = await getOnlineRoomSnapshot(result.room_id);
      setOnlineRoom({
        roomId: result.room_id,
        memberId: result.member_id,
        inviteCode: result.invite_code,
        snapshot,
      });
      setSavedRoomId(null);
      setGameState(null);
      clearGameState();
      sound.playCrisisAlert();
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, roomMode === 'test'
        ? 'Не удалось создать тестовую комнату.'
        : 'Не удалось создать онлайн-комнату.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleJoinOnlineRoom = async () => {
    const displayName = currentUser.name.trim();
    const inviteCode = roomCodeInput.trim().toUpperCase();

    if (displayName.length < 2 || displayName.length > 24) {
      setOnlineError('Позывной должен содержать от 2 до 24 символов.');
      return;
    }
    if (!isValidOnlineInviteCode(inviteCode)) {
      setOnlineError('Код должен содержать 5 символов A–Z или 0–9. Также принимаются старые 32-символьные коды.');
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const result = await joinOnlineRoom(inviteCode, displayName);
      localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, result.room_id);
      localStorage.setItem(ONLINE_INVITE_STORAGE_KEY, inviteCode);
      sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      setSavedRoomId(result.room_id);

      const snapshot = await getOnlineRoomSnapshot(result.room_id);
      setOnlineRoom({
        roomId: result.room_id,
        memberId: result.member_id,
        inviteCode,
        snapshot,
      });
      setSavedRoomId(null);
      setGameState(null);
      clearGameState();
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось подключиться к комнате.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleRefreshOnlineRoom = async () => {
    if (!onlineRoom) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const snapshot = await getOnlineRoomSnapshot(onlineRoom.roomId);
      if (snapshot.room.status === 'archived') {
        showToast('Комната закрыта. Нажмите «Вернуться на главную», чтобы выйти.');
      }
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось обновить комнату.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleSaveOnlineRoomSettings = async (maxPlayers: number) => {
    if (!onlineRoom) return;

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      await updateOnlineRoomSettings(onlineRoom.roomId, maxPlayers);
      const snapshot = await getOnlineRoomSnapshot(onlineRoom.roomId);
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
      showToast(`Лимит комнаты изменён: до ${maxPlayers} участников.`);
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось сохранить настройки комнаты.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleStartOnlineGame = async () => {
    if (!onlineRoom) return;

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      await startOnlineGame(onlineRoom.roomId);
      const snapshot = await getOnlineRoomSnapshot(onlineRoom.roomId);
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
      showToast(snapshot.room.room_mode === 'test'
        ? 'Тестовая партия запущена. Игроки и боты работают в общей серверной сессии.'
        : 'Партия запущена. Личные карты выданы участникам.');
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось запустить онлайн-партию.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleAddOnlineTestBots = async () => {
    if (!onlineRoom) return;

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const result = await addOnlineTestBots(onlineRoom.roomId);
      const snapshot = await getOnlineRoomSnapshot(onlineRoom.roomId);
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
      showToast(result.added > 0
        ? `Добавлено ботов: ${result.added}. В лобби теперь ${result.active_players} игроков.`
        : 'Минимум игроков уже набран.');
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось добавить тестовых ботов.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  const runOnlineGameAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    fallbackMessage: string,
  ) => {
    if (!onlineRoom) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      await action();
      const snapshot = await getOnlineRoomSnapshot(onlineRoom.roomId);
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
      showToast(successMessage);
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, fallbackMessage));
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleTakeoverOnlineRoom = () => runOnlineGameAction(
    () => takeoverOnlineRoomControl(onlineRoom!.roomId),
    'Управление комнатой передано вам.',
    'Не удалось перехватить управление комнатой.',
  );

  const handleRevealOnlineCard = (instanceId: string) => runOnlineGameAction(
    () => revealOnlineCard(onlineRoom!.roomId, instanceId),
    'Выбор сохранён. Карта откроется вместе с остальными.',
    'Не удалось сохранить выбор карты.',
  );

  const handleUseOnlineActionCard = (instanceId: string) => runOnlineGameAction(
    () => useOnlineActionCard(onlineRoom!.roomId, instanceId),
    'Аварийный генератор активирован. Вместимость Бункера увеличена на одно место.',
    'Не удалось применить карту действия.',
  );

  const handleUseOnlineActionEffect = (
    cardInstanceId: string,
    actionId: string,
    targetMemberId?: string,
    targetCardInstanceId?: string,
  ) => runOnlineGameAction(
    () => actionId === 'action_11'
      ? useOnlineExploitSkillCard(onlineRoom!.roomId, cardInstanceId)
      : useOnlineActionEffect(
          onlineRoom!.roomId,
          cardInstanceId,
          targetMemberId,
          targetCardInstanceId,
        ),
    actionId === 'action_11'
      ? 'Эксплойт применён. В личную руку добавлен второй Навык.'
      : 'Карта действия применена. Состояние синхронизировано с сервером.',
    'Не удалось применить карту действия.',
  );

  const handleUseOnlineHotfix = (actionInstanceId: string, vulnerabilityInstanceId: string) => runOnlineGameAction(
    () => useOnlineHotfixCard(onlineRoom!.roomId, actionInstanceId, vulnerabilityInstanceId),
    'Hotfix применён. Ваша карта Уязвимости отправлена в отбой.',
    'Не удалось применить Hotfix.',
  );

  const handleStartBriefing = () => runOnlineGameAction(
    () => transitionOnlineGamePhase(onlineRoom!.roomId, 'briefing'),
    'Брифинг начался. Таймер установлен сервером на 60 секунд.',
    'Не удалось перейти к брифингу.',
  );

  const handleOpenVoting = () => runOnlineGameAction(
    () => transitionOnlineGamePhase(onlineRoom!.roomId, 'voting'),
    'Голосование открыто. Тестовые боты уже подали свои голоса.',
    'Не удалось открыть голосование.',
  );

  const handleSubmitOnlineVote = (targetMemberId: string) => runOnlineGameAction(
    () => submitOnlineVote(onlineRoom!.roomId, targetMemberId),
    'Ваш голос учтён и виден участникам.',
    'Не удалось подать голос.',
  );

  const handleResolveOnlineVote = () => runOnlineGameAction(
    () => resolveOnlineVote(onlineRoom!.roomId),
    'Результат голосования зафиксирован.',
    'Не удалось подвести итоги голосования.',
  );

  const handleAdvanceOnlineRound = () => runOnlineGameAction(
    () => advanceOnlineGameRound(onlineRoom!.roomId),
    'Игровое состояние обновлено.',
    'Не удалось перейти к следующему этапу.',
  );

  const handleSubmitOnlineAuditPlan = (planText: string) => runOnlineGameAction(
    () => submitOnlineAuditPlan(onlineRoom!.roomId, planText),
    'План восстановления сохранён на сервере.',
    'Не удалось сохранить план восстановления.',
  );

  const handleFinishOnlineGame = () => runOnlineGameAction(
    () => finishOnlineGame(onlineRoom!.roomId),
    'Партия завершена. Можно покинуть комнату.',
    'Не удалось завершить партию.',
  );

  const handleExitOnlineRoom = async () => {
    if (!onlineRoom) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const ownMember = onlineRoom.snapshot.players.find(
        (player) => player.member_id === onlineRoom.memberId
      );
      const isTestMode = onlineRoom.snapshot.room.room_mode === 'test'
        || onlineRoom.snapshot.public_state?.test_mode === true
        || onlineRoom.snapshot.players.some((player) => player.is_bot);

      if (isTestMode && ['in_progress', 'finished'].includes(onlineRoom.snapshot.room.status)) {
        const result = await exitOnlineTestRoom(onlineRoom.roomId);
        localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
        localStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
        sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
        setSavedRoomId(null);
        setOnlineRoom(null);
        setGameState(null);
        clearGameState();
        showToast(result.status === 'archived' ? 'Тестовая комната закрыта.' : 'Вы вышли из тестовой партии.');
        return;
      }

      if (ownMember?.technical_role === 'host' && onlineRoom.snapshot.room.status === 'lobby') {
        await closeOnlineRoom(onlineRoom.roomId);
      }
      await leaveOnlineRoom(onlineRoom.roomId);

      localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
      localStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      setSavedRoomId(null);
      setOnlineRoom(null);
      setGameState(null);
      clearGameState();
      showToast(ownMember?.technical_role === 'host' ? 'Комната закрыта.' : 'Вы покинули комнату.');
    } catch (error: unknown) {
      setOnlineError(formatOnlineError(error, 'Не удалось выйти из комнаты.'));
    } finally {
      setOnlineBusy(false);
    }
  };

  // Launch instant simulation mode
  const handleLaunchSimulation = () => {
    const defaultEngineers = [
      currentUser.name || 'Инженер-Координатор',
      'Сисадмин Домена (AD)',
      'Инженер SAN/iSCSI',
      'Специалист SecOps',
      'Инженер ЦОД и ИБП',
      'DevOps-инженер CI/CD',
    ];

    const deal = dealNewGame(defaultEngineers);
    const roomCode = `DRP-${Math.floor(1000 + Math.random() * 9000)}`;

    const newGame: GameState = {
      isLocalDemo: true,
      roomCode,
      hostId: deal.players[0].id,
      round: 1,
      maxRounds: 5,
      phase: 'lobby',
      players: deal.players,
      activeCrises: deal.activeCrises,
      crisisDeck: deal.crisisDeck,
      skillDeck: deal.skillDeck,
      bunkerCapacity: deal.bunkerCapacity,
      timerSeconds: 60,
      timerActive: false,
      activeSpeakerId: deal.players[0].id,
      lastEliminatedPlayerId: null,
      recoveryPlan: [],
      log: [
        {
          id: `log_init_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ru-RU'),
          round: 1,
          type: 'system',
          message: `Создана сессия Бункера [${roomCode}]. Аварийный статус: активен. Выданы комплекты из 5 карт.`,
        },
      ],
    };

    setGameState(newGame);
    sound.playCrisisAlert();
    showToast(`Сессия ${roomCode} успешно инициализирована`);
  };

  // Create customized room
  const handleCreateRoom = () => {
    const defaultEngineers = [
      currentUser.name || 'Инженер-Архитектор',
      'Сетевой инженер NetAdmin',
      'DBA Администратор СУБД',
      'Инженер техподдержки L3',
    ];
    const deal = dealNewGame(defaultEngineers);
    const roomCode = `BUNKER-${Math.floor(100 + Math.random() * 900)}`;

    const newGame: GameState = {
      isLocalDemo: true,
      roomCode,
      hostId: deal.players[0].id,
      round: 1,
      maxRounds: 5,
      phase: 'lobby',
      players: deal.players,
      activeCrises: deal.activeCrises,
      crisisDeck: deal.crisisDeck,
      skillDeck: deal.skillDeck,
      bunkerCapacity: deal.bunkerCapacity,
      timerSeconds: 60,
      timerActive: false,
      activeSpeakerId: deal.players[0].id,
      lastEliminatedPlayerId: null,
      recoveryPlan: [],
      log: [
        {
          id: `log_init_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ru-RU'),
          round: 1,
          type: 'system',
          message: `Создана комната [${roomCode}]. Ожидание участников.`,
        },
      ],
    };

    setGameState(newGame);
    sound.playCrisisAlert();
  };

  // Start game from lobby
  const handleStartGame = () => {
    if (!gameState) return;
    sound.playCrisisAlert();

    const startLog: GameLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: 1,
      type: 'crisis',
      message: `Раунд 1 начался! Активирован сбой ЦОД: [${gameState.activeCrises[0]?.original_title}]. Фаза: Вскрытие характеристик.`,
    };

    setGameState({
      ...gameState,
      phase: 'reveal',
      round: 1,
      log: [...gameState.log, startLog],
    });
    showToast('Раунд 1 начался! Вскройте карту из вашего досье');
  };

  // Add bot engineer in lobby
  const handleAddTestEngineer = () => {
    if (!gameState || gameState.players.length >= 16) return;

    const names = [
      'QA System Engineer',
      'Инженер по бэкапам LTO',
      'Специалист по ZFS/VSS',
      'Технический писатель ГОСТ',
      'Инженер IPMI/iLO',
      'Администратор Linux',
    ];
    const unusedNames = names.filter(n => !gameState.players.some(p => p.name === n));
    const nextName = unusedNames[0] || `Инженер #${gameState.players.length + 1}`;

    const shuffledRoles = shuffleArray(CARDS_BY_CATEGORY.roles);
    const shuffledSkills = shuffleArray(CARDS_BY_CATEGORY.skills);
    const shuffledBaggage = shuffleArray(CARDS_BY_CATEGORY.baggage);
    const shuffledVulns = shuffleArray(CARDS_BY_CATEGORY.vulnerabilities);
    const shuffledActions = shuffleArray(CARDS_BY_CATEGORY.actions);
    const availableSkills = gameState.skillDeck ?? shuffleArray(CARDS_BY_CATEGORY.skills.filter((skill) =>
      !gameState.players.some((player) =>
        player.hand.skills.card_id === skill.card_id
        || (player.hand.extraSkills || []).some((extraSkill) => extraSkill.card_id === skill.card_id)
      )
    ));
    const newPlayerSkill = availableSkills[0];

    if (!newPlayerSkill) {
      showToast('В колоде Навыков больше нет карт. Нельзя добавить участника.');
      return;
    }

    const newPlayer: Player = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: nextName,
      isHost: false,
      isReady: true,
      isAlive: true,
      avatarSeed: `eng_${gameState.players.length + 1}`,
      hand: {
        roles: shuffledRoles[0],
        skills: newPlayerSkill,
        baggage: shuffledBaggage[0],
        vulnerabilities: shuffledVulns[0],
        actions: shuffledActions[0],
      },
      revealed: {
        roles: false,
        skills: false,
        baggage: false,
        vulnerabilities: false,
        actions: false,
      },
      actionUsed: false,
      votesReceived: 0,
      votedForId: null,
    };

    const newPlayers = [...gameState.players, newPlayer];
    const updatedCapacity = Math.max(2, Math.floor(newPlayers.length / 2));
    const nextSkillDeck = availableSkills.slice(1);

    setGameState({
      ...gameState,
      players: newPlayers,
      skillDeck: nextSkillDeck,
      bunkerCapacity: updatedCapacity,
      log: [
        ...gameState.log,
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ru-RU'),
          round: gameState.round,
          type: 'system',
          message: `Инженер [${nextName}] присоединился к сессии Бункера.`,
        },
      ],
    });
    sound.playVoteCast();
  };

  // Reveal player card
  const handleRevealCard = (category: PlayerSlotCategory, extraSkillCardId?: string) => {
    if (!gameState) return;
    const myPlayer = gameState.players[0];
    if (!myPlayer) return;
    const revealedThisRound = gameState.revealedThisRoundPlayerIds || [];
    if (revealedThisRound.includes(myPlayer.id)) {
      showToast('В этом раунде вы уже раскрыли одну карту.');
      return;
    }

    const isExtraSkill = category === 'skills' && Boolean(extraSkillCardId);
    const card = isExtraSkill
      ? myPlayer.hand.extraSkills?.find((skill) => skill.card_id === extraSkillCardId)
      : myPlayer.hand[category];
    if (!card) return;

    const newlyRevealedBots: Array<{ memberId: string; category: PlayerSlotCategory }> = [];
    const updatedPlayers = gameState.players.map((player, index) => {
      if (index === 0) {
        if (isExtraSkill && extraSkillCardId) {
          return {
            ...player,
            hand: {
              ...player.hand,
              revealedExtraSkills: [...new Set([...(player.hand.revealedExtraSkills || []), extraSkillCardId])],
            },
          };
        }
        return { ...player, revealed: { ...player.revealed, [category]: true } };
      }
      if (gameState.isLocalDemo && (gameState.phase === 'reveal' || gameState.phase === 'briefing') && player.isAlive && player.isBot && !revealedThisRound.includes(player.id)) {
        const unrevealed = (['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'] as PlayerSlotCategory[])
          .filter((candidate) => !player.revealed[candidate]);
        if (unrevealed.length > 0) {
          const chosenCategory = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          newlyRevealedBots.push({ memberId: player.id, category: chosenCategory });
          return { ...player, revealed: { ...player.revealed, [chosenCategory]: true } };
        }
      }
      return player;
    });

    const newLog: GameLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: gameState.round,
      type: 'reveal',
      message: `Раскрыта характеристика [${card.category_name_ru}: ${card.original_title}]`,
      actorName: myPlayer.name,
      cardId: card.card_id,
    };
    const botLogs: GameLogEntry[] = newlyRevealedBots.map(({ memberId, category: openedCategory }) => {
      const bot = updatedPlayers.find((player) => player.id === memberId)!;
      const openedCard = bot.hand[openedCategory];
      return {
        id: `bot_reveal_${Date.now()}_${memberId}`,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        round: gameState.round,
        type: 'reveal',
        message: `Бот раскрыл карту [${openedCard.category_name_ru}: ${openedCard.original_title}]`,
        actorName: bot.name,
        cardId: openedCard.card_id,
      };
    });

    setGameState({
      ...gameState,
      players: updatedPlayers,
      revealedThisRoundPlayerIds: [...revealedThisRound, myPlayer.id, ...newlyRevealedBots.map((bot) => bot.memberId)],
      log: [...gameState.log, newLog, ...botLogs],
    });
    showToast('Карта раскрыта. Тестовые боты также раскрыли по одной карте.');
  };

  // Apply only action effects that have an explicit, implemented rule.
  const handleUseAction = () => {
    if (!gameState) return;
    const myPlayer = gameState.players[0];
    if (!myPlayer || !myPlayer.isAlive || myPlayer.actionUsed) return;
    if (['audit', 'gameover', 'lobby'].includes(gameState.phase)) return;

    const actionCard = myPlayer.hand.actions;
    if (actionCard.card_id === 'action_04') {
      const updatedPlayers = gameState.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              actionUsed: true,
              vulnerabilityDiscarded: true,
              revealed: { ...player.revealed, actions: true },
            }
          : player
      );
      const hotfixLog: GameLogEntry = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        round: gameState.round,
        type: 'action',
        message: 'Hotfix применён: собственная карта Уязвимости сброшена в отбой.',
        actorName: myPlayer.name,
        cardId: actionCard.card_id,
      };
      setGameState({ ...gameState, players: updatedPlayers, log: [...gameState.log, hotfixLog] });
      showToast('Hotfix применён. Ваша Уязвимость сброшена.');
      return;
    }
    if (actionCard.card_id === 'action_11') {
      const availableSkills = gameState.skillDeck ?? shuffleArray(CARDS_BY_CATEGORY.skills.filter((skill) =>
        !gameState.players.some((player) =>
          player.hand.skills.card_id === skill.card_id
          || (player.hand.extraSkills || []).some((extraSkill) => extraSkill.card_id === skill.card_id)
        )
      ));
      const additionalSkill = availableSkills[0];
      if (!additionalSkill) {
        showToast('Колода Навыков пуста. Эксплойт не был потрачен.');
        return;
      }

      const updatedPlayers = gameState.players.map((player, index) => index === 0
        ? {
            ...player,
            actionUsed: true,
            revealed: { ...player.revealed, actions: true },
            hand: {
              ...player.hand,
              extraSkills: [...(player.hand.extraSkills || []), additionalSkill],
            },
          }
        : player);
      const exploitLog: GameLogEntry = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        round: gameState.round,
        type: 'action',
        message: 'Эксплойт применён: в личный набор добавлена вторая карта Навыка.',
        actorName: myPlayer.name,
        cardId: actionCard.card_id,
      };
      setGameState({
        ...gameState,
        players: updatedPlayers,
        skillDeck: availableSkills.slice(1),
        log: [...gameState.log, exploitLog],
      });
      showToast('Эксплойт применён. Второй Навык добавлен в личную руку.');
      return;
    }

    if (actionCard.card_id !== 'action_28') {
      showToast('Эффект этой карты пока не автоматизирован. Карта не потрачена.');
      return;
    }

    const updatedPlayers = gameState.players.map((player, index) =>
      index === 0
        ? {
            ...player,
            actionUsed: true,
            revealed: { ...player.revealed, actions: true },
          }
        : player
    );

    const newCapacity = gameState.bunkerCapacity + 1;
    const newLog: GameLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: gameState.round,
      type: 'action',
      message: `Аварийный генератор активирован: вместимость Бункера увеличена с ${gameState.bunkerCapacity} до ${newCapacity} мест.`,
      actorName: myPlayer.name,
      cardId: actionCard.card_id,
    };

    setGameState({
      ...gameState,
      players: updatedPlayers,
      bunkerCapacity: newCapacity,
      log: [...gameState.log, newLog],
    });
    showToast('Аварийный генератор активирован. Вместимость увеличена на одно место.');
  };

  // Submit vote in voting phase
  const handleCastVote = (targetPlayerId: string) => {
    if (!gameState) return;
    const target = gameState.players.find((player) => player.id === targetPlayerId);
    if (!target) return;

    const alivePlayers = gameState.players.filter((player) => player.isAlive);
    const hostPlayer = gameState.players[0];
    const voteByPlayer = new Map<string, string>();
    voteByPlayer.set(hostPlayer.id, targetPlayerId);

    // Test bots cast one visible vote each; their choices are random test data, not official strategy.
    if (gameState.isLocalDemo) {
      alivePlayers.filter((player) => player.isBot).forEach((bot) => {
        const candidates = alivePlayers.filter((player) => player.id !== bot.id);
        if (candidates.length > 0) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          voteByPlayer.set(bot.id, chosen.id);
        }
      });
    }

    const voteCounts = new Map<string, number>();
    voteByPlayer.forEach((chosenId) => voteCounts.set(chosenId, (voteCounts.get(chosenId) || 0) + 1));
    const updatedPlayers = gameState.players.map((player) => ({
      ...player,
      votesReceived: voteCounts.get(player.id) || 0,
      votedForId: voteByPlayer.get(player.id) || null,
    }));
    const voteLogs: GameLogEntry[] = Array.from(voteByPlayer.entries()).map(([voterId, chosenId]) => {
      const voter = gameState.players.find((player) => player.id === voterId)!;
      const chosen = gameState.players.find((player) => player.id === chosenId)!;
      return {
        id: `vote_${Date.now()}_${voterId}`,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        round: gameState.round,
        type: 'vote',
        message: `Голос против [${chosen.name}]`,
        actorName: voter.name,
      };
    });

    setGameState({
      ...gameState,
      phase: 'elimination',
      players: updatedPlayers,
      log: [...gameState.log, ...voteLogs],
    });
  };

  // Execute elimination and advance round
  const handleConfirmElimination = () => {
    if (!gameState) return;

    // Find alive player with most votes
    const alive = gameState.players.filter(p => p.isAlive);
    let mostVoted = alive[0];
    alive.forEach(p => {
      if (p.votesReceived > mostVoted.votesReceived) {
        mostVoted = p;
      }
    });

    const nextRound = gameState.round + 1;
    const survivingAfterElimination = alive.filter(p => p.id !== mostVoted.id);

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === mostVoted.id) {
        return {
          ...p,
          isAlive: false,
          eliminatedInRound: gameState.round,
          votesReceived: 0,
        };
      }
      return {
        ...p,
        votesReceived: 0,
        votedForId: null,
      };
    });

    const eliminationLog: GameLogEntry = {
      id: `log_elim_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: gameState.round,
      type: 'elimination',
      message: `По результатам голосования Бункер покидает инженер [${mostVoted.name}] (Роль: ${mostVoted.hand.roles.original_title}).`,
      actorName: mostVoted.name,
    };

    // Check if we reached final audit (surviving players <= bunkerCapacity OR round >= 5)
    if (nextRound > 5 || survivingAfterElimination.length <= gameState.bunkerCapacity) {
      sound.playVictoryFanfare();
      setGameState({
        ...gameState,
        phase: 'audit',
        players: updatedPlayers,
        lastEliminatedPlayerId: mostVoted.id,
        log: [
          ...gameState.log,
          eliminationLog,
          {
            id: `log_audit_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('ru-RU'),
            round: gameState.round,
            type: 'audit',
            message: `Отбор завершен! Число специалистов соответствует вместимости Бункера (${survivingAfterElimination.length} чел.). Переход к аудиту по ГОСТ Р ИСО/МЭК 12207.`,
          },
        ],
      });
      showToast('Голосование окончено. Переход к плану восстановления по ГОСТ!');
      return;
    }

    // Add new crisis at Round 2 and Round 4 according to rules
    let newCrises = [...gameState.activeCrises];
    let nextCrisisDeck = [...gameState.crisisDeck];

    if ((nextRound === 2 || nextRound === 4) && nextCrisisDeck.length > 0) {
      const drawnCrisis = nextCrisisDeck[0];
      nextCrisisDeck = nextCrisisDeck.slice(1);
      newCrises.push(drawnCrisis);
      sound.playCrisisAlert();
    }

    setGameState({
      ...gameState,
      round: nextRound,
      phase: 'reveal',
      players: updatedPlayers,
      revealedThisRoundPlayerIds: [],
      activeCrises: newCrises,
      crisisDeck: nextCrisisDeck,
      lastEliminatedPlayerId: mostVoted.id,
      log: [
        ...gameState.log,
        eliminationLog,
        {
          id: `log_round_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ru-RU'),
          round: nextRound,
          type: 'system',
          message: `Начался Раунд ${nextRound}/5. Новые угрозы зафиксированы.`,
        },
      ],
    });
    showToast(`Начался Раунд ${nextRound}!`);
  };

  // Exit game
  const handleExitGame = () => {
    if (onlineRoom) {
      void handleExitOnlineRoom();
      return;
    }
    clearGameState();
    setGameState(null);
  };

  const handleExitCurrentRoom = () => {
    if (onlineRoom) {
      void handleExitOnlineRoom();
      return;
    }
    handleExitGame();
  };

  // Copy share invite link
  const handleCopyInvite = () => {
    if (!gameState) return;
    const url = window.location.href;
    navigator.clipboard.writeText(`Бункер МДК.04.01 // Код сессии: ${gameState.roomCode}\nПодключение: ${url}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    showToast('Приглашение скопировано в буфер обмена');
  };

  return (
    <div className="bunker-app min-h-screen flex flex-col">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenRules={() => setIsRulesOpen(true)}
        roomCode={onlineRoom?.inviteCode ?? gameState?.roomCode}
        isHost={onlineRoom
          ? onlineRoom.snapshot.players.some((player) => player.member_id === onlineRoom.memberId && player.technical_role === 'host')
          : gameState?.players[0]?.isHost}
        onExitGame={onlineRoom
          ? onlineRoom.snapshot.room.status === 'lobby' || onlineRoom.snapshot.room.status === 'archived' || onlineRoom.snapshot.room.status === 'finished' || onlineRoom.snapshot.room.room_mode === 'test' || onlineRoom.snapshot.players.some((player) => player.is_bot)
            ? handleExitCurrentRoom
            : undefined
          : gameState ? handleExitCurrentRoom : undefined}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="bunker-toast fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-200">
          <Info aria-hidden="true" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="bunker-main flex-1" id="main-content">
        {currentView === 'catalog' ? (
          <CardCatalogView onInspectCard={setInspectingCard} />
        ) : onlineRoom ? (
          ['in_progress', 'finished'].includes(onlineRoom.snapshot.room.status) ? (
            <OnlineGameView
              snapshot={onlineRoom.snapshot}
              myMemberId={onlineRoom.memberId}
              isHost={onlineRoom.snapshot.players.some((player) => player.member_id === onlineRoom.memberId && player.technical_role === 'host')}
              busy={onlineBusy}
              error={onlineError}
              connectionStatus={onlineConnectionStatus}
              onRefresh={handleRefreshOnlineRoom}
              onTakeover={handleTakeoverOnlineRoom}
              onExit={handleExitCurrentRoom}
              onInspectCard={setInspectingCard}
              onRevealCard={handleRevealOnlineCard}
              onUseActionCard={handleUseOnlineActionCard}
              onUseHotfixCard={handleUseOnlineHotfix}
              onUseActionEffect={handleUseOnlineActionEffect}
              onStartBriefing={handleStartBriefing}
              onOpenVoting={handleOpenVoting}
              onVote={handleSubmitOnlineVote}
              onResolveVote={handleResolveOnlineVote}
              onNextRound={handleAdvanceOnlineRound}
              onSubmitAuditPlan={handleSubmitOnlineAuditPlan}
              onFinishGame={handleFinishOnlineGame}
            />
          ) : (
            <OnlineRoomLobby
              snapshot={onlineRoom.snapshot}
              inviteCode={onlineRoom.snapshot.room.status === 'lobby' ? onlineRoom.inviteCode : undefined}
              isHost={onlineRoom.snapshot.players.some((player) => player.member_id === onlineRoom.memberId && player.technical_role === 'host')}
              busy={onlineBusy}
              error={onlineError}
              connectionStatus={onlineConnectionStatus}
              onRefresh={handleRefreshOnlineRoom}
              onTakeover={handleTakeoverOnlineRoom}
              onExit={handleExitCurrentRoom}
              onSaveSettings={handleSaveOnlineRoomSettings}
              onStartGame={handleStartOnlineGame}
              onAddTestBots={handleAddOnlineTestBots}
            />
          )
        ) : !gameState ? (
          /* ==============================================================
             SCREEN 1: LANDING & INCIDENT RESPONSE PORTAL
             ============================================================== */
          <div className="bunker-home">
            <section className="bunker-hero">
              <div className="bunker-hero-copy">
                <p className="bunker-eyebrow">МДК.04.01 · Онлайн-игра</p>
                <h1>ЦОД уничтожен<span>.</span></h1>
                <p className="bunker-hero-description">
                  Вирус «Zero-Day: Oblivion» вывел из строя основной кластер «НейроТех».
                  Остался резервный контур — DRP-Site. Мест в Бункере вдвое меньше, чем участников.
                </p>
                <a href="#game-entry" className="bunker-button bunker-button-primary bunker-hero-cta">
                  Играть <ArrowRight aria-hidden="true" />
                </a>
              </div>
              <aside className="bunker-game-facts" aria-label="Параметры игры">
                <div><strong>8–16</strong><span>игроков</span></div>
                <div><strong>5</strong><span>раундов</span></div>
                <div><strong>180</strong><span>карточек</span></div>
              </aside>
            </section>

            <section id="game-entry" className="bunker-section bunker-game-entry">
              <header className="bunker-section-heading">
                <div>
                  <p className="bunker-eyebrow">Начать партию</p>
                  <h2>Играть с друзьями</h2>
                </div>
                <p>Создай комнату и отправь код друзьям. Или введи код, который тебе прислали.</p>
              </header>

              <div className="bunker-name-field">
                <label htmlFor="engineer-call-sign">Твоё имя</label>
                <input
                  id="engineer-call-sign"
                  type="text"
                  value={currentUser.name}
                  onChange={(event) => {
                    const updated = { ...currentUser, name: event.target.value };
                    setCurrentUser(updated);
                    saveLocalUser(updated);
                  }}
                  maxLength={24}
                  placeholder="Как тебя показывать в игре?"
                  className="bunker-input"
                />
              </div>

              <div className="bunker-access-grid">
                <section className="bunker-panel bunker-access-panel">
                  <div>
                    <h3>Создать комнату</h3>
                    <p>Ты станешь ведущим и получишь код приглашения.</p>
                  </div>
                  <div className="bunker-room-create-options">
                    <button
                      type="button"
                      onClick={() => handleCreateOnlineRoom('players')}
                      disabled={onlineBusy || !isSupabaseConfigured || currentUser.name.trim().length < 2}
                      className="bunker-button bunker-button-primary"
                    >
                      <Plus aria-hidden="true" />
                      {onlineBusy ? 'Создаём…' : 'Обычная игра · люди'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateOnlineRoom('test')}
                      disabled={onlineBusy || !isSupabaseConfigured || currentUser.name.trim().length < 2}
                      className="bunker-button bunker-button-secondary"
                    >
                      <Users aria-hidden="true" />
                      {onlineBusy ? 'Создаём…' : 'Тест · люди + боты'}
                    </button>
                  </div>
                  <p className="bunker-help">
                    Обычная комната рассчитана на реальных участников. В тестовой можно добавить ботов, чтобы проверить полный игровой цикл вместе с друзьями.
                  </p>
                  {!isSupabaseConfigured && (
                    <p className="bunker-help">
                      Онлайн-режим пока не настроен. Для запуска нужно подключить Supabase.
                    </p>
                  )}
                </section>

                <section className="bunker-panel bunker-access-panel">
                  <div>
                    <h3>Присоединиться</h3>
                    <p>Введи код приглашения от ведущего.</p>
                  </div>
                  <label htmlFor="room-invite-code" className="bunker-visually-hidden">Код приглашения</label>
                  <input
                    id="room-invite-code"
                    type="text"
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32))}
                    maxLength={32}
                    placeholder="ABCDE"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="bunker-input bunker-code-input"
                  />
                  <button
                    type="button"
                    onClick={handleJoinOnlineRoom}
                    disabled={onlineBusy || !isSupabaseConfigured || !isValidOnlineInviteCode(roomCodeInput) || currentUser.name.trim().length < 2}
                    className="bunker-button bunker-button-secondary"
                  >
                    {onlineBusy ? 'Подключаемся…' : 'Войти в комнату'}
                    <ArrowRight aria-hidden="true" />
                  </button>
                </section>
              </div>

              {onlineError && <div role="alert" className="bunker-error">{onlineError}</div>}
              {savedRoomId && !onlineRoom && (
                <div className="bunker-panel bunker-access-panel" aria-live="polite">
                  <div>
                    <h3>Сохранённая комната</h3>
                    <p>В этом браузере осталась комната из предыдущего сеанса. Попробуйте восстановить подключение — код приглашения и данные комнаты сохранены. Очистка удалит только локальные данные, но не закроет комнату на сервере.</p>
                  </div>
                  <div className="bunker-room-create-options">
                    <button
                      type="button"
                      onClick={handleRestoreSavedOnlineRoom}
                      disabled={onlineBusy || !isSupabaseConfigured}
                      className="bunker-button bunker-button-primary"
                    >
                      <RefreshCw aria-hidden="true" />
                      {onlineBusy ? 'Подключаемся…' : 'Восстановить комнату'}
                    </button>
                    <button
                      type="button"
                      onClick={handleForgetSavedOnlineRoom}
                      disabled={onlineBusy}
                      className="bunker-button bunker-button-secondary"
                    >
                      Очистить данные на этом устройстве
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="bunker-section bunker-categories-section">
              <header className="bunker-section-heading">
                <div>
                  <p className="bunker-eyebrow">Состав колоды</p>
                  <h2>Карточки игры</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentView('catalog')}
                  className="bunker-text-button"
                >
                  Весь каталог <ArrowRight aria-hidden="true" />
                </button>
              </header>

              <div className="bunker-category-grid">
                {[
                  { name: 'Роли', description: 'Профессия и опыт участника', color: '#66816b' },
                  { name: 'Навыки', description: 'Знания и технические умения', color: '#718b78' },
                  { name: 'Багаж', description: 'Предметы и ресурсы', color: '#aa8258' },
                  { name: 'Уязвимости', description: 'Слабые стороны и риски', color: '#ac6a60' },
                  { name: 'Кризисы', description: 'Угрозы для бункера', color: '#8c789f' },
                  { name: 'Действия', description: 'Особые игровые эффекты', color: '#a38a54' },
                ].map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setCurrentView('catalog')}
                    className="bunker-category-card"
                    style={{ '--category-color': item.color } as React.CSSProperties}
                  >
                    <span className="bunker-category-dot" />
                    <span className="bunker-category-copy">
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="bunker-category-count">30</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : gameState.phase === 'lobby' ? (
          /* ==============================================================
             SCREEN 2: ROOM LOBBY
             ============================================================== */
          <div className="incident-page incident-local-room-page py-4 sm:py-8">
            {/* Room Info Banner */}
            <div className="rounded-2xl border border-cyan-500/40 bg-slate-900/90 p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono-tech bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    ЗАЛ ОЖИДАНИЯ // ЛОББИ
                  </span>
                  <span className="text-xs font-mono-tech text-slate-400">
                    МЕСТ В БУНКЕРЕ: <strong className="text-amber-400">{gameState.bunkerCapacity}</strong>
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-tactical font-bold text-white tracking-wide mt-1">
                  СЕССИЯ: {gameState.roomCode}
                </h2>
                <p className="text-xs font-mono-tech text-slate-400 mt-0.5">
                  Подключено инженеров: {gameState.players.length} из 16 максимум
                </p>
                {gameState.isLocalDemo !== false && (
                  <p className="mt-2 text-[10px] font-mono-tech uppercase tracking-wider text-amber-400">
                    ЛОКАЛЬНЫЙ ТЕСТ / БОТЫ / ДРУГИЕ УСТРОЙСТВА НЕ ПОДКЛЮЧАЮТСЯ
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyInvite}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-tactical uppercase tracking-wider flex items-center gap-2 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'СКОПИРОВАНО' : 'ПРИГЛАСИТЬ'}</span>
                </button>

                <button
                  onClick={handleAddTestEngineer}
                  disabled={gameState.players.length >= 16}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-tactical uppercase tracking-wider flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <span>ДОБАВИТЬ ИНЖЕНЕРА</span>
                </button>

                <button
                  onClick={handleStartGame}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-tactical font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/50 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>НАЧАТЬ ИГРУ</span>
                </button>
              </div>
            </div>

            {/* Participants Grid */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
              <h3 className="text-sm font-tactical font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>ЗАРЕГИСТРИРОВАННЫЕ СПЕЦИАЛИСТЫ ({gameState.players.length})</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {gameState.players.map((p, idx) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center font-tactical font-bold text-sky-300 text-sm">
                        {p.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-tactical font-bold text-slate-100 truncate">
                          {p.name}
                        </div>
                        <div className="text-[10px] font-mono-tech text-slate-400">
                          {p.isHost ? 'Ведущий сессии' : 'Участник'}
                        </div>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[9px] font-mono-tech bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      ГОТОВ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : gameState.phase === 'audit' ? (
          /* ==============================================================
             SCREEN 5: FINAL AUDIT PHASE
             ============================================================== */
          <FinalAuditView
            survivingPlayers={gameState.players.filter(p => p.isAlive)}
            activeCrises={gameState.activeCrises}
            onRestartGame={handleExitGame}
          />
        ) : (
          /* ==============================================================
             SCREEN 3 & 4: MAIN TACTICAL COMMAND GAME TABLE
             ============================================================== */
          <div className="bunker-game-board">
            {/* Раунд и текущий этап */}
            <section className="bunker-round-header" aria-label="Текущий раунд и этап игры">
              <div className="bunker-round-summary">
                <div className="bunker-round-number">
                  <span>Раунд</span>
                  <strong>{gameState.round}<small> / 5</small></strong>
                </div>
                <div className="bunker-phase-detail">
                  <span>Текущий этап</span>
                  <strong>
                    {gameState.phase === 'reveal' && 'Вскрытие карт'}
                    {gameState.phase === 'briefing' && 'Обсуждение'}
                    {gameState.phase === 'voting' && 'Голосование'}
                    {gameState.phase === 'elimination' && 'Итоги голосования'}
                  </strong>
                </div>
                <div className="bunker-capacity-detail">
                  <span>Мест в Бункере</span>
                  <strong>{gameState.bunkerCapacity}</strong>
                </div>
                {gameState.isLocalDemo !== false && (
                  <span className="bunker-demo-label">{gameState.isOnlineBotTest ? 'ТЕСТ С БОТАМИ · СОСТОЯНИЕ НА ЭТОМ УСТРОЙСТВЕ' : 'Локальный тест с ботами'}</span>
                )}
              </div>

              <div className="bunker-round-actions">
                {gameState.phase === 'reveal' && (
                  <button type="button" onClick={() => {
                    setGameState({ ...gameState, phase: 'briefing' });
                    sound.playCrisisAlert();
                    showToast('Фаза брифинга: включите таймер и начните обсуждение.');
                  }} className="bunker-game-action">
                    К обсуждению <ArrowRight aria-hidden="true" />
                  </button>
                )}
                {gameState.phase === 'briefing' && (
                  <button type="button" onClick={() => {
                    setIsVotingOpen(true);
                    setGameState({ ...gameState, phase: 'voting' });
                    sound.playVoteCast();
                  }} className="bunker-game-action is-danger">
                    <Vote aria-hidden="true" /> Открыть голосование
                  </button>
                )}
                {gameState.phase === 'voting' && (
                  <button type="button" onClick={() => setIsVotingOpen(true)} className="bunker-game-action is-danger">
                    <Vote aria-hidden="true" /> Отдать голос
                  </button>
                )}
                {gameState.phase === 'elimination' && (
                  <button type="button" onClick={handleConfirmElimination} className="bunker-game-action">
                    Следующий раунд <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>

            {/* Игровой стол: кризисы и игроки, таймер и хроника */}
            <div className="bunker-table-layout">
              <div className="bunker-table-main">
                <ActiveCrisesBanner
                  crises={gameState.activeCrises}
                  currentRound={gameState.round}
                  onInspectCrisis={setInspectingCard}
                />
                <PlayerRoster
                  players={gameState.players}
                  activeSpeakerId={gameState.activeSpeakerId}
                  currentPhase={gameState.phase}
                  myPlayerId={gameState.players[0]?.id}
                  onSelectSpeaker={(id) => setGameState({ ...gameState, activeSpeakerId: id })}
                  onInspectCard={setInspectingCard}
                />
              </div>

              <aside className="bunker-table-sidebar" aria-label="Инструменты раунда">
                <BriefingTimer
                  initialSeconds={60}
                  activeSpeakerName={gameState.players.find((player) => player.id === gameState.activeSpeakerId)?.name}
                />
                <IncidentLog logs={gameState.log} />
              </aside>
            </div>

            {/* Bottom Section: My Personal Hand (5 Cards) */}
            {gameState.players[0] && (
              <PersonalHand
                player={gameState.players[0]}
                currentPhase={gameState.phase}
                onRevealCard={handleRevealCard}
                onUseAction={handleUseAction}
                onInspectCard={setInspectingCard}
                hasRevealedThisRound={(gameState.revealedThisRoundPlayerIds || []).includes(gameState.players[0].id)}
              />
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {inspectingCard && (
        <CardInspectModal
          card={inspectingCard}
          onClose={() => setInspectingCard(null)}
        />
      )}

      {isRulesOpen && (
        <GameRulesModal onClose={() => setIsRulesOpen(false)} />
      )}

      {isVotingOpen && gameState && (
        <VotingModal
          players={gameState.players}
          myPlayerId={gameState.players[0]?.id}
          round={gameState.round}
          onCastVote={handleCastVote}
          onClose={() => setIsVotingOpen(false)}
        />
      )}
    </div>
  );
}
