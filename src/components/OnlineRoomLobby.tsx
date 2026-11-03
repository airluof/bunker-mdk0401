import React, { useState } from 'react';
import { Copy, RefreshCw, Users, ShieldCheck, DoorOpen, XCircle } from 'lucide-react';
import { RoomSnapshot } from '../services/onlineRooms';

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
    <section className="space-y-5">
      <header className="border-b border-slate-700 pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono-tech uppercase tracking-[0.18em] text-amber-400">
            NEUROTECH / DRP-SITE · ONLINE ROOM
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-tactical font-bold text-white">
            Комната ожидания
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Участники подключаются к одной серверной комнате. Список обновляется в реальном времени.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="px-3 py-2 border border-slate-700 text-slate-200 hover:border-slate-500 disabled:opacity-50 text-xs inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
          <button
            type="button"
            onClick={onExit}
            disabled={busy}
            className="px-3 py-2 border border-rose-900 text-rose-300 hover:border-rose-500 disabled:opacity-50 text-xs inline-flex items-center gap-2"
          >
            {isHost ? <XCircle className="w-4 h-4" /> : <DoorOpen className="w-4 h-4" />}
            {isHost ? 'Закрыть комнату' : 'Покинуть комнату'}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="border border-slate-700 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
                Состав комнаты
              </div>
              <div className="mt-1 text-2xl font-tactical font-bold text-white">
                {activePlayers.length} / {snapshot.room.max_players}
              </div>
            </div>
            <Users className="w-6 h-6 text-slate-400" />
          </div>

          <div className="mt-4 space-y-2">
            {activePlayers.map((player, index) => (
              <div key={player.member_id} className="flex items-center justify-between border-t border-slate-800 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono-tech text-slate-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 truncate">{player.display_name}</div>
                    <div className="text-[10px] text-slate-500 font-mono-tech uppercase">
                      {player.technical_role === 'host' ? 'Создатель комнаты' : 'Участник'}
                    </div>
                  </div>
                </div>
                {player.technical_role === 'host' && (
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                )}
              </div>
            ))}
            {activePlayers.length === 0 && (
              <p className="py-6 text-sm text-slate-500">В комнате пока нет активных участников.</p>
            )}
          </div>
        </div>

        <aside className="border border-slate-700 bg-slate-900/60 p-5 space-y-4">
          <div>
            <div className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
              Код приглашения
            </div>
            <div className="mt-2 break-all font-mono-tech text-xl tracking-[0.12em] text-white">
              {inviteCode || 'Код доступен только создателю после создания'}
            </div>
            {inviteCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="mt-3 w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs inline-flex justify-center items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Код скопирован' : 'Скопировать код'}
              </button>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
              Требования к партии
            </div>
            <div className="mt-2 text-sm text-slate-200">
              От {snapshot.room.min_players} до {snapshot.room.max_players} игроков
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              После набора состава можно будет запускать партию. Пока серверные игровые действия и игровой стол ещё подключаются.
            </p>
          </div>

          <div className="border-t border-slate-800 pt-4 text-[11px] font-mono-tech text-slate-500">
            ROOM STATUS: {snapshot.room.status.toUpperCase()}
            <br />
            SESSION: {snapshot.session.status.toUpperCase()}
          </div>
        </aside>
      </div>

      <p className="text-xs text-slate-500">
        Эта комната уже хранится в Supabase. Обновление страницы не создаёт новую партию, а серверный снимок остаётся источником состояния.
      </p>
    </section>
  );
};
