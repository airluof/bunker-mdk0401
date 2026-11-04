import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, Users, Crown, DoorOpen, XCircle, Settings2 } from 'lucide-react';
import type { RoomSnapshot } from '../services/onlineRooms';

interface OnlineRoomLobbyProps {
  snapshot: RoomSnapshot;
  inviteCode?: string;
  isHost: boolean;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  onExit: () => void;
  onSaveSettings: (maxPlayers: number) => void;
  onStartGame: () => void;
  onStartTestGame: () => void;
}

export const OnlineRoomLobby: React.FC<OnlineRoomLobbyProps> = ({
  snapshot,
  inviteCode,
  isHost,
  busy,
  error,
  onRefresh,
  onExit,
  onSaveSettings,
  onStartGame,
  onStartTestGame,
}) => {
  const [copied, setCopied] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(snapshot.room.max_players);
  const activePlayers = snapshot.players.filter((player) => player.membership_status === 'active');
  const canEditSettings = isHost && snapshot.room.status === 'lobby';
  const settingsChanged = maxPlayers !== snapshot.room.max_players;
  const remainingToStart = Math.max(0, snapshot.room.min_players - activePlayers.length);

  useEffect(() => {
    setMaxPlayers(snapshot.room.max_players);
  }, [snapshot.room.max_players]);

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const remainingLabel = remainingToStart === 1
    ? 'игрок'
    : remainingToStart < 5
      ? 'игрока'
      : 'игроков';

  return (
    <main className="bunker-page bunker-room-page">
      <header className="bunker-room-heading">
        <div>
          <p className="bunker-eyebrow">Онлайн-игра</p>
          <h1>{snapshot.room.status === 'archived' ? 'Комната закрыта' : 'Комната ожидания'}</h1>
          <p className="bunker-page-description">
            {snapshot.room.status === 'archived'
              ? 'Создатель закрыл комнату. Вы можете вернуться на главную.'
              : 'Отправь друзьям код приглашения и дождись, пока они подключатся.'}
          </p>
        </div>
        <div className="bunker-room-actions">
          <button type="button" onClick={onRefresh} disabled={busy} className="bunker-button bunker-button-secondary">
            <RefreshCw aria-hidden="true" />
            Обновить
          </button>
          {isHost && snapshot.room.status === 'lobby' && (
            <button
              type="button"
              onClick={onStartGame}
              disabled={busy || activePlayers.length < snapshot.room.min_players}
              className="bunker-button bunker-button-primary"
              title={activePlayers.length < snapshot.room.min_players
                ? `Для старта нужно ещё ${remainingToStart} игроков`
                : 'Раздать карты и начать партию'}
            >
              {busy ? 'Запускаем…' : 'Начать игру'}
            </button>
          )}
          {isHost && snapshot.room.status === 'lobby' && (
            <button
              type="button"
              onClick={onStartTestGame}
              disabled={busy || activePlayers.length === 0}
              className="bunker-button bunker-button-secondary"
              title="Тестовый запуск выдаёт карты текущим участникам и не требует 8 игроков"
            >
              {busy ? 'Запускаем тест…' : 'Тестовый запуск'}
            </button>
          )}
          <button type="button" onClick={onExit} disabled={busy} className="bunker-button bunker-button-danger">
            {snapshot.room.status === 'archived' || !isHost
              ? <DoorOpen aria-hidden="true" />
              : <XCircle aria-hidden="true" />}
            {snapshot.room.status === 'archived' ? 'На главную' : isHost ? 'Закрыть комнату' : 'Покинуть'}
          </button>
        </div>
      </header>

      {error && <div role="alert" className="bunker-error">{error}</div>}

      <div className="bunker-room-layout">
        <section className="bunker-panel bunker-players-panel">
          <div className="bunker-panel-heading">
            <div>
              <h2>Игроки</h2>
              <p>Подключившиеся участники</p>
            </div>
            <div className="bunker-player-count">
              <Users aria-hidden="true" />
              <strong>{activePlayers.length}</strong>
              <span>из {snapshot.room.max_players}</span>
            </div>
          </div>

          <div className="bunker-player-list">
            {activePlayers.map((player) => (
              <div key={player.member_id} className="bunker-player-row">
                <span className="bunker-player-avatar">
                  {player.display_name.trim().slice(0, 2).toUpperCase()}
                </span>
                <span className="bunker-player-details">
                  <strong>{player.display_name}</strong>
                  <small>{player.technical_role === 'host' ? 'Создатель комнаты' : 'Игрок'}</small>
                </span>
                {player.technical_role === 'host' && (
                  <span className="bunker-host-label"><Crown aria-hidden="true" /> Ведущий</span>
                )}
              </div>
            ))}
            {snapshot.room.status === 'lobby' && Array.from(
              { length: Math.max(0, snapshot.room.max_players - activePlayers.length) },
              (_, index) => (
                <div key={`empty-seat-${index}`} className="bunker-player-seat">
                  <span className="bunker-player-avatar is-empty">+</span>
                  <span className="bunker-player-details">
                    <strong>Свободное место</strong>
                    <small>Ожидает игрока</small>
                  </span>
                </div>
              )
            )}

            {activePlayers.length === 0 && (
              <p className="bunker-empty-copy">Пока никто не подключился. Отправьте друзьям код комнаты.</p>
            )}
          </div>

          {snapshot.room.status === 'lobby' && (
            <p className="bunker-player-progress">
              {remainingToStart > 0
                ? 'Для начала игры нужно ещё ' + remainingToStart + ' ' + remainingLabel + '.'
                : 'Минимальное количество игроков набрано.'}
            </p>
          )}
        </section>

        <aside className="bunker-room-sidebar">
          <section className="bunker-panel bunker-invite-panel">
            <h2>Приглашение</h2>
            <p>Отправь этот код друзьям, чтобы они вошли в комнату.</p>
            <div className="bunker-invite-code">{inviteCode || 'Код доступен создателю комнаты'}</div>
            {inviteCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="bunker-button bunker-button-primary bunker-copy-button"
              >
                <Copy aria-hidden="true" />
                {copied ? 'Скопировано' : 'Скопировать код'}
              </button>
            )}
          </section>

          <section className="bunker-panel bunker-settings-panel">
            <div className="bunker-panel-heading">
              <div>
                <h2>Настройки</h2>
                <p>Количество игроков</p>
              </div>
              <Settings2 aria-hidden="true" />
            </div>

            {canEditSettings ? (
              <select
                id="room-max-players"
                className="bunker-select"
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Number(event.target.value))}
                disabled={busy}
                aria-label="Максимальное количество игроков"
              >
                {Array.from({ length: 9 }, (_, index) => index + 8).map((count) => (
                  <option key={count} value={count} disabled={count < activePlayers.length}>
                    До {count} игроков
                  </option>
                ))}
              </select>
            ) : (
              <div className="bunker-setting-value">{snapshot.room.max_players} <span>игроков</span></div>
            )}

            <p className="bunker-help">
              В комнате может быть от 8 до 16 игроков. Изменить лимит может только создатель.
            </p>

            {canEditSettings && (
              <button
                type="button"
                className="bunker-button bunker-button-secondary bunker-save-settings"
                disabled={busy || !settingsChanged || maxPlayers < activePlayers.length}
                onClick={() => onSaveSettings(maxPlayers)}
              >
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
            )}
          </section>
        </aside>
      </div>

      {snapshot.room.status === 'lobby' && (
        <p className="bunker-online-note">
          {remainingToStart > 0
            ? `Ожидание участников: для старта нужно ещё ${remainingToStart}.`
            : isHost
              ? 'Минимум участников набран. Ведущий может запустить партию.'
              : 'Минимум участников набран. Ожидаем запуска от ведущего.'}
        </p>
      )}
      {isHost && snapshot.room.status === 'lobby' && (
        <p className="bunker-online-note">
          Тестовый запуск проверяет раздачу для текущих участников, даже если вы один.
          Он переводит комнату в состояние игры; для обычной партии после проверки
          потребуется создать новую комнату.
        </p>
      )}
    </main>
  );
};
