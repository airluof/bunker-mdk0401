import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, Users, ShieldCheck, DoorOpen, XCircle, Settings2 } from 'lucide-react';
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

  return (
    <main className="incident-page incident-room-page py-4 sm:py-8">
      <div className="incident-topline">
        <span><strong>NEUROTECH</strong> / DRP-SITE / ROOM CONTROL</span>
        <span>УПРАВЛЕНИЕ СОСТАВОМ // <strong>{snapshot.room.status.toUpperCase()}</strong></span>
      </div>

      <header className="incident-room-header">
        <div>
          <div className="incident-kicker">
            <span className="incident-kicker-mark" />
            <span>ОНЛАЙН-СЕССИЯ</span>
            <span>/</span>
            <span>{snapshot.session.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <h1 className="incident-room-title">Комната ожидания<span>.</span></h1>
          <p className="incident-lead incident-room-lead">
            Здесь отображаются только реальные участники, подключившиеся по коду комнаты. Тестовые боты не добавляются.
          </p>
          {snapshot.room.status === 'archived' && (
            <div className="incident-error" role="status">
              Создатель закрыл эту комнату. Новые подключения запрещены. Вернитесь на главную, чтобы освободить участие.
            </div>
          )}
        </div>

        <div className="incident-room-controls">
          <button type="button" onClick={onRefresh} disabled={busy} className="incident-button">
            <RefreshCw className="w-4 h-4" />
            ОБНОВИТЬ
          </button>
          <button type="button" onClick={onExit} disabled={busy} className="incident-button incident-button-danger">
            {snapshot.room.status === 'archived' || !isHost
              ? <DoorOpen className="w-4 h-4" />
              : <XCircle className="w-4 h-4" />}
            {snapshot.room.status === 'archived'
              ? 'ВЕРНУТЬСЯ'
              : isHost ? 'ЗАКРЫТЬ КОМНАТУ' : 'ПОКИНУТЬ'}
          </button>
        </div>
      </header>

      {error && <div role="alert" className="incident-error">{error}</div>}

      <section className="incident-room-grid">
        <div className="incident-room-roster">
          <div className="incident-room-section-head">
            <div>
              <span className="incident-section-index">01 / УЧАСТНИКИ</span>
              <h2 className="incident-section-title">Состав комнаты</h2>
            </div>
            <div className="incident-room-count">
              <Users className="w-4 h-4" />
              <strong>{activePlayers.length.toString().padStart(2, '0')}</strong>
              <span>/ {snapshot.room.max_players}</span>
            </div>
          </div>

          <div className="incident-room-player-list">
            {activePlayers.map((player, index) => (
              <div key={player.member_id} className="incident-room-player">
                <span className="incident-room-player-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="incident-room-player-copy">
                  <span className="incident-room-player-name">{player.display_name}</span>
                  <span className="incident-room-player-role">
                    {player.technical_role === 'host' ? 'СОЗДАТЕЛЬ КОМНАТЫ' : 'УЧАСТНИК'}
                  </span>
                </div>
                {player.technical_role === 'host' && <ShieldCheck className="incident-room-host-icon w-4 h-4" />}
                <span className="incident-room-player-status">В КОМНАТЕ</span>
              </div>
            ))}
            {activePlayers.length === 0 && (
              <p className="incident-room-empty">В комнате пока нет активных участников.</p>
            )}
          </div>
        </div>

        <aside className="incident-room-aside">
          <div>
            <span className="incident-section-index">02 / ДОСТУП</span>
            <h2 className="incident-section-title">Код приглашения</h2>
            <div className="incident-room-invite-code">
              {inviteCode || 'ДОСТУПЕН СОЗДАТЕЛЮ ПРИ СОЗДАНИИ'}
            </div>
            {inviteCode && (
              <button type="button" onClick={handleCopyCode} className="incident-button incident-button-primary incident-room-copy">
                <Copy className="w-4 h-4" />
                {copied ? 'СКОПИРОВАНО' : 'КОПИРОВАТЬ КОД'}
              </button>
            )}
          </div>

          <div className="incident-room-aside-block incident-room-settings">
            <div className="incident-room-settings-heading">
              <div>
                <span className="incident-section-index">03 / ПАРАМЕТРЫ</span>
                <h2 className="incident-section-title">Настройки комнаты</h2>
              </div>
              <Settings2 className="incident-room-settings-icon w-5 h-5" />
            </div>

            <label className="incident-field-label" htmlFor="room-max-players">
              Максимум участников
            </label>
            {canEditSettings ? (
              <select
                id="room-max-players"
                className="incident-room-select"
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Number(event.target.value))}
                disabled={busy}
              >
                {Array.from({ length: 9 }, (_, index) => index + 8).map((count) => (
                  <option key={count} value={count} disabled={count < activePlayers.length}>
                    {count} игроков
                  </option>
                ))}
              </select>
            ) : (
              <div className="incident-room-range">
                {snapshot.room.max_players} <span>ИГРОКОВ</span>
              </div>
            )}

            <p className="incident-room-settings-note">
              Минимум для начала игры — {snapshot.room.min_players} игроков. Можно ограничить комнату от 8 до 16 мест.
            </p>
            {canEditSettings && (
              <button
                type="button"
                className="incident-button incident-button-primary incident-room-save"
                disabled={busy || !settingsChanged || maxPlayers < activePlayers.length}
                onClick={() => onSaveSettings(maxPlayers)}
              >
                {busy ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ НАСТРОЙКИ'}
              </button>
            )}
            {!isHost && snapshot.room.status === 'lobby' && (
              <p className="incident-room-settings-note">Изменять настройки может только создатель комнаты.</p>
            )}
            {snapshot.room.status === 'lobby' && (
              <p className="incident-room-settings-note incident-room-player-progress">
                {remainingToStart > 0
                  ? `До минимального состава осталось: ${remainingToStart}.`
                  : 'Минимальный состав набран. Ожидайте дальнейших действий ведущего.'}
              </p>
            )}
          </div>

          <div className="incident-room-meta">
            <span>ROOM / {snapshot.room.status.toUpperCase()}</span>
            <span>SESSION / {snapshot.session.status.toUpperCase()}</span>
          </div>
        </aside>
      </section>
      {snapshot.room.status === 'lobby' && (
        <p className="incident-room-engine-note">
          Сейчас доступны создание комнаты, подключение настоящих игроков и настройка лимита. Полноценный игровой стол и синхронизация ходов ещё не подключены.
        </p>
      )}
    </main>
  );
};
