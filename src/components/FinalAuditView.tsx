import React, { useState } from 'react';
import { Player, Card, RecoveryPlanStep } from '../types/game';
import { INITIAL_RECOVERY_STEPS } from '../data/cards';
import { 
  FileCheck2, 
  ShieldCheck, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Copy, 
  Check, 
  Download, 
  Award,
  Users,
  Flame,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../services/sound';

interface FinalAuditViewProps {
  survivingPlayers: Player[];
  activeCrises: Card[];
  onRestartGame: () => void;
}

export const FinalAuditView: React.FC<FinalAuditViewProps> = ({
  survivingPlayers,
  activeCrises,
  onRestartGame,
}) => {
  const [steps, setSteps] = useState<RecoveryPlanStep[]>(INITIAL_RECOVERY_STEPS);
  const [copied, setCopied] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string>(steps[0].id);

  const toggleStepVerification = (stepId: string) => {
    sound.playVoteCast();
    setSteps(prev => {
      const next = prev.map(s => s.id === stepId ? { ...s, verified: !s.verified } : s);
      // Trigger confetti if all verified
      if (next.every(s => s.verified)) {
        sound.playVictoryFanfare();
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
      return next;
    });
  };

  const updateStepNotes = (stepId: string, notes: string) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, solutionNotes: notes } : s));
  };

  const allVerified = steps.every(s => s.verified);
  const verifiedCount = steps.filter(s => s.verified).length;

  const generateReportText = () => {
    const lines = [
      '========================================================================',
      'АКТ ПРИЕМО-СДАТОЧНЫХ ИСПЫТАНИЙ И ПЛАН ВОССТАНОВЛЕНИЯ ЦОД «НЕЙРОТЕХ» 2036',
      'СТАНДАРТ: ГОСТ Р ИСО/МЭК 12207 // ДИСЦИПЛИНА МДК.04.01',
      '========================================================================',
      '',
      `1. СОСТАВ ОПЕРАТИВНОЙ ГРУППЫ БУНКЕРА (${survivingPlayers.length} чел.):`,
      ...survivingPlayers.map(p => 
        ` - ${p.name}: [Роль: ${p.hand.roles.original_title}] | [Навык: ${p.hand.skills.original_title}] | [Багаж: ${p.hand.baggage.original_title}] | [Уязвимость: ${p.hand.vulnerabilities.original_title}]`
      ),
      '',
      `2. КАТАЛОГ ПРЕОДОЛЕННЫХ КРИЗИСОВ И СБОЕВ (${activeCrises.length}):`,
      ...activeCrises.map(c => ` - ${c.original_title}: ${c.source_description}`),
      '',
      `3. РЕЕСТР ПРОЦЕССОВ ВОССТАНОВЛЕНИЯ (ГОСТ 12207):`,
      ...steps.map((s, idx) => 
        ` [${s.verified ? 'ВЫПОЛНЕНО' : 'В ПРОЦЕССЕ'}] Этап ${idx + 1}: ${s.gostPhase}\n   Задача: ${s.title}\n   Решение/Назначенные ресурсы: ${s.solutionNotes || 'Обеспечено профильными инженерами Бункера'}`
      ),
      '',
      'ЗАКЛЮЧЕНИЕ: Инфраструктура DRP-Site готова к автономному функционированию.',
      '========================================================================',
    ];
    return lines.join('\n');
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-tactical-grid opacity-20 pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-mono-tech bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                  ФИНАЛЬНЫЙ ЭТАП // РЕЗУЛЬТАТЫ
                </span>
                <span className="text-xs font-mono-tech text-slate-400">
                  МДК.04.01
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-tactical font-bold text-white tracking-wide mt-1">
                ТЕХНИЧЕСКИЙ АУДИТ ВОССТАНОВЛЕНИЯ ИНФРАСТРУКТУРЫ
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Команда сформирована. Составьте пошаговый план реанимации аварийного серверного комплекса корпорации «НейроТех» по ГОСТ Р ИСО/МЭК 12207 с учётом выживших инженеров, их оборудования и уязвимостей.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-tactical text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'СКОПИРОВАНО' : 'СКОПИРОВАТЬ АКТ'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Surviving Team & Active Crises */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Surviving Specialists */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
            <h3 className="text-sm font-tactical font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>ОПЕРАТИВНАЯ КОМАНДА БУНКЕРА ({survivingPlayers.length} ИНЖЕНЕРОВ)</span>
            </h3>
            <span className="text-xs font-mono-tech text-emerald-400">
              Вместимость выполнена
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {survivingPlayers.map((player) => (
              <div
                key={player.id}
                className="p-3 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-slate-700 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-tactical font-bold text-slate-100 text-sm">
                    {player.name}
                  </span>
                  <span className="text-[10px] font-mono-tech text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    В БУНКЕРЕ
                  </span>
                </div>

                <div className="space-y-1 text-[11px] font-mono-tech text-slate-300">
                  <div className="text-sky-300">
                    <span className="text-slate-400">Роль:</span> {player.hand.roles.original_title}
                  </div>
                  <div className="text-emerald-300">
                    <span className="text-slate-400">Навык:</span> {player.hand.skills.original_title}
                  </div>
                  <div className="text-orange-300">
                    <span className="text-slate-400">Багаж:</span> {player.hand.baggage.original_title}
                  </div>
                  <div className="text-rose-300">
                    <span className="text-slate-400">Уязвимость:</span> {player.hand.vulnerabilities.original_title}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overcome Crises */}
        <div className="rounded-2xl border border-purple-500/30 bg-slate-900/90 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
            <h3 className="text-sm font-tactical font-bold text-purple-200 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-400" />
              <span>ПРЕОДОЛЕВАЕМЫЕ КРИЗИСЫ</span>
            </h3>
            <span className="text-xs font-mono-tech text-purple-400">
              {activeCrises.length} угрозы
            </span>
          </div>

          <div className="space-y-2.5">
            {activeCrises.map((crisis) => (
              <div
                key={crisis.card_id}
                className="p-3 rounded-xl border border-purple-500/30 bg-purple-950/20"
              >
                <h4 className="text-xs font-tactical font-bold text-purple-200">
                  {crisis.original_title}
                </h4>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  {crisis.source_description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step-by-Step Restoration Plan per GOST R ISO/IEC 12207 */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-tactical font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-amber-400" />
              <span>ПОШАГОВЫЙ ПЛАН ВОССТАНОВЛЕНИЯ ПО ГОСТ Р ИСО/МЭК 12207</span>
            </h3>
            <p className="text-xs font-mono-tech text-slate-400 mt-0.5">
              Подтвердите выполнение каждого инженерного процесса и зафиксируйте решения
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs font-mono-tech text-slate-300 bg-slate-800 px-3 py-1 rounded-lg">
              Прогресс: <span className="text-amber-400 font-bold">{verifiedCount}/{steps.length}</span> процессов
            </div>
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isSelected = step.id === selectedStepId;
            return (
              <div
                key={step.id}
                className={`rounded-xl border transition-all p-4 ${
                  step.verified
                    ? 'bg-emerald-950/20 border-emerald-500/50'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div 
                    onClick={() => toggleStepVerification(step.id)}
                    className="flex items-start gap-3 cursor-pointer flex-1"
                  >
                    <button className="mt-0.5 text-emerald-400 hover:text-emerald-300 transition-colors">
                      {step.verified ? (
                        <CheckSquare className="w-5 h-5 fill-emerald-500/20" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-500" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono-tech text-amber-400 uppercase">
                          {step.gostPhase}
                        </span>
                        <span className="text-[10px] font-mono-tech text-slate-400">
                          Этап {idx + 1}
                        </span>
                      </div>
                      <h4 className={`text-sm font-tactical font-bold mt-0.5 ${
                        step.verified ? 'text-emerald-200' : 'text-slate-100'
                      }`}>
                        {step.title}
                      </h4>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono-tech ${
                    step.verified 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {step.verified ? 'ВЕРИФИЦИРОВАНО' : 'ТРЕБУЕТСЯ РЕШЕНИЕ'}
                  </span>
                </div>

                {/* Notes Input */}
                <div className="mt-3 pl-8">
                  <input
                    type="text"
                    value={step.solutionNotes}
                    onChange={(e) => updateStepNotes(step.id, e.target.value)}
                    placeholder="Назначенные специалисты, инструменты или комментарий по ГОСТ..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors font-mono-tech"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Final Completion Box */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              allVerified ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'
            }`}>
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-tactical font-bold text-white">
                {allVerified ? 'ПЛАН ВОССТАНОВЛЕНИЯ ПОЛНОСТЬЮ УТВЕРЖДЕН' : 'ЗАПОЛНИТЕ ВСЕ ЭТАПЫ РЕАНИМАЦИИ'}
              </div>
              <p className="text-xs font-mono-tech text-slate-400">
                {allVerified 
                  ? 'Акт готов к сдаче преподавателю и архивации в системе CMDB' 
                  : 'Отметьте процессы и зафиксируйте решения для успешного завершения аудита'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyReport}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-tactical font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>ЭКСПОРТ АКТА ПСИ</span>
            </button>

            <button
              onClick={onRestartGame}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-tactical text-xs uppercase tracking-wider transition-colors border border-slate-700"
            >
              НОВАЯ ПАРТИЯ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
