import manifestData from '../../assets/manifest.json';
import { Card, CardCategory, Player, PlayerHand, PlayerRevealedState, RecoveryPlanStep } from '../types/game';

export const ALL_CARDS: Card[] = (manifestData as any).assets as Card[];

export const CARDS_BY_ID: Record<string, Card> = {};
export const CARDS_BY_CATEGORY: Record<CardCategory, Card[]> = {
  roles: [],
  skills: [],
  baggage: [],
  vulnerabilities: [],
  crises: [],
  actions: [],
};

ALL_CARDS.forEach((card) => {
  CARDS_BY_ID[card.card_id] = card;
  if (CARDS_BY_CATEGORY[card.category]) {
    CARDS_BY_CATEGORY[card.category].push(card);
  }
});

export interface CategoryMetadata {
  nameRu: string;
  colorName: string;
  accentHex: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  badgeClass: string;
  description: string;
  iconName: string;
}

export const CATEGORY_CONFIG: Record<CardCategory, CategoryMetadata> = {
  roles: {
    nameRu: 'Роли',
    colorName: 'Синий',
    accentHex: '#38bdf8',
    accentBg: 'bg-sky-950/60',
    accentBorder: 'border-sky-500/60',
    accentText: 'text-sky-400',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: 'Инженерная специализация и ключевая зона ответственности в DRP-комплексе',
    iconName: 'UserCheck',
  },
  skills: {
    nameRu: 'Навыки',
    colorName: 'Зелёный',
    accentHex: '#34d399',
    accentBg: 'bg-emerald-950/60',
    accentBorder: 'border-emerald-500/60',
    accentText: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Подтверждённая практическая компетенция и технологические сертификаты',
    iconName: 'Cpu',
  },
  baggage: {
    nameRu: 'Багаж',
    colorName: 'Оранжевый',
    accentHex: '#fb923c',
    accentBg: 'bg-orange-950/60',
    accentBorder: 'border-orange-500/60',
    accentText: 'text-orange-400',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    description: 'Материальное оснащение, инструменты, золотые бэкапы и резервные контроллеры',
    iconName: 'Briefcase',
  },
  vulnerabilities: {
    nameRu: 'Уязвимости',
    colorName: 'Алый',
    accentHex: '#f87171',
    accentBg: 'bg-rose-950/60',
    accentBorder: 'border-rose-500/60',
    accentText: 'text-rose-400',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Критический личностный или профессиональный фактор риска в изоляции',
    iconName: 'AlertTriangle',
  },
  crises: {
    nameRu: 'Кризисы',
    colorName: 'Фиолетовый',
    accentHex: '#c084fc',
    accentBg: 'bg-purple-950/60',
    accentBorder: 'border-purple-500/60',
    accentText: 'text-purple-400',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Аварийные сбои инфраструктуры Бункера и атаки «Zero-Day: Oblivion»',
    iconName: 'Flame',
  },
  actions: {
    nameRu: 'Действия',
    colorName: 'Золотой',
    accentHex: '#fbbf24',
    accentBg: 'bg-amber-950/60',
    accentBorder: 'border-amber-500/60',
    accentText: 'text-amber-400',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Разовые административные привилегии, перехваты, вето и системные костыли',
    iconName: 'Zap',
  },
};

/**
 * Returns clean web-accessible image path with URI encoding
 */
export function getCardImagePath(card: Card | undefined | null): string {
  if (!card) return '';
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const cleanRelative = card.relative_path.replace(/^\/+/, '');
  return `${prefix}${encodeURI(cleanRelative)}`;
}

/**
 * Shuffle array using Fisher-Yates
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates initial deal of 5 cards per engineer and crisis deck
 */
export function dealNewGame(playerNames: string[]): {
  players: Player[];
  activeCrises: Card[];
  crisisDeck: Card[];
  bunkerCapacity: number;
  skillDeck: Card[];
} {
  const shuffledRoles = shuffleArray(CARDS_BY_CATEGORY.roles);
  const shuffledSkills = shuffleArray(CARDS_BY_CATEGORY.skills);
  const shuffledBaggage = shuffleArray(CARDS_BY_CATEGORY.baggage);
  const shuffledVulns = shuffleArray(CARDS_BY_CATEGORY.vulnerabilities);
  const shuffledActions = shuffleArray(CARDS_BY_CATEGORY.actions);
  const shuffledCrises = shuffleArray(CARDS_BY_CATEGORY.crises);

  const players: Player[] = playerNames.map((name, index) => {
    const hand: PlayerHand = {
      roles: shuffledRoles[index % shuffledRoles.length],
      skills: shuffledSkills[index % shuffledSkills.length],
      baggage: shuffledBaggage[index % shuffledBaggage.length],
      vulnerabilities: shuffledVulns[index % shuffledVulns.length],
      actions: shuffledActions[index % shuffledActions.length],
    };

    const revealed: PlayerRevealedState = {
      roles: false,
      skills: false,
      baggage: false,
      vulnerabilities: false,
      actions: false,
    };

    return {
      id: `p_${Date.now()}_${index}`,
      name,
      isHost: index === 0,
      isReady: true,
      isAlive: true,
      avatarSeed: `eng_${index + 1}`,
      hand,
      revealed,
      actionUsed: false,
      votesReceived: 0,
      votedForId: null,
    };
  });

  // Calculate bunker capacity: according to rule passport "мест вдвое меньше, чем участников"
  const capacity = Math.max(2, Math.floor(players.length / 2));

  // Round 1 starts with 1 crisis; remaining crises are in crisisDeck
  const activeCrises: Card[] = [shuffledCrises[0]];
  const crisisDeck: Card[] = shuffledCrises.slice(1);

  return {
    players,
    activeCrises,
    crisisDeck,
    bunkerCapacity: capacity,
    skillDeck: shuffledSkills.slice(playerNames.length),
  };
}

export const INITIAL_RECOVERY_STEPS: RecoveryPlanStep[] = [
  {
    id: 'step_1',
    gostPhase: 'ГОСТ 12207: Процесс анализа инцидента',
    title: 'Локализация вектора атаки «Oblivion» и изоляция шины управления',
    solutionNotes: '',
    verified: false,
  },
  {
    id: 'step_2',
    gostPhase: 'ГОСТ 12207: Процесс развертывания инфраструктуры',
    title: 'Холодный пуск аварийных генераторов, стабилизация ИБП и микроклимата ЦОД',
    solutionNotes: '',
    verified: false,
  },
  {
    id: 'step_3',
    gostPhase: 'ГОСТ 12207: Процесс восстановления данных',
    title: 'Реанимация дисковых полок SAN/iSCSI, сборка RAID и проверка контрольных сумм LTO-ленты',
    solutionNotes: '',
    verified: false,
  },
  {
    id: 'step_4',
    gostPhase: 'ГОСТ 12207: Процесс развертывания платформ',
    title: 'Восстановление гипервизоров Type-1 и развертывание чистых базовых OVA-шаблонов',
    solutionNotes: '',
    verified: false,
  },
  {
    id: 'step_5',
    gostPhase: 'ГОСТ 12207: Процесс поддержки служб каталога',
    title: 'Репликация домена Active Directory, восстановление DNS/DHCP и сертификатов безопасности',
    solutionNotes: '',
    verified: false,
  },
  {
    id: 'step_6',
    gostPhase: 'ГОСТ 34: Приемо-сдаточные испытания (ПСИ)',
    title: 'Проведение ПСИ по программе и методике испытаний (ПМИ), подписание Акта готовности Бункера',
    solutionNotes: '',
    verified: false,
  },
];
