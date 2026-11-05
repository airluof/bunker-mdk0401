import type { Card, CardCategory } from '../types/game';
import { ALL_CARDS, CARDS_BY_ID, CATEGORY_CONFIG } from './cards';

type CardId = string;
type ActionReviewStatus = 'ready' | 'needs-rule' | 'blocked';

interface CrisisRelations {
  crisisId: CardId;
  roles: CardId[];
  skills: CardId[];
  baggage: CardId[];
}

interface ActionGuidance {
  status: ActionReviewStatus;
  categoryLabels: string[];
  note: string;
  relatedCardIds?: CardId[];
}

export interface CardGuidance {
  heading: string;
  explanation: string;
  relatedCards: Card[];
  relatedCategories: string[];
  actionStatus?: ActionReviewStatus;
  actionStatusLabel?: string;
  note?: string;
}

// The links are thematic associations based on the original card descriptions.
// They do not create bonuses, automatic effects, or new game rules.
const CRISIS_RELATIONS: CrisisRelations[] = [
  { crisisId: 'crisis_01', roles: ['role_04', 'role_09', 'role_13', 'role_21'], skills: ['skill_05', 'skill_14', 'skill_17', 'skill_29'], baggage: ['baggage_06', 'baggage_07', 'baggage_15', 'baggage_16', 'baggage_20'] },
  { crisisId: 'crisis_02', roles: ['role_05', 'role_18', 'role_19', 'role_21'], skills: ['skill_03', 'skill_07', 'skill_10', 'skill_21'], baggage: ['baggage_01', 'baggage_04', 'baggage_05', 'baggage_25', 'baggage_26'] },
  { crisisId: 'crisis_03', roles: ['role_06', 'role_08', 'role_15', 'role_20'], skills: ['skill_04', 'skill_09', 'skill_13', 'skill_22'], baggage: ['baggage_02', 'baggage_11', 'baggage_19', 'baggage_23'] },
  { crisisId: 'crisis_04', roles: ['role_02', 'role_10', 'role_12'], skills: ['skill_01', 'skill_07', 'skill_18', 'skill_22'], baggage: ['baggage_11', 'baggage_14', 'baggage_18', 'baggage_28'] },
  { crisisId: 'crisis_05', roles: ['role_04', 'role_16', 'role_21', 'role_28'], skills: ['skill_03', 'skill_10', 'skill_17'], baggage: ['baggage_03', 'baggage_05', 'baggage_10', 'baggage_13'] },
  { crisisId: 'crisis_06', roles: ['role_04', 'role_16', 'role_29', 'role_30'], skills: ['skill_17', 'skill_24', 'skill_26'], baggage: ['baggage_12', 'baggage_13', 'baggage_22', 'baggage_29', 'baggage_30'] },
  { crisisId: 'crisis_07', roles: ['role_02', 'role_10', 'role_12', 'role_19', 'role_24'], skills: ['skill_01', 'skill_15', 'skill_18', 'skill_22', 'skill_27'], baggage: ['baggage_01', 'baggage_14', 'baggage_21', 'baggage_24', 'baggage_28'] },
  { crisisId: 'crisis_08', roles: ['role_01', 'role_07', 'role_28'], skills: ['skill_02', 'skill_06', 'skill_24', 'skill_28'], baggage: ['baggage_12', 'baggage_18', 'baggage_26'] },
  { crisisId: 'crisis_09', roles: ['role_19', 'role_21', 'role_26'], skills: ['skill_10', 'skill_15', 'skill_21'], baggage: ['baggage_01', 'baggage_04', 'baggage_05', 'baggage_09', 'baggage_16'] },
  { crisisId: 'crisis_10', roles: ['role_01', 'role_07', 'role_17'], skills: ['skill_08', 'skill_17', 'skill_24'], baggage: ['baggage_12', 'baggage_15', 'baggage_20'] },
  { crisisId: 'crisis_11', roles: ['role_07', 'role_14', 'role_19'], skills: ['skill_11', 'skill_13', 'skill_14', 'skill_23'], baggage: ['baggage_01', 'baggage_04', 'baggage_15', 'baggage_23', 'baggage_26'] },
  { crisisId: 'crisis_12', roles: ['role_02', 'role_13', 'role_14', 'role_19'], skills: ['skill_01', 'skill_04', 'skill_13', 'skill_22', 'skill_25'], baggage: ['baggage_01', 'baggage_15', 'baggage_17', 'baggage_23', 'baggage_28'] },
  { crisisId: 'crisis_13', roles: ['role_01', 'role_09', 'role_12', 'role_21'], skills: ['skill_05', 'skill_17', 'skill_18', 'skill_28'], baggage: ['baggage_05', 'baggage_07', 'baggage_18', 'baggage_21', 'baggage_25'] },
  { crisisId: 'crisis_14', roles: ['role_05', 'role_13', 'role_18', 'role_25'], skills: ['skill_07', 'skill_08', 'skill_13', 'skill_24'], baggage: ['baggage_09', 'baggage_15', 'baggage_20', 'baggage_23'] },
  { crisisId: 'crisis_15', roles: ['role_03', 'role_06', 'role_08', 'role_11', 'role_15'], skills: ['skill_04', 'skill_09', 'skill_19'], baggage: ['baggage_02', 'baggage_11', 'baggage_19', 'baggage_23'] },
  { crisisId: 'crisis_16', roles: ['role_12', 'role_22', 'role_29', 'role_30'], skills: ['skill_13', 'skill_17', 'skill_18'], baggage: ['baggage_08', 'baggage_13', 'baggage_18', 'baggage_21', 'baggage_24'] },
  { crisisId: 'crisis_17', roles: ['role_04', 'role_10', 'role_18', 'role_19'], skills: ['skill_03', 'skill_10', 'skill_15', 'skill_28'], baggage: ['baggage_01', 'baggage_03', 'baggage_04', 'baggage_05', 'baggage_25'] },
  { crisisId: 'crisis_18', roles: ['role_01', 'role_09', 'role_21'], skills: ['skill_06', 'skill_14', 'skill_24', 'skill_29'], baggage: ['baggage_06', 'baggage_15', 'baggage_16', 'baggage_19', 'baggage_20'] },
  { crisisId: 'crisis_19', roles: ['role_04', 'role_16', 'role_29', 'role_30'], skills: ['skill_17', 'skill_26'], baggage: ['baggage_12', 'baggage_13', 'baggage_27', 'baggage_29', 'baggage_30'] },
  { crisisId: 'crisis_20', roles: ['role_02', 'role_10', 'role_19'], skills: ['skill_13', 'skill_15', 'skill_16', 'skill_22'], baggage: ['baggage_01', 'baggage_05', 'baggage_11', 'baggage_17', 'baggage_23'] },
  { crisisId: 'crisis_21', roles: ['role_09', 'role_13', 'role_21'], skills: ['skill_05', 'skill_07', 'skill_14', 'skill_29'], baggage: ['baggage_06', 'baggage_07', 'baggage_15', 'baggage_16', 'baggage_23'] },
  { crisisId: 'crisis_22', roles: ['role_02', 'role_07', 'role_12', 'role_17', 'role_24'], skills: ['skill_01', 'skill_11', 'skill_13', 'skill_25', 'skill_30'], baggage: ['baggage_08', 'baggage_09', 'baggage_15', 'baggage_18', 'baggage_21'] },
  { crisisId: 'crisis_23', roles: ['role_01', 'role_14', 'role_18', 'role_23'], skills: ['skill_02', 'skill_12', 'skill_20', 'skill_28'], baggage: ['baggage_09', 'baggage_12', 'baggage_17', 'baggage_26'] },
  { crisisId: 'crisis_24', roles: ['role_04', 'role_16', 'role_21', 'role_25', 'role_30'], skills: ['skill_07', 'skill_10', 'skill_17', 'skill_26'], baggage: ['baggage_07', 'baggage_12', 'baggage_13', 'baggage_29', 'baggage_30'] },
  { crisisId: 'crisis_25', roles: ['role_05', 'role_10', 'role_18', 'role_19', 'role_27'], skills: ['skill_01', 'skill_07', 'skill_13', 'skill_15', 'skill_27'], baggage: ['baggage_01', 'baggage_14', 'baggage_19', 'baggage_23', 'baggage_28'] },
  { crisisId: 'crisis_26', roles: ['role_02', 'role_12', 'role_22'], skills: ['skill_01', 'skill_11', 'skill_18', 'skill_22'], baggage: ['baggage_08', 'baggage_11', 'baggage_18', 'baggage_21'] },
  { crisisId: 'crisis_27', roles: ['role_04', 'role_16', 'role_19', 'role_29', 'role_30'], skills: ['skill_10', 'skill_12', 'skill_16'], baggage: ['baggage_05', 'baggage_09', 'baggage_10', 'baggage_13', 'baggage_25'] },
  { crisisId: 'crisis_28', roles: ['role_02', 'role_12', 'role_13', 'role_19'], skills: ['skill_01', 'skill_07', 'skill_13', 'skill_22'], baggage: ['baggage_09', 'baggage_11', 'baggage_14', 'baggage_21', 'baggage_23'] },
  { crisisId: 'crisis_29', roles: ['role_01', 'role_07', 'role_14', 'role_28'], skills: ['skill_02', 'skill_06', 'skill_20', 'skill_24', 'skill_28'], baggage: ['baggage_06', 'baggage_12', 'baggage_15', 'baggage_26'] },
  { crisisId: 'crisis_30', roles: ['role_01', 'role_03', 'role_15', 'role_16', 'role_27', 'role_28', 'role_29'], skills: ['skill_02', 'skill_04', 'skill_13', 'skill_14', 'skill_19', 'skill_26', 'skill_30'], baggage: ['baggage_06', 'baggage_11', 'baggage_13', 'baggage_15', 'baggage_29', 'baggage_30'] },
];

const VULNERABILITY_RISKS: Record<CardId, CardId[]> = {
  vulnerability_01: ['crisis_02', 'crisis_15', 'crisis_24', 'crisis_29'],
  vulnerability_02: ['crisis_09', 'crisis_12', 'crisis_20', 'crisis_27'],
  vulnerability_03: ['crisis_01', 'crisis_10', 'crisis_14', 'crisis_19', 'crisis_24', 'crisis_30'],
  vulnerability_04: ['crisis_03', 'crisis_15', 'crisis_20', 'crisis_30'],
  vulnerability_05: ['crisis_07', 'crisis_11', 'crisis_12', 'crisis_25'],
  vulnerability_06: ['crisis_05', 'crisis_06', 'crisis_19', 'crisis_24'],
  vulnerability_07: ['crisis_04', 'crisis_07', 'crisis_20', 'crisis_25', 'crisis_26'],
  vulnerability_08: ['crisis_01', 'crisis_18', 'crisis_21'],
  vulnerability_09: ['crisis_22', 'crisis_25', 'crisis_30'],
  vulnerability_10: ['crisis_08', 'crisis_12', 'crisis_23', 'crisis_29'],
  vulnerability_11: ['crisis_01', 'crisis_03', 'crisis_18', 'crisis_21'],
  vulnerability_12: ['crisis_04', 'crisis_07', 'crisis_20', 'crisis_25', 'crisis_26'],
  vulnerability_13: ['crisis_05', 'crisis_17', 'crisis_19'],
  vulnerability_14: ['crisis_02', 'crisis_14', 'crisis_24', 'crisis_25'],
  vulnerability_15: ['crisis_08', 'crisis_10', 'crisis_14', 'crisis_18', 'crisis_29'],
  vulnerability_16: ['crisis_13', 'crisis_14', 'crisis_24', 'crisis_30'],
  vulnerability_17: ['crisis_07', 'crisis_16', 'crisis_26', 'crisis_28'],
  vulnerability_18: ['crisis_07', 'crisis_09', 'crisis_25'],
  vulnerability_19: ['crisis_07', 'crisis_17', 'crisis_25', 'crisis_28'],
  vulnerability_20: ['crisis_18', 'crisis_21', 'crisis_29'],
  vulnerability_21: ['crisis_19', 'crisis_24', 'crisis_25', 'crisis_30'],
  vulnerability_22: ['crisis_16', 'crisis_22', 'crisis_28', 'crisis_30'],
  vulnerability_23: ['crisis_15', 'crisis_22', 'crisis_30'],
  vulnerability_24: ['crisis_16', 'crisis_26', 'crisis_27'],
  vulnerability_25: ['crisis_02', 'crisis_08', 'crisis_21', 'crisis_29'],
  vulnerability_26: ['crisis_02', 'crisis_09', 'crisis_12', 'crisis_21', 'crisis_27'],
  vulnerability_27: ['crisis_11', 'crisis_14', 'crisis_25', 'crisis_30'],
  vulnerability_28: ['crisis_11', 'crisis_12', 'crisis_20'],
  vulnerability_29: ['crisis_03', 'crisis_14', 'crisis_18', 'crisis_24'],
  vulnerability_30: ['crisis_07', 'crisis_25', 'crisis_30'],
};

const ACTION_GUIDANCE: Record<CardId, ActionGuidance> = {
  action_01: { status: 'needs-rule', categoryLabels: ['Роль', 'Навык', 'Голосование'], note: 'Нужно определить вопрос, способ проверки ответа и точное изменение результата голосования.', relatedCardIds: ['role_11', 'skill_19'] },
  action_02: { status: 'needs-rule', categoryLabels: ['Голосование', 'Результат раунда'], note: 'До применения нужно определить момент отката и список отменяемых событий: голоса, исключение, уже сыгранные действия.', relatedCardIds: [] },
  action_03: { status: 'ready', categoryLabels: ['Багаж', 'Колода Багажа', 'Выбывший игрок'], note: 'Серверный эффект меняет одну карту Багажа. Обмен с выбывшим доступен только при наличии у него подходящей карты.', relatedCardIds: ['baggage_07', 'baggage_15', 'baggage_16', 'baggage_20'] },
  action_04: { status: 'ready', categoryLabels: ['Уязвимость', 'Сброс'], note: 'Сбрасывает собственную карту Уязвимости. Это не отменяет другие правила игрока и не лечит чужие Уязвимости.', relatedCardIds: ['vulnerability_01', 'vulnerability_11', 'vulnerability_19'] },
  action_05: { status: 'needs-rule', categoryLabels: ['Закрытая карта', 'Раскрытие'], note: 'В исходном тексте не указана категория закрытой карты, поэтому автоматический выбор цели карты небезопасен.', relatedCardIds: [] },
  action_06: { status: 'ready', categoryLabels: ['Роль', 'Обмен'], note: 'Обменивает именно карты категории «Роль», не Навыки и не весь набор участника.', relatedCardIds: ['role_01', 'role_04', 'role_09', 'role_16', 'role_28'] },
  action_07: { status: 'needs-rule', categoryLabels: ['Голосование', 'Ничья'], note: 'В исходной карте объединены два разных эффекта: двойной голос и спасение при равенстве. Нужно выбрать один вариант или описать порядок.', relatedCardIds: [] },
  action_08: { status: 'ready', categoryLabels: ['Кризис', 'Приватный просмотр'], note: 'Показывает будущую карту Кризиса только владельцу действия; карта не раскрывается остальным игрокам.', relatedCardIds: ['crisis_01', 'crisis_03', 'crisis_07', 'crisis_18', 'crisis_30'] },
  action_09: { status: 'needs-rule', categoryLabels: ['Защита', 'Действия', 'Уязвимости'], note: 'Не определено, какие именно эффекты блокирует защита, как она взаимодействует с уже сыгранными картами и когда истекает раунд.', relatedCardIds: [] },
  action_10: { status: 'ready', categoryLabels: ['Багаж', 'Раскрытие'], note: 'Раскрывает карты Багажа всех участников. Это раскрытие информации, а не передача или списание предметов.', relatedCardIds: ['baggage_01', 'baggage_06', 'baggage_14', 'baggage_24'] },
  action_11: { status: 'ready', categoryLabels: ['Навык', 'Дополнительная карта'], note: 'Сервер и колода реализуют получение второй карты категории «Навыки». Фраза «2 профессии» в оригинальном описании противоречит этому эффекту; роль не меняется.', relatedCardIds: ['skill_05', 'skill_14', 'skill_22', 'skill_26'] },
  action_12: { status: 'ready', categoryLabels: ['Багаж', 'Списание'], note: 'Списывает Багаж выбранного участника. Если у него несколько предметов и исходный эффект не позволяет выбрать конкретный экземпляр, действие должно отказать, а не выбирать карту случайно.', relatedCardIds: ['baggage_07', 'baggage_13', 'baggage_20'] },
  action_13: { status: 'needs-rule', categoryLabels: ['Дуэль', 'Иммунитет'], note: 'Не указаны судья, критерий победы и срок действия иммунитета. До определения процедуры эффект не автоматизируется.', relatedCardIds: ['role_11', 'skill_19'] },
  action_14: { status: 'needs-rule', categoryLabels: ['Навык', 'Копирование'], note: 'Не определены порядок соседей за столом и точный объём копирования: текст навыка, его эффект или отдельная карта.', relatedCardIds: ['skill_02', 'skill_06', 'skill_14', 'skill_29'] },
  action_15: { status: 'ready', categoryLabels: ['Кризис', 'Сброс', 'Колода Кризисов'], note: 'Заменяет выбранную активную карту Кризиса следующей картой из колоды. Правило накопления кризисов остаётся открытым.', relatedCardIds: ['crisis_01', 'crisis_07', 'crisis_15', 'crisis_30'] },
  action_16: { status: 'ready', categoryLabels: ['Багаж', 'Выбывший игрок'], note: 'Передаёт Багаж выбывшего участника активному игроку. Не меняет статус самого выбывшего.', relatedCardIds: ['baggage_06', 'baggage_11', 'baggage_15', 'baggage_24'] },
  action_17: { status: 'ready', categoryLabels: ['Таймер', 'Брифинг'], note: 'Сторожевой таймер сокращает время аргументации до 30 секунд. В исходном названии есть опечатка «Стожевой»; смысл эффекта не меняется.', relatedCardIds: ['skill_30'] },
  action_18: { status: 'ready', categoryLabels: ['Уязвимость', 'Обмен'], note: 'Обменивает карты категории «Уязвимость» между двумя участниками. Не меняет их Роли, Навыки или Багаж.', relatedCardIds: ['vulnerability_01', 'vulnerability_07', 'vulnerability_19', 'vulnerability_30'] },
  action_19: { status: 'needs-rule', categoryLabels: ['Голосование', 'Перераспределение голосов'], note: 'Не определено, что означает «похожий игрок», как округлять половину голосов и меняется ли уже поданный голос.', relatedCardIds: [] },
  action_20: { status: 'ready', categoryLabels: ['Закрытые карты', 'Приватный просмотр'], note: 'Показывает владельцу действия скрытые карты выбранного участника. Результат не становится публичным.', relatedCardIds: [] },
  action_21: { status: 'blocked', categoryLabels: ['Кризис', 'Финальный аудит'], note: 'В текущей реализации выбранный Кризис только записывается в список. Финальный аудит не исключает его из проверки, поэтому эффект временно отключён до реализации структурированной проверки.', relatedCardIds: ['crisis_01', 'crisis_15', 'crisis_30'] },
  action_22: { status: 'needs-rule', categoryLabels: ['Голосование', 'Блокировка аккаунта'], note: 'В игре нет механики ввода паролей и подсчёта трёх ошибок. Добавлять парольную мини-игру без утверждения нельзя.', relatedCardIds: [] },
  action_23: { status: 'needs-rule', categoryLabels: ['Пара игроков', 'Вместимость', 'Исключение'], note: 'Не определено, как пара влияет на подсчёт мест, голосование, иммунитет и исключение одного из участников.', relatedCardIds: [] },
  action_24: { status: 'ready', categoryLabels: ['Багаж', 'Дополнительная карта'], note: 'Добирает вторую карту категории «Багаж» из серверной колоды и оставляет её закрытой.', relatedCardIds: ['baggage_01', 'baggage_06', 'baggage_12', 'baggage_26'] },
  action_25: { status: 'blocked', categoryLabels: ['Уязвимость', 'Safe Boot'], note: 'В игре пока нет формализованных автоматических эффектов карт «Уязвимость», которые можно отключить. Флаг Safe Boot не меняет поведение карточек, поэтому эффект временно отключён.', relatedCardIds: ['vulnerability_03', 'vulnerability_11', 'vulnerability_19', 'vulnerability_30'] },
  action_26: { status: 'needs-rule', categoryLabels: ['Преподаватель', 'Подсказка'], note: 'Нужен сценарий запроса и ответа преподавателя. Без него нельзя реализовать однократную подсказку достоверно.', relatedCardIds: [] },
  action_27: { status: 'needs-rule', categoryLabels: ['Роль', 'Внеочередное голосование'], note: 'Колода раздаётся без дубликатов ролей. Нужно определить, как найти две одинаковые роли и что происходит с обычным голосованием.', relatedCardIds: ['role_01', 'role_02', 'role_12', 'role_19'] },
  action_28: { status: 'ready', categoryLabels: ['Вместимость Бункера'], note: 'Сервер увеличивает вместимость Бункера ровно на одно место. Карта применяется один раз за партию.', relatedCardIds: ['role_16', 'role_28', 'baggage_13', 'baggage_29'] },
  action_29: { status: 'needs-rule', categoryLabels: ['Набор карт', 'Колоды'], note: 'Не определено, какие четыре категории добираются и что происходит с пятой исходной картой. Автоматический сброс полного набора изменил бы правила.', relatedCardIds: [] },
  action_30: { status: 'needs-rule', categoryLabels: ['Финальный аудит', 'Преподаватель'], note: 'Не определено, что считается одной ошибкой, кто проверяет план и как применяется право на ошибку.', relatedCardIds: [] },
};

const CARD_LABELS: Record<CardCategory, string> = {
  roles: 'Роли',
  skills: 'Навыки',
  baggage: 'Багаж',
  vulnerabilities: 'Уязвимости',
  crises: 'Кризисы',
  actions: 'Действия',
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function relatedCards(ids: string[]): Card[] {
  return unique(ids)
    .map((id) => CARDS_BY_ID[id])
    .filter((card): card is Card => Boolean(card));
}

export function getCardGuidance(cardId: string): CardGuidance | null {
  const card = CARDS_BY_ID[cardId];
  if (!card) return null;

  if (card.category === 'crises') {
    const link = CRISIS_RELATIONS.find((entry) => entry.crisisId === cardId);
    if (!link) return null;
    return {
      heading: 'Что может помочь при этом кризисе',
      explanation: 'Тематически подходящие специалисты, навыки и предметы по описанию кризиса. Это подсказка для обсуждения, а не автоматические бонусы.',
      relatedCards: relatedCards([...link.roles, ...link.skills, ...link.baggage]),
      relatedCategories: ['Роли', 'Навыки', 'Багаж'],
    };
  }

  if (card.category === 'roles' || card.category === 'skills' || card.category === 'baggage') {
    const linked = CRISIS_RELATIONS
      .filter((entry) => entry.roles.includes(cardId) || entry.skills.includes(cardId) || entry.baggage.includes(cardId))
      .map((entry) => entry.crisisId);
    return {
      heading: 'Связанные кризисы',
      explanation: 'Ситуации, в которых эта роль, компетенция или предмет может быть полезен по смыслу исходного описания.',
      relatedCards: relatedCards(linked),
      relatedCategories: ['Кризисы'],
    };
  }

  if (card.category === 'vulnerabilities') {
    return {
      heading: 'С какими рисками связана уязвимость',
      explanation: 'Тематические пересечения с кризисами. Сама связь не накладывает штраф и не заменяет отдельное правило эффекта Уязвимости.',
      relatedCards: relatedCards(VULNERABILITY_RISKS[cardId] || []),
      relatedCategories: ['Кризисы'],
    };
  }

  const action = ACTION_GUIDANCE[cardId];
  if (!action) return null;
  const statusLabels: Record<ActionReviewStatus, string> = {
    ready: 'Работает в игре',
    'needs-rule': 'Нужно уточнить правило',
    blocked: 'Временно отключено',
  };
  return {
    heading: 'Как связано действие',
    explanation: action.note,
    relatedCards: relatedCards(action.relatedCardIds || []),
    relatedCategories: action.categoryLabels,
    actionStatus: action.status,
    actionStatusLabel: statusLabels[action.status],
  };
}

export function validateCardGuidanceCoverage(): string[] {
  const errors: string[] = [];
  const expected = new Set(ALL_CARDS.map((card) => card.card_id));
  const crisisIds = new Set(CRISIS_RELATIONS.map((entry) => entry.crisisId));
  const vulnerabilityIds = new Set(Object.keys(VULNERABILITY_RISKS));
  const actionIds = new Set(Object.keys(ACTION_GUIDANCE));

  if (CRISIS_RELATIONS.length !== 30) errors.push('Expected 30 crisis relation entries.');
  if (vulnerabilityIds.size !== 30) errors.push('Expected guidance for all 30 vulnerabilities.');
  if (actionIds.size !== 30) errors.push('Expected guidance for all 30 action cards.');

  for (const entry of CRISIS_RELATIONS) {
    if (!expected.has(entry.crisisId)) errors.push('Unknown crisis: ' + entry.crisisId);
    for (const id of [...entry.roles, ...entry.skills, ...entry.baggage]) {
      if (!expected.has(id)) errors.push('Unknown related card: ' + id);
    }
  }
  for (const [vulnerabilityId, linkedCrises] of Object.entries(VULNERABILITY_RISKS)) {
    if (!expected.has(vulnerabilityId)) errors.push('Unknown vulnerability: ' + vulnerabilityId);
    for (const id of linkedCrises) {
      if (!crisisIds.has(id)) errors.push('Unknown crisis in vulnerability link: ' + id);
    }
  }
  for (const [actionId, guidance] of Object.entries(ACTION_GUIDANCE)) {
    if (!expected.has(actionId)) errors.push('Unknown action: ' + actionId);
    for (const id of guidance.relatedCardIds || []) {
      if (!expected.has(id)) errors.push('Unknown related action card link: ' + id);
    }
  }

  const linkedRoleIds = new Set(CRISIS_RELATIONS.flatMap((entry) => entry.roles));
  const linkedSkillIds = new Set(CRISIS_RELATIONS.flatMap((entry) => entry.skills));
  const linkedBaggageIds = new Set(CRISIS_RELATIONS.flatMap((entry) => entry.baggage));
  for (const category of ['roles', 'skills', 'baggage'] as const) {
    const ids = ALL_CARDS.filter((item) => item.category === category).map((item) => item.card_id);
    const linked = category === 'roles' ? linkedRoleIds : category === 'skills' ? linkedSkillIds : linkedBaggageIds;
    for (const id of ids) if (!linked.has(id)) errors.push('Card has no crisis links: ' + id);
  }
  for (const card of ALL_CARDS) {
    if (!getCardGuidance(card.card_id)) errors.push('Card has no guidance: ' + card.card_id);
  }
  return errors;
}

export function getCategoryName(category: CardCategory): string {
  return CARD_LABELS[category] || CATEGORY_CONFIG[category].nameRu;
}
