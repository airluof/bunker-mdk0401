import React, { useRef, useEffect } from 'react';
import { GameLogEntry } from '../types/game';
import { Terminal, ShieldAlert, Zap, Flame, Vote, UserMinus } from 'lucide-react';

interface IncidentLogProps {
  logs: GameLogEntry[];
}

export const IncidentLog: React.FC<IncidentLogProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const renderIcon = (type: GameLogEntry['type']) => {
    switch (type) {
      case 'crisis': return <Flame aria-hidden="true" />;
      case 'action': return <Zap aria-hidden="true" />;
      case 'vote': return <Vote aria-hidden="true" />;
      case 'elimination': return <UserMinus aria-hidden="true" />;
      case 'reveal': return <ShieldAlert aria-hidden="true" />;
      default: return <Terminal aria-hidden="true" />;
    }
  };

  return (
    <section className="bunker-event-log" aria-labelledby="bunker-event-log-title">
      <header className="bunker-event-log-heading">
        <div>
          <span className="bunker-kicker">История партии</span>
          <h2 id="bunker-event-log-title">Хроника</h2>
        </div>
        <span className="bunker-event-count">{logs.length}</span>
      </header>

      <div className="bunker-event-list">
        {logs.length === 0 ? (
          <p className="bunker-event-empty">Событий пока нет.</p>
        ) : logs.map((log) => (
          <article key={log.id} className={`bunker-event-entry is-${log.type}`}>
            <span className="bunker-event-icon">{renderIcon(log.type)}</span>
            <div className="bunker-event-copy">
              <div className="bunker-event-meta">
                <time>{log.timestamp}</time>
                <span>Раунд {log.round}</span>
                {log.actorName && <strong>{log.actorName}</strong>}
              </div>
              <p>{log.message}</p>
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
};
