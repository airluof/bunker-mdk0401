import React, { useRef, useEffect } from 'react';
import { GameLogEntry } from '../types/game';
import { Terminal, ShieldAlert, Zap, Flame, Vote, UserMinus, FileText } from 'lucide-react';

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
      case 'crisis': return <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      case 'action': return <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'vote': return <Vote className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'elimination': return <UserMinus className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'reveal': return <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default: return <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl flex flex-col h-64 sm:h-72">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-tactical font-bold text-white uppercase tracking-wider">
            СИСТЕМНЫЙ ЛОГ ИНЦИДЕНТОВ // DRP-LOG
          </h4>
        </div>
        <span className="text-[10px] font-mono-tech text-slate-400">
          Событий: {logs.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono-tech text-xs">
        {logs.map((log) => (
          <div
            key={log.id}
            className="p-2 rounded bg-slate-950/70 border border-slate-800/80 flex items-start gap-2 text-slate-300 leading-snug"
          >
            <div className="mt-0.5">{renderIcon(log.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>[{log.timestamp}]</span>
                <span>Р.{log.round}</span>
                {log.actorName && (
                  <span className="text-amber-300 font-semibold truncate">
                    {log.actorName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-200 mt-0.5 break-words">
                {log.message}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
