export type CardCategory = 
  | 'roles' 
  | 'skills' 
  | 'baggage' 
  | 'vulnerabilities' 
  | 'crises' 
  | 'actions';

export interface Card {
  card_id: string;
  category: CardCategory;
  category_name_ru: string;
  card_number: number;
  original_title: string;
  source_description: string;
  source_illustration_idea?: string;
  exported_title: string;
  file_name: string;
  relative_path: string;
  format?: string;
  width?: number;
  height?: number;
  sha256?: string;
}

export type PlayerSlotCategory = 'roles' | 'skills' | 'baggage' | 'vulnerabilities' | 'actions';

export interface PlayerHand {
  roles: Card;
  skills: Card;
  baggage: Card;
  vulnerabilities: Card;
  actions: Card;
}

export interface PlayerRevealedState {
  roles: boolean;
  skills: boolean;
  baggage: boolean;
  vulnerabilities: boolean;
  actions: boolean;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  isAlive: boolean;
  avatarSeed: string;
  hand: PlayerHand;
  revealed: PlayerRevealedState;
  actionUsed: boolean;
  votesReceived: number;
  votedForId: string | null;
  eliminatedInRound?: number;
}

export type GamePhase = 
  | 'lobby'          // Lobby: gathering engineers
  | 'reveal'         // Phase 1: Card revealing stage
  | 'briefing'       // Phase 2: Technical briefing / debate (60s timer)
  | 'voting'         // Phase 3: Voting on candidate to be excluded
  | 'elimination'    // Phase 4: Announcement of excluded engineer & crisis consequence
  | 'audit'          // Final Phase: GOST R ISO/IEC 12207 Infrastructure Recovery Plan
  | 'gameover';      // Completed game summary

export interface GameLogEntry {
  id: string;
  timestamp: string;
  round: number;
  type: 'system' | 'crisis' | 'reveal' | 'action' | 'vote' | 'elimination' | 'audit';
  message: string;
  actorName?: string;
  cardId?: string;
}

export interface RecoveryPlanStep {
  id: string;
  gostPhase: string;
  title: string;
  assignedRoleCardId?: string;
  assignedSkillCardId?: string;
  assignedBaggageCardId?: string;
  mitigatedVulnerabilityCardId?: string;
  solutionNotes: string;
  verified: boolean;
}

export interface GameState {
  /** True for browser-only test sessions populated with simulated engineers. */
  isLocalDemo?: boolean;
  roomCode: string;
  hostId: string;
  round: number;
  maxRounds: number;
  phase: GamePhase;
  players: Player[];
  activeCrises: Card[];
  crisisDeck: Card[];
  bunkerCapacity: number;
  timerSeconds: number;
  timerActive: boolean;
  activeSpeakerId: string | null;
  lastEliminatedPlayerId: string | null;
  log: GameLogEntry[];
  recoveryPlan: RecoveryPlanStep[];
}
