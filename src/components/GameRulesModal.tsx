import React, { useState } from 'react';
import { 
  X, 
  BookOpen, 
  ShieldAlert, 
  Clock, 
  Vote, 
  FileCheck2, 
  HelpCircle,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { CATEGORY_CONFIG } from '../data/cards';

interface GameRulesModalProps {
  onClose: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'categories' | 'open_questions'>('rules');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-tactical font-bold text-white uppercase tracking-wider">
                РЕГЛАМЕНТ И ПАСПОРТ ИГРЫ «БУНКЕР — МДК.04.01»
              </h2>
              <p className="text-xs font-mono-tech text-slate-400">
                Спецификация аварийного восстановления ЦОД «НейроТех» 2036
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 px-4 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-2.5 px-4 text-xs font-mono-tech uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-sky-400 text-sky-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ОСНОВНЫЕ ПРАВИЛА
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`py-2.5 px-4 text-xs font-mono-tech uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-sky-400 text-sky-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            6 КАТЕГОРИЙ КАРТОЧЕК
          </button>

          <button
            onClick={() => setActiveTab('open_questions')}
            className={`py-2.5 px-4 text-xs font-mono-tech uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'open_questions'
                ? 'border-sky-400 text-sky-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ОТКРЫТЫЕ ВОПРОСЫ (Q-01..Q-26)
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
          {activeTab === 'rules' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <h4 className="text-sm font-tactical font-bold text-amber-300 uppercase mb-1">
                  1. СЕТТИНГ И ЛЕГЕНДА
                </h4>
                <p>
                  2036 год. Главный дата-центр корпорации «НейроТех» подвергся масштабной кибератаке вируса 
                  <strong className="text-white"> «Zero-Day: Oblivion»</strong>. Серверная инфраструктура полностью уничтожена. 
                  Для запуска резервного дата-центра в изолированном Серверном Бункере (DRP-Site) собирается бригада ИТ-специалистов. 
                  Однако ресурсы жизнеобеспечения Бункера ограничены: мест ровно вдвое меньше, чем инженеров!
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <h4 className="text-sm font-tactical font-bold text-sky-300 uppercase mb-1">
                  2. ПОДГОТОВКА И СЕЙФ-ПАКЕТ (СЕТАП)
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li>Каждому инженеру выдается 5 карт: <strong>1 Роль</strong>, <strong>1 Навык</strong>, <strong>1 Багаж</strong>, <strong>1 Уязвимость</strong>, <strong>1 Действие</strong>.</li>
                  <li>На стол выкладывается 1 Кризис (во 2-м и 4-м раундах добавляется еще по одному кризису).</li>
                  <li>Игра длится 5 раундов. В каждом раунде команда выбирает одного участника для отстранения.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <h4 className="text-sm font-tactical font-bold text-emerald-300 uppercase mb-1">
                  3. ФАЗЫ КАЖДОГО РАУНДА
                </h4>
                <div className="space-y-2 mt-2">
                  <div className="flex items-start gap-2">
                    <span className="font-mono-tech font-bold text-sky-400">ФАЗА 1:</span>
                    <span><strong>Вскрытие характеристик.</strong> Игрок раскрывает 1 закрытую карту из своего досье.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono-tech font-bold text-amber-400">ФАЗА 2:</span>
                    <span><strong>Технический брифинг.</strong> 1 минута на аргументацию своей незаменимости с привязкой к активному кризису ЦОД.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono-tech font-bold text-rose-400">ФАЗА 3:</span>
                    <span><strong>Открытое голосование.</strong> Все живые участники одновременно голосуют против кандидата на изгнание.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono-tech font-bold text-purple-400">ФАЗА 4:</span>
                    <span><strong>Изгнание.</strong> Набравший больше всех голосов инженер покидает Бункер.</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <h4 className="text-sm font-tactical font-bold text-yellow-300 uppercase mb-1">
                  4. ФИНАЛ: ПЛАН ПО ГОСТ Р ИСО/МЭК 12207
                </h4>
                <p>
                  После 5 раундов оставшиеся в Бункере специалисты формируют пошаговый план ликвидации последствий аварии и реанимации серверного комплекса, подписывая Акт приемо-сдаточных испытаний (ПСИ).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <div key={key} className={`p-4 rounded-xl border ${cfg.accentBorder} ${cfg.accentBg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-mono-tech uppercase font-bold ${cfg.accentText}`}>
                      {cfg.nameRu} ({cfg.colorName})
                    </span>
                    <span className="text-[10px] font-mono-tech text-slate-400">
                      30 карт
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {cfg.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'open_questions' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/60 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  В соответствии с документом 02_Game_System.md, открытые вопросы Q-01..Q-26 остаются на усмотрение ведущего партии (преподавателя) и не навязываются жестким алгоритмом.
                </span>
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="font-mono-tech text-sky-400 font-bold">Q-01: Порядок вскрытия карт</div>
                  <p className="text-slate-300 text-[11px] mt-0.5">Разрешено свободное вскрытие любой из 5 карт игрока в каждом раунде.</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="font-mono-tech text-sky-400 font-bold">Q-04: Карты Действия</div>
                  <p className="text-slate-300 text-[11px] mt-0.5">Применяются однократно при раскрытии или в фазе брифинга/голосования в соответствии с текстом карточки.</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="font-mono-tech text-sky-400 font-bold">Q-07: Разрешение ничьей при голосовании</div>
                  <p className="text-slate-300 text-[11px] mt-0.5">В случае равенства голосов проводится 30-секундный дебат между кандидатами или решает голос ведущего.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] font-mono-tech text-slate-400">
            МДК.04.01 // ГОСТ Р ИСО/МЭК 12207
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-tactical text-xs uppercase tracking-wider transition-colors"
          >
            ПОНЯТНО
          </button>
        </div>
      </div>
    </div>
  );
};
