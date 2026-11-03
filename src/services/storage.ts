import { GameState } from '../types/game';

const STORAGE_KEY = 'bunker_mdk0401_gamestate';
const USER_KEY = 'bunker_mdk0401_user';

export interface StoredUser {
  id: string;
  name: string;
}

export function saveGameState(state: GameState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save game state to sessionStorage', e);
  }
}

export function loadGameState(): GameState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGameState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function saveLocalUser(user: StoredUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}

export function loadLocalUser(): StoredUser {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    id: `eng_${Math.random().toString(36).substring(2, 8)}`,
    name: 'Инженер-Координатор',
  };
}
