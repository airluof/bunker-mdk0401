import React from 'react';
import { Card } from '../types/game';
import { getCardImagePath } from '../data/cards';
import { Flame, AlertOctagon, ZoomIn, ShieldAlert } from 'lucide-react';

interface ActiveCrisesBannerProps {
  crises: Card[];
  currentRound: number;
  onInspectCrisis: (card: Card) => void;
}

export const ActiveCrisesBanner: React.FC<ActiveCrisesBannerProps> = ({
  crises,
  currentRound,
  onInspectCrisis,
}) => {
  if (!crises || crises.length === 0) return null;

  return (
    <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-r from-purple-950/70 via-slate-900/90 to-purple-950/70 p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      {/* Background Accent Grid */}
      <div className="absolute inset-0 bg-tactical-grid opacity-20 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Flame className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-tactical font-bold text-purple-200 uppercase tracking-wide">
                АКТИВНЫЕ СБОИ ЦОД // КРИЗИСЫ
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-purple-500/20 text-purple-300 border border-purple-500/40">
                {crises.length} {crises.length === 1 ? 'УГРОЗА' : 'УГРОЗЫ'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono-tech mt-0.5">
              Инженеры должны обосновать свою пользу против этих аварийных факторов
            </p>
          </div>
        </div>

        <div className="text-[11px] font-mono-tech text-purple-300 flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1 rounded border border-purple-500/30">
          <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
          <span>РАУНД {currentRound}/5</span>
        </div>
      </div>

      {/* Crises Grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {crises.map((crisis, idx) => {
          const imageSrc = getCardImagePath(crisis);
          return (
            <div
              key={crisis.card_id}
              onClick={() => onInspectCrisis(crisis)}
              className="group relative rounded-xl border border-purple-500/40 bg-slate-950/80 p-3 flex gap-3 hover:border-purple-400/80 transition-all cursor-pointer hover:shadow-lg hover:shadow-purple-950/40"
            >
              {/* Crisis Mini Thumbnail */}
              <div className="w-16 h-22 rounded-lg overflow-hidden bg-slate-900 border border-purple-500/30 shrink-0 relative">
                <img
                  src={imageSrc}
                  alt={crisis.original_title}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <span className="absolute bottom-1 right-1 p-0.5 rounded bg-slate-950/80 text-purple-300">
                  <ZoomIn className="w-3 h-3" />
                </span>
              </div>

              {/* Crisis Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono-tech text-purple-400 font-semibold flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3" />
                      #{crisis.card_number || idx + 1}
                    </span>
                    <span className="text-[9px] font-mono-tech text-slate-400 uppercase">
                      {crisis.card_id}
                    </span>
                  </div>
                  <h4 className="text-xs font-tactical font-bold text-slate-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                    {crisis.original_title}
                  </h4>
                  <p className="text-[11px] text-slate-300 line-clamp-2 mt-1 leading-snug">
                    {crisis.source_description}
                  </p>
                </div>

                <div className="mt-2 text-[9px] font-mono-tech text-purple-400/80 flex items-center gap-1">
                  <span>Кликните для детального отчета</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
