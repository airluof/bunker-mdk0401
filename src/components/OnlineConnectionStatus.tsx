import React from 'react';

export type OnlineConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface OnlineConnectionStatusProps {
  status: OnlineConnectionStatus;
}

const LABELS: Record<OnlineConnectionStatus, string> = {
  connecting: 'Подключаемся к комнате',
  connected: 'Связь установлена',
  reconnecting: 'Восстанавливаем связь · состояние обновляется автоматически',
  disconnected: 'Нет связи с обновлениями · пробуем восстановить подключение',
};

export const OnlineConnectionStatusView: React.FC<OnlineConnectionStatusProps> = ({ status }) => (
  <div className={`bunker-connection-status is-${status}`} role="status" aria-live="polite">
    <span className="bunker-connection-dot" aria-hidden="true" />
    <span>{LABELS[status]}</span>
  </div>
);
