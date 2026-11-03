import React, { useState, useEffect } from 'react';
import { 
  GameState, 
  Player, 
  Card, 
  PlayerSlotCategory, 
  GameLogEntry, 
  GamePhase 
} from './types/game';
import { 
  ALL_CARDS, 
  dealNewGame, 
  shuffleArray, 
  CARDS_BY_CATEGORY 
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
import {
  createOnlineRoom,
  joinOnlineRoom,
  getOnlineRoomSnapshot,
  subscribeToOnlineRoom,
  leaveOnlineRoom,
  closeOnlineRoom,
  RoomSnapshot,
} from './services/onlineRooms';
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

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(() => loadGameState());
  const [currentUser, setCurrentUser] = useState(() => loadLocalUser());
  const [currentView, setCurrentView] = useState<'game' | 'catalog'>('game');
  const [inspectingCard, setInspectingCard] = useState<Card | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSession | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);


  // Restore the last online room after a page refresh, using the persisted Supabase Auth session.
  useEffect(() => {
    const savedRoomId = localStorage.getItem(ONLINE_ROOM_STORAGE_KEY);
    if (!savedRoomId) return;

    let cancelled = false;
    void getOnlineRoomSnapshot(savedRoomId)
      .then((snapshot) => {
        if (cancelled) return;
        setOnlineRoom({
          roomId: savedRoomId,
          memberId: snapshot.my_member_id,
          inviteCode: sessionStorage.getItem(ONLINE_INVITE_STORAGE_KEY) || undefined,
          snapshot,
        });
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
          sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
        }
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

    void subscribeToOnlineRoom(onlineRoom.roomId, () => {
      void getOnlineRoomSnapshot(onlineRoom.roomId)
        .then((snapshot) => {
          if (cancelled) return;
          if (snapshot.room.status === 'archived') {
            localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
            sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
            setOnlineRoom(null);
            showToast('Комната закрыта создателем.');
            return;
          }
          setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
            ? { ...current, snapshot }
            : current);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setOnlineError(error instanceof Error ? error.message : 'Не удалось обновить комнату.');
          }
        });
    })
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOnlineError(error instanceof Error ? error.message : 'Не удалось подключить обновления комнаты.');
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
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


  const handleCreateOnlineRoom = async () => {
    const displayName = currentUser.name.trim();
    if (displayName.length < 2 || displayName.length > 24) {
      setOnlineError('Позывной должен содержать от 2 до 24 символов.');
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const result = await createOnlineRoom(displayName);
      localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, result.room_id);
      if (result.invite_code) {
        sessionStorage.setItem(ONLINE_INVITE_STORAGE_KEY, result.invite_code);
      }

      const snapshot = await getOnlineRoomSnapshot(result.room_id);
      setOnlineRoom({
        roomId: result.room_id,
        memberId: result.member_id,
        inviteCode: result.invite_code,
        snapshot,
      });
      setGameState(null);
      clearGameState();
      sound.playCrisisAlert();
    } catch (error: unknown) {
      setOnlineError(error instanceof Error ? error.message : 'Не удалось создать онлайн-комнату.');
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
    if (!/^[0-9A-F]{32}$/.test(inviteCode)) {
      setOnlineError('Код комнаты должен состоять из 32 символов A–F и 0–9.');
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const result = await joinOnlineRoom(inviteCode, displayName);
      localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, result.room_id);
      sessionStorage.setItem(ONLINE_INVITE_STORAGE_KEY, inviteCode);

      const snapshot = await getOnlineRoomSnapshot(result.room_id);
      setOnlineRoom({
        roomId: result.room_id,
        memberId: result.member_id,
        inviteCode,
        snapshot,
      });
      setGameState(null);
      clearGameState();
    } catch (error: unknown) {
      setOnlineError(error instanceof Error ? error.message : 'Не удалось подключиться к комнате.');
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
        localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
        sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
        setOnlineRoom(null);
        showToast('Комната уже закрыта создателем.');
        return;
      }
      setOnlineRoom((current) => current?.roomId === onlineRoom.roomId
        ? { ...current, snapshot }
        : current);
    } catch (error: unknown) {
      setOnlineError(error instanceof Error ? error.message : 'Не удалось обновить комнату.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleExitOnlineRoom = async () => {
    if (!onlineRoom) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const ownMember = onlineRoom.snapshot.players.find(
        (player) => player.member_id === onlineRoom.memberId
      );
      if (ownMember?.technical_role === 'host' && onlineRoom.snapshot.room.status === 'lobby') {
        await closeOnlineRoom(onlineRoom.roomId);
      } else {
        await leaveOnlineRoom(onlineRoom.roomId);
      }

      localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
      sessionStorage.removeItem(ONLINE_INVITE_STORAGE_KEY);
      setOnlineRoom(null);
      showToast(ownMember?.technical_role === 'host' ? 'Комната закрыта.' : 'Вы покинули комнату.');
    } catch (error: unknown) {
      setOnlineError(error instanceof Error ? error.message : 'Не удалось выйти из комнаты.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleExitCurrentRoom = () => {
    if (onlineRoom) {
      void handleExitOnlineRoom();
      return;
    }
    handleExitGame();
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
      roomCode,
      hostId: deal.players[0].id,
      round: 1,
      maxRounds: 5,
      phase: 'lobby',
      players: deal.players,
      activeCrises: deal.activeCrises,
      crisisDeck: deal.crisisDeck,
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
      roomCode,
      hostId: deal.players[0].id,
      round: 1,
      maxRounds: 5,
      phase: 'lobby',
      players: deal.players,
      activeCrises: deal.activeCrises,
      crisisDeck: deal.crisisDeck,
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

    const newPlayer: Player = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: nextName,
      isHost: false,
      isReady: true,
      isAlive: true,
      avatarSeed: `eng_${gameState.players.length + 1}`,
      hand: {
        roles: shuffledRoles[0],
        skills: shuffledSkills[0],
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

    setGameState({
      ...gameState,
      players: newPlayers,
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
  const handleRevealCard = (category: PlayerSlotCategory) => {
    if (!gameState) return;
    const myPlayer = gameState.players[0]; // Host or current player
    if (!myPlayer) return;

    const card = myPlayer.hand[category];

    const updatedPlayers = gameState.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          revealed: {
            ...p.revealed,
            [category]: true,
          },
        };
      }
      // Simulate bots revealing a card in the round too
      if (gameState.phase === 'reveal' && !p.revealed[category]) {
        // Pick an unrevealed category for bot
        const unrevealed = (['roles', 'skills', 'baggage', 'vulnerabilities', 'actions'] as PlayerSlotCategory[])
          .filter(c => !p.revealed[c]);
        const pickCat = unrevealed[0] || category;
        return {
          ...p,
          revealed: {
            ...p.revealed,
            [pickCat]: true,
          },
        };
      }
      return p;
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

    setGameState({
      ...gameState,
      players: updatedPlayers,
      log: [...gameState.log, newLog],
    });
    showToast(`Карта «${card.original_title}» раскрыта для всех инженеров`);
  };

  // Trigger special Action card
  const handleUseAction = () => {
    if (!gameState) return;
    const myPlayer = gameState.players[0];
    if (!myPlayer || myPlayer.actionUsed) return;

    const actionCard = myPlayer.hand.actions;

    const updatedPlayers = gameState.players.map((p, idx) => {
      if (idx === 0) {
        return { ...p, actionUsed: true };
      }
      return p;
    });

    const newLog: GameLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: gameState.round,
      type: 'action',
      message: `Применено действие [${actionCard.original_title}]: ${actionCard.source_description}`,
      actorName: myPlayer.name,
      cardId: actionCard.card_id,
    };

    setGameState({
      ...gameState,
      players: updatedPlayers,
      log: [...gameState.log, newLog],
    });
    showToast(`Действие «${actionCard.original_title}» активировано`);
  };

  // Submit vote in voting phase
  const handleCastVote = (targetPlayerId: string) => {
    if (!gameState) return;
    const target = gameState.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    // Distribute simulated votes among other players for realistic team dynamics
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    const updatedPlayers = gameState.players.map((p) => {
      let votes = 0;
      if (p.id === targetPlayerId) {
        votes += 1; // My vote
      }
      // Add a couple bot votes realistically
      if (Math.random() > 0.4 && p.id !== gameState.players[0].id) {
        votes += Math.floor(Math.random() * 2);
      }
      return {
        ...p,
        votesReceived: votes,
      };
    });

    const newLog: GameLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      round: gameState.round,
      type: 'vote',
      message: `Голос отдан против кандидата [${target.name}]`,
      actorName: gameState.players[0].name,
    };

    setGameState({
      ...gameState,
      phase: 'elimination',
      players: updatedPlayers,
      log: [...gameState.log, newLog],
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
    clearGameState();
    setGameState(null);
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
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenRules={() => setIsRulesOpen(true)}
        roomCode={onlineRoom?.inviteCode ?? gameState?.roomCode}
        isHost={onlineRoom
          ? onlineRoom.snapshot.players.some((player) => player.member_id === onlineRoom.memberId && player.technical_role === 'host')
          : gameState?.players[0]?.isHost}
        onExitGame={onlineRoom || gameState ? handleExitCurrentRoom : undefined}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/50 text-cyan-200 text-xs font-mono-tech shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentView === 'catalog' ? (
          <CardCatalogView onInspectCard={setInspectingCard} />
        ) : onlineRoom ? (
          <OnlineRoomLobby
            snapshot={onlineRoom.snapshot}
            inviteCode={onlineRoom.snapshot.room.status === 'lobby' ? onlineRoom.inviteCode : undefined}
            isHost={onlineRoom.snapshot.players.some((player) => player.member_id === onlineRoom.memberId && player.technical_role === 'host')}
            busy={onlineBusy}
            error={onlineError}
            onRefresh={handleRefreshOnlineRoom}
            onExit={handleExitCurrentRoom}
          />
        ) : !gameState ? (
          /* ==============================================================
             SCREEN 1: LANDING & INCIDENT RESPONSE PORTAL
             ============================================================== */
          <div className="space-y-8 animate-in fade-in duration-300 py-4 sm:py-8">
            {/* Incident Alert Hero */}
            <div className="relative rounded-3xl border border-rose-500/40 bg-gradient-to-b from-rose-950/40 via-slate-900 to-slate-950 p-6 sm:p-10 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-tactical-grid opacity-25 pointer-events-none" />
              
              <div className="relative z-10 max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono-tech uppercase tracking-wider">
                  <Flame className="w-3.5 h-3.5 animate-pulse" />
                  <span>ТРЕВОГА // КАТАСТРОФА ДАТА-ЦЕНТРА 2036</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-tactical font-bold text-white tracking-tight leading-tight">
                  БУНКЕР // МДК.04.01
                </h1>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-sans">
                  Вирус <strong className="text-rose-400 font-mono-tech">«Zero-Day: Oblivion»</strong> уничтожил центральный кластер корпорации «НейроТех». 
                  Для холодного пуска аварийного дата-центра в изолированном Резервном Серверном Бункере (DRP-Site) 
                  требуется сформировать команду специалистов по ГОСТ Р ИСО/МЭК 12207. 
                  Ресурсы жизнеобеспечения ограничены: <strong className="text-amber-400">мест вдвое меньше, чем инженеров!</strong>
                </p>

                {/* Name Input */}
                <div className="pt-2 max-w-md">
                  <label className="block text-xs font-mono-tech uppercase text-slate-400 mb-1.5">
                    Позывной инженера:
                  </label>
                  <input
                    type="text"
                    value={currentUser.name}
                    onChange={(e) => {
                      const updated = { ...currentUser, name: e.target.value };
                      setCurrentUser(updated);
                      saveLocalUser(updated);
                    }}
                    maxLength={24}
                    placeholder="Введите ваше имя или позывной..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono-tech transition-colors shadow-inner"
                  />
                </div>

                {/* Primary Action Buttons */}
                <div className="pt-4 flex flex-wrap items-center gap-3.5">
                  <button
                    onClick={handleCreateOnlineRoom}
                    disabled={onlineBusy || !isSupabaseConfigured || currentUser.name.trim().length < 2}
                    className="px-6 py-3 border border-amber-500 bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed font-tactical font-bold text-sm uppercase tracking-wider transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{onlineBusy ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ ОНЛАЙН-КОМНАТУ'}</span>
                  </button>

                  <button
                    onClick={handleLaunchSimulation}
                    className="px-5 py-3 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-tactical text-xs uppercase tracking-wider transition-colors flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>ЛОКАЛЬНАЯ ДЕМО-СИМУЛЯЦИЯ</span>
                  </button>

                  <button
                    onClick={handleCreateRoom}
                    className="px-4 py-3 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 font-tactical text-xs uppercase tracking-wider transition-colors"
                    title="Создаёт локальную комнату с тестовыми инженерами, без подключения других устройств"
                  >
                    <span>ЛОКАЛЬНЫЙ ТЕСТ С БОТАМИ</span>
                  </button>

                  <button
                    onClick={() => setIsRulesOpen(true)}
                    className="px-4 py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-amber-500/30 font-tactical text-xs uppercase tracking-wider transition-colors"
                  >
                    РЕГЛАМЕНТ И ПРАВИЛА
                  </button>
                </div>

                <div className="mt-4 max-w-xl grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 32))}
                    maxLength={32}
                    placeholder="КОД КОМНАТЫ · 32 СИМВОЛА"
                    aria-label="Код онлайн-комнаты"
                    className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-mono-tech"
                  />
                  <button
                    type="button"
                    onClick={handleJoinOnlineRoom}
                    disabled={onlineBusy || !isSupabaseConfigured || roomCodeInput.trim().length !== 16 || currentUser.name.trim().length < 2}
                    className="px-5 py-2.5 border border-slate-600 text-slate-100 hover:border-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-tactical uppercase tracking-wider"
                  >
                    ПОДКЛЮЧИТЬСЯ
                  </button>
                </div>
                {!isSupabaseConfigured && (
                  <p className="mt-2 text-xs text-slate-500">
                    Онлайн-комнаты включатся после настройки VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Инструкция: docs/05_Supabase_Setup.md.
                  </p>
                )}
                {onlineError && (
                  <p role="alert" className="mt-2 text-xs text-rose-300">
                    {onlineError}
                  </p>
                )}
              </div>
            </div>

            {/* 6 Categories Overview Cards */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-tactical font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-400" />
                    <span>СТРУКТУРА КОМПЛЕКТА // 180 КАРТ В 6 КАТЕГОРИЯХ</span>
                  </h3>
                  <p className="text-xs font-mono-tech text-slate-400">
                    Каждому инженеру выдается по 1 карте из 5 категорий; Кризисы выкладываются на общий игровой стол
                  </p>
                </div>

                <button
                  onClick={() => setCurrentView('catalog')}
                  className="text-xs font-mono-tech text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                >
                  <span>Открыть весь каталог</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { name: 'Роли', color: 'Синий', count: 30, border: 'border-sky-500/50', bg: 'bg-sky-950/40', text: 'text-sky-400', desc: 'Специализация в ЦОД' },
                  { name: 'Навыки', color: 'Зелёный', count: 30, border: 'border-emerald-500/50', bg: 'bg-emerald-950/40', text: 'text-emerald-400', desc: 'Компетенции и ГОСТ' },
                  { name: 'Багаж', color: 'Оранжевый', count: 30, border: 'border-orange-500/50', bg: 'bg-orange-950/40', text: 'text-orange-400', desc: 'Оборудование и бэкапы' },
                  { name: 'Уязвимости', color: 'Алый', count: 30, border: 'border-rose-500/50', bg: 'bg-rose-950/40', text: 'text-rose-400', desc: 'Факторы риска' },
                  { name: 'Кризисы', color: 'Фиолетовый', count: 30, border: 'border-purple-500/50', bg: 'bg-purple-950/40', text: 'text-purple-400', desc: 'Аварии оборудования' },
                  { name: 'Действия', color: 'Золотой', count: 30, border: 'border-amber-500/50', bg: 'bg-amber-950/40', text: 'text-amber-400', desc: 'Привилегии и вето' },
                ].map((item) => (
                  <div
                    key={item.name}
                    onClick={() => setCurrentView('catalog')}
                    className={`p-3.5 rounded-xl border ${item.border} ${item.bg} hover:brightness-125 transition-all cursor-pointer`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-mono-tech font-bold uppercase ${item.text}`}>
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono-tech text-slate-400">
                        {item.count}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono-tech text-slate-400">
                      Цвет: {item.color}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 line-clamp-1">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : gameState.phase === 'lobby' ? (
          /* ==============================================================
             SCREEN 2: ROOM LOBBY
             ============================================================== */
          <div className="space-y-6 animate-in fade-in duration-300">
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
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Tactical Status Bar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono-tech text-slate-400">РАУНД:</span>
                  <span className="text-sm font-mono-tech font-bold text-amber-400">
                    {gameState.round}/5
                  </span>
                </div>

                <div className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                  <span className="text-xs font-mono-tech text-slate-400">ТЕКУЩАЯ ФАЗА:</span>
                  <span className="text-xs font-tactical font-bold text-cyan-300 uppercase">
                    {gameState.phase === 'reveal' && '1. Вскрытие характеристик'}
                    {gameState.phase === 'briefing' && '2. Технический брифинг'}
                    {gameState.phase === 'voting' && '3. Открытое голосование'}
                    {gameState.phase === 'elimination' && '4. Протокол изгнания'}
                  </span>
                </div>

                <div className="hidden sm:flex px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 items-center gap-2">
                  <span className="text-xs font-mono-tech text-slate-400">МЕСТ В БУНКЕРЕ:</span>
                  <span className="text-xs font-mono-tech font-bold text-emerald-400">
                    {gameState.bunkerCapacity}
                  </span>
                </div>
              </div>

              {/* Phase Progression Controller */}
              <div className="flex items-center gap-2">
                {gameState.phase === 'reveal' && (
                  <button
                    onClick={() => {
                      setGameState({ ...gameState, phase: 'briefing' });
                      sound.playCrisisAlert();
                      showToast('Фаза брифинга: включите 60-секундный таймер и начните аргументацию');
                    }}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                  >
                    <span>ПЕРЕЙТИ К БРИФИНГУ</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {gameState.phase === 'briefing' && (
                  <button
                    onClick={() => {
                      setIsVotingOpen(true);
                      setGameState({ ...gameState, phase: 'voting' });
                      sound.playVoteCast();
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                  >
                    <Vote className="w-4 h-4" />
                    <span>ОТКРЫТЬ ГОЛОСОВАНИЕ</span>
                  </button>
                )}

                {gameState.phase === 'voting' && (
                  <button
                    onClick={() => setIsVotingOpen(true)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                  >
                    <Vote className="w-4 h-4" />
                    <span>ОТДАТЬ ГОЛОС</span>
                  </button>
                )}

                {gameState.phase === 'elimination' && (
                  <button
                    onClick={handleConfirmElimination}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                  >
                    <span>УТВЕРДИТЬ ИЗГНАНИЕ И СЛЕДУЮЩИЙ РАУНД</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Active Crises Section */}
            <ActiveCrisesBanner
              crises={gameState.activeCrises}
              currentRound={gameState.round}
              onInspectCrisis={setInspectingCard}
            />

            {/* Middle Section: Briefing Timer & Team Roster */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1 space-y-5">
                {/* 60s / 30s Tactical Briefing Timer */}
                <BriefingTimer
                  initialSeconds={60}
                  activeSpeakerName={gameState.players.find(p => p.id === gameState.activeSpeakerId)?.name}
                />

                {/* System Incident Terminal Log */}
                <IncidentLog logs={gameState.log} />
              </div>

              {/* Team Composition & Revealed Cards Matrix */}
              <div className="lg:col-span-2">
                <PlayerRoster
                  players={gameState.players}
                  activeSpeakerId={gameState.activeSpeakerId}
                  currentPhase={gameState.phase}
                  myPlayerId={gameState.players[0]?.id}
                  onSelectSpeaker={(id) => setGameState({ ...gameState, activeSpeakerId: id })}
                  onInspectCard={setInspectingCard}
                />
              </div>
            </div>

            {/* Bottom Section: My Personal Hand (5 Cards) */}
            {gameState.players[0] && (
              <PersonalHand
                player={gameState.players[0]}
                currentPhase={gameState.phase}
                onRevealCard={handleRevealCard}
                onUseAction={handleUseAction}
                onInspectCard={setInspectingCard}
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
