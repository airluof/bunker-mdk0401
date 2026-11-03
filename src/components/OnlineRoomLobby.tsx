import React, { useState } from 'react';
import { Copy, RefreshCw, Users, ShieldCheck, DoorOpen, XCircle } from 'lucide-react';
import type { RoomSnapshot } from '../services/onlineRooms';

interface OnlineRoomLobbyProps {
  snapshot: RoomSnapshot;
  inviteCode?: string;
  isHost: boolean;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  onExit: () => void;
}

export const OnlineRoomLobby: React.FC<OnlineRoomLobbyProps> = ({
  snapshot,
  inviteCode,
  isHost,
  busy,
  error,
  onRefresh,
  onExit,
}) => {
  const [copied, setCopied] = useState(false);
  const activePlayers = snapshot.players.filter((player) => player.membership_status === 'active');

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
            Участники подключаются к одной серверной комнате. Состав обновляется автоматически.
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

          <div className="incident-room-aside-block">
            <span className="incident-field-label">Регламент состава</span>
            <div className="incident-room-range">
              {snapshot.room.min_players}–{snapshot.room.max_players} <span>ИГРОКОВ</span>
            </div>
            <p className="incident-sidebar-copy">
              {snapshot.room.status === 'archived'
                ? 'Комната закрыта и больше не принимает участников.'
                : 'Для запуска требуется набрать минимальный состав. Игровой стол и серверные игровые действия ещё подключаются.'}
            </p>
          </div>

          <div className="incident-room-meta">
            <span>ROOM / {snapshot.room.status.toUpperCase()}</span>
            <span>SESSION / {snapshot.session.status.toUpperCase()}</span>
          </div>
        </aside>
      </section>
    </main>
  );
};
