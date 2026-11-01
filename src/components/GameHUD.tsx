import React from 'react';
import {
  UPGRADE_SPECS,
  ACHIEVEMENT_SPECS,
  getUpgradeCost,
  canPurchaseUpgrade,
  getAchievementProgress,
  type UpgradeId,
  type UpgradeLevels,
  type AchievementId,
  type AchievementSpec,
  type AchievementProgressInput,
} from '../game/rules';
import type { GamePhase, HudSnapshot } from './GameCanvas';

interface GameHUDProps {
  phase: GamePhase;
  hud: HudSnapshot;
  finalSnapshot: HudSnapshot | null;
  coins: number;
  upgradeLevels: UpgradeLevels;
  unlockedAchievements: AchievementId[];
  achievementProgressInput: AchievementProgressInput;
  activeToast: AchievementSpec | null;
  achievementsOpen: boolean;
  dockCollapsed: boolean;
  muted: boolean;
  onStartGame: () => void;
  onResumeGame: () => void;
  onPauseGame: () => void;
  onRestartGame: () => void;
  onNextStage: () => void;
  onReturnTitle: () => void;
  onBuyUpgrade: (id: UpgradeId) => void;
  onToggleDock: () => void;
  onToggleAchievements: () => void;
  onCycleTimeOfDay: () => void;
  onDismissToast: () => void;
  onToggleMute: () => void;
}

const UPGRADE_ORDER: UpgradeId[] = ['bladeWidth', 'enginePower', 'plowHeat', 'cocoaTank'];

/**
 * Custom code-authored SVG HUD Icons with dark outer silhouette, interior detail, and state fill.
 */
function CocoaMugSocket({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-6 h-6 shrink-0"
      aria-label={filled ? 'Full Warmth Mug' : 'Empty Warmth Socket'}
    >
      <path
        d="M4 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1h1.5a3.5 3.5 0 0 1 0 7H17v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7Z"
        fill="#0c1424"
        stroke="#0c1424"
        strokeWidth="1.5"
      />
      <path
        d="M17 9.5h1.5a1.5 1.5 0 0 1 0 3H17v-3Z"
        fill="none"
        stroke={filled ? '#f6ad55' : '#334155'}
        strokeWidth="2"
      />
      <rect
        x="5.5"
        y="6.5"
        width="10"
        height="12"
        rx="2.5"
        fill={filled ? '#dd6b20' : '#1e293b'}
        stroke={filled ? '#fbd38d' : '#475569'}
        strokeWidth="1.2"
      />
      {filled ? (
        <>
          <path d="M6.5 8.5h8" stroke="#fffaf0" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8.5 3.5c0-1 1-1.5 1-2.5M12.5 3.5c0-1 1-1.5 1-2.5"
            stroke="#fde68a"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path d="M8 10l5 5M13 10l-5 5" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  );
}

function SnowCoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#0c1424" />
      <circle cx="12" cy="12" r="8.5" fill="#f59e0b" stroke="#fef3c7" strokeWidth="1.4" />
      <path
        d="M12 6.5v11M7.2 9.2l9.6 5.6M16.8 9.2l-9.6 5.6"
        stroke="#fffbeb"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UpgradeSvgIcon({ id }: { id: UpgradeId }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#0c1424" />
      {id === 'bladeWidth' && (
        <path
          d="M4 15l4-6h8l4 6H4Zm3-2h10"
          fill="#38bdf8"
          stroke="#e0f2fe"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
      {id === 'enginePower' && (
        <path
          d="M13 4L6 13h5l-1 7 8-9h-5l0-7Z"
          fill="#f59e0b"
          stroke="#fef3c7"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      )}
      {id === 'plowHeat' && (
        <path
          d="M12 4c2.5 3.5 5 6 5 9.5a5 5 0 0 1-10 0C7 10 9.5 7.5 12 4Z"
          fill="#f97316"
          stroke="#ffedd5"
          strokeWidth="1.4"
        />
      )}
      {id === 'cocoaTank' && (
        <path
          d="M7 7h8v9a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V7Zm8 2h2a1.5 1.5 0 0 1 0 3h-2"
          fill="#eab308"
          stroke="#fef9c3"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

/**
 * Custom code-authored SVG Achievement Badge Icon with dark outer silhouette,
 * distinct emblem geometry per milestone, and unlocked/locked state fills.
 */
function AchievementBadgeIcon({
  id,
  unlocked,
  size = 'sm',
}: {
  id: AchievementId;
  unlocked: boolean;
  size?: 'sm' | 'lg';
}) {
  const dim = size === 'lg' ? 'w-11 h-11' : 'w-7 h-7';
  const shieldFill = unlocked ? '#b45309' : '#1e293b';
  const rimStroke = unlocked ? '#fcd34d' : '#475569';
  const glyphFill = unlocked ? '#fef3c7' : '#64748b';
  const accentFill = unlocked ? '#38bdf8' : '#334155';

  return (
    <svg
      viewBox="0 0 28 28"
      className={`${dim} shrink-0`}
      aria-label={`${id} badge ${unlocked ? 'unlocked' : 'locked'}`}
    >
      {/* Dark outer shield silhouette */}
      <polygon
        points="14,1.5 25,6.5 25,16.5 14,26.5 3,16.5 3,6.5"
        fill="#090f1c"
        stroke="#090f1c"
        strokeWidth="1.5"
      />
      {/* Inner metallic crest */}
      <polygon
        points="14,3 23.5,7.4 23.5,16 14,24.8 4.5,16 4.5,7.4"
        fill={shieldFill}
        stroke={rimStroke}
        strokeWidth="1.5"
      />
      {/* Top specular highlight */}
      {unlocked && (
        <polyline
          points="6.5,8.5 14,4.8 21.5,8.5"
          fill="none"
          stroke="#fffbeb"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
      {/* Milestone-specific interior glyph */}
      {id === 'first_drift' && (
        <path
          d="M7.5 17.5L11 11h6l3.5 6.5H7.5Z"
          fill={accentFill}
          stroke={glyphFill}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      )}
      {id === 'combo_5x' && (
        <path
          d="M15 6.5L9.5 14.5h4.2l-1 7 5.8-8h-4.2l.7-7Z"
          fill={glyphFill}
          stroke={rimStroke}
          strokeWidth="0.9"
        />
      )}
      {id === 'combo_10x' && (
        <>
          <polygon
            points="14,6 16.4,11.2 22,11.8 17.8,15.5 19,21 14,18 9,21 10.2,15.5 6,11.8 11.6,11.2"
            fill={unlocked ? '#f97316' : '#334155'}
            stroke={glyphFill}
            strokeWidth="1.2"
          />
          <circle cx="14" cy="14" r="2.3" fill={glyphFill} />
        </>
      )}
      {id === 'clear_85' && (
        <path
          d="M9 14.5l3.2 3.2 6.8-6.8"
          fill="none"
          stroke={glyphFill}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {id === 'clear_100' && (
        <>
          <path
            d="M7.5 18.5L9 10.5l5 3.5 5-3.5 1.5 8H7.5Z"
            fill={unlocked ? '#38bdf8' : '#334155'}
            stroke={glyphFill}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="14" cy="8.5" r="1.4" fill={glyphFill} />
        </>
      )}
      {id === 'alpine_mechanic' && (
        <circle
          cx="14"
          cy="14"
          r="4.5"
          fill="none"
          stroke={glyphFill}
          strokeWidth="2.4"
          strokeDasharray="3 1.8"
        />
      )}
      {id === 'hazard_rammer' && (
        <polygon
          points="14,7 20,14 14,21 8,14"
          fill={accentFill}
          stroke={glyphFill}
          strokeWidth="1.3"
        />
      )}
    </svg>
  );
}

export default function GameHUD({
  phase,
  hud,
  finalSnapshot,
  coins,
  upgradeLevels,
  unlockedAchievements,
  achievementProgressInput,
  activeToast,
  achievementsOpen,
  dockCollapsed,
  muted,
  onStartGame,
  onResumeGame,
  onPauseGame,
  onRestartGame,
  onNextStage,
  onReturnTitle,
  onBuyUpgrade,
  onToggleDock,
  onToggleAchievements,
  onCycleTimeOfDay,
  onDismissToast,
  onToggleMute,
}: GameHUDProps) {
  const modalStats = finalSnapshot || hud;
  const unlockedSet = new Set<AchievementId>(unlockedAchievements);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-4 md:p-6">
      {/* =====================================================================
          1. TITLE SCREEN OVERLAY (Asymmetric Left-Third Negative Space Stage)
         ===================================================================== */}
      {phase === 'title' && (
        <div className="flex-1 flex flex-col justify-between">
          <div className="max-w-md w-full mt-4 md:mt-8 hud-panel rounded-2xl p-6 md:p-8 pointer-events-auto">
            <svg
              viewBox="0 0 360 118"
              className="w-full h-auto mb-5"
              role="img"
              aria-label="Frostpine Plow: Cozy Alpine Snow Clearing"
            >
              <rect
                x="4"
                y="6"
                width="352"
                height="106"
                rx="16"
                fill="#18253d"
                stroke="#eab354"
                strokeWidth="3"
              />
              <rect
                x="11"
                y="13"
                width="338"
                height="92"
                rx="11"
                fill="#0f1829"
                stroke="#38bdf8"
                strokeWidth="1.2"
                strokeDasharray="6 4"
              />
              <polygon points="36,88 72,34 108,88" fill="#1e3a5f" />
              <polygon points="72,34 58,55 86,55" fill="#e2f1ff" />
              <path
                d="M26 84 L58 64 L96 64 L88 92 L26 92 Z"
                fill="#e65336"
                stroke="#fbd38d"
                strokeWidth="2"
              />
              <path
                d="M88 60 Q106 76 92 94 L106 94 Q118 76 102 60 Z"
                fill="#bae6fd"
              />
              <text
                x="122"
                y="58"
                fill="#f8fafc"
                fontFamily="Outfit, sans-serif"
                fontWeight="800"
                fontSize="30"
                letterSpacing="1"
              >
                FROSTPINE
              </text>
              <text
                x="122"
                y="88"
                fill="#f6ad55"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="24"
                letterSpacing="2.5"
              >
                SNOW PLOW
              </text>
            </svg>

            <p className="text-slate-200 text-sm md:text-base leading-relaxed mb-6">
              Drive your heated snowplow through Frostpine Hollow, chain 10x snowdrift combos,
              unlock milestone badges, and upgrade your rig at the cozy alpine garage.
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStartGame();
                }}
                className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 active:translate-y-0.5 text-slate-950 font-display font-bold text-lg tracking-wide transition-transform cursor-pointer whitespace-nowrap shrink-0 shadow-lg"
              >
                Start Plowing Shift
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleAchievements();
                  }}
                  className="py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-200 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 border border-amber-500/40"
                >
                  Badges ({unlockedAchievements.length}/{ACHIEVEMENT_SPECS.length})
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  className="py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 border border-slate-600/50"
                >
                  {muted ? 'Unmute Audio (M)' : 'Audio On (M)'}
                </button>
              </div>
            </div>
          </div>

          <div className="w-full text-center pb-1">
            <p className="inline-block px-4 py-1.5 rounded-lg hud-caption-badge text-xs md:text-sm font-medium text-slate-100 tracking-wide">
              WASD / Arrows Drive &nbsp;·&nbsp; Space Boost &nbsp;·&nbsp; 1–4 Upgrades &nbsp;·&nbsp; T Achievements &nbsp;·&nbsp; Esc Pause
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. PLAYING HUD (World-Matched Perimeter Clusters, >= 85% Clear Center)
         ===================================================================== */}
      {phase !== 'title' && (
        <>
          {/* TOP PERIMETER BAR */}
          <div className="flex items-start justify-between gap-4 w-full">
            {/* Top-Left Cluster: Warmth Vitality Sockets + Score + Coins + Combo + Achievement Badges */}
            <div className="flex flex-col gap-2">
              <div className="hud-panel rounded-xl px-4 py-3 flex items-center gap-5">
                <div>
                  <div className="text-[11px] font-bold tracking-wider uppercase text-amber-300/90 mb-1">
                    WARMTH
                  </div>
                  <div
                    className="flex items-center gap-1"
                    aria-label={`Warmth: ${hud.warmth} of ${hud.maxWarmth}`}
                  >
                    {Array.from({ length: hud.maxWarmth }).map((_, idx) => (
                      <CocoaMugSocket key={idx} filled={idx < hud.warmth} />
                    ))}
                  </div>
                </div>

                <div className="h-8 w-px bg-slate-700/80" />

                <div>
                  <div className="text-[11px] font-bold tracking-wider uppercase text-slate-300">
                    SCORE
                  </div>
                  <div
                    className="font-mono-tabular font-bold text-2xl md:text-3xl text-white hud-stroke leading-none"
                    data-testid="hud-score"
                  >
                    {Math.round(hud.score)}
                  </div>
                </div>

                <div className="h-8 w-px bg-slate-700/80" />

                <div>
                  <div className="text-[11px] font-bold tracking-wider uppercase text-amber-300">
                    COINS
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SnowCoinIcon />
                    <span
                      className="font-mono-tabular font-bold text-2xl md:text-3xl text-amber-300 hud-stroke leading-none"
                      data-testid="hud-coins"
                    >
                      {Math.round(coins)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Combo Multiplier Meter */}
              <div className="hud-panel-warm rounded-xl px-4 py-2 flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2 whitespace-nowrap shrink-0">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-amber-200">
                    COMBO
                  </span>
                  <span
                    className="font-mono-tabular font-extrabold text-xl md:text-2xl text-amber-400 hud-stroke"
                    data-testid="hud-combo"
                  >
                    {hud.comboMultiplier.toFixed(1)}x
                  </span>
                  <span className="font-mono-tabular text-xs text-slate-300 whitespace-nowrap">
                    ({hud.comboCount} drifts)
                  </span>
                </div>
                <div className="w-24 h-2.5 bg-slate-900 rounded-full overflow-hidden border border-amber-500/40 shrink-0">
                  <div
                    className="h-full bg-amber-400 transition-transform duration-75 origin-left"
                    style={{ transform: `scaleX(${hud.comboTimerRatio})` }}
                  />
                </div>
              </div>

              {/* On-HUD Achievement Badges Strip (Clickable to open Achievement Overlay) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-achievements-btn"
                aria-label={`Open Achievements Overlay (${unlockedAchievements.length} of ${ACHIEVEMENT_SPECS.length} unlocked)`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAchievements();
                }}
                className="pointer-events-auto hud-panel rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 hover:border-amber-400 transition-colors cursor-pointer text-left"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-amber-300 whitespace-nowrap">
                    BADGES [T]
                  </span>
                  <span
                    className="font-mono-tabular text-xs font-bold text-slate-200 whitespace-nowrap"
                    data-testid="hud-badge-count"
                  >
                    {unlockedAchievements.length}/{ACHIEVEMENT_SPECS.length} Unlocked
                  </span>
                </div>
                <div className="flex items-center gap-1" data-testid="hud-badge-strip">
                  {ACHIEVEMENT_SPECS.map((spec) => (
                    <div
                      key={spec.id}
                      title={`${spec.title}: ${spec.milestoneText} (${
                        unlockedSet.has(spec.id) ? 'Unlocked' : 'Locked'
                      })`}
                    >
                      <AchievementBadgeIcon
                        id={spec.id}
                        unlocked={unlockedSet.has(spec.id)}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </button>
            </div>

              {/* Top-Center Cluster: Stage Clear Progress, Time-of-Day & Live Achievement Toast */}
            <div className="hidden sm:flex flex-col items-center gap-2">
              <div className="flex flex-col items-center hud-panel rounded-xl px-5 py-2.5 min-w-[330px]">
                <div className="flex items-center justify-between gap-6 w-full text-xs font-bold tracking-wider uppercase text-slate-200 mb-0.5 whitespace-nowrap">
                  <span>STAGE {hud.stage} · PLAZA</span>
                  <span className="font-mono-tabular text-sky-300" data-testid="hud-clear-pct">
                    {hud.clearPct}% / {hud.targetPct}% CLEARED
                  </span>
                </div>
                <div
                  className="w-full text-left text-[10px] font-semibold tracking-wider uppercase text-amber-300/95 mb-1.5"
                  data-testid="hud-time-of-day"
                >
                  SKY: {hud.timeOfDayLabel} [C]
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-sky-400/40 mb-2">
                  <div
                    className="h-full bg-sky-400 transition-all duration-150"
                    style={{ width: `${Math.min(100, hud.clearPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between w-full text-[11px] text-slate-300 gap-4">
                  <span>BOOST [SPACE]</span>
                  <div className="w-28 h-2 bg-slate-950 rounded-full overflow-hidden border border-amber-400/40">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${Math.round(hud.boostCharge * 100)}%` }}
                    />
                  </div>
                </div>

                {hud.stageTargetReached && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onNextStage();
                    }}
                    className="pointer-events-auto mt-2.5 w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap"
                  >
                    Advance to Stage {hud.stage + 1} [N] (Or Plow to 100%!)
                  </button>
                )}
              </div>

              {/* Celebratory Achievement Unlocked Toast Banner */}
              {activeToast && !achievementsOpen && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="achievement-toast"
                  onClick={onDismissToast}
                  className="pointer-events-auto hud-panel-warm rounded-xl px-4 py-2.5 flex items-center gap-3.5 border-2 border-amber-400 cursor-pointer max-w-md"
                >
                  <AchievementBadgeIcon id={activeToast.id} unlocked={true} size="lg" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                      ACHIEVEMENT UNLOCKED · +{activeToast.rewardCoins} COINS
                    </span>
                    <span className="font-display font-bold text-sm text-white truncate">
                      {activeToast.title} — {activeToast.milestoneText}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right Utility Controls (Time-of-Day [C], Achievements [T], Mute [M], Pause [P], Restart [R]) */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Cycle Time of Day (${hud.timeOfDayLabel}) [C]`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleTimeOfDay();
                }}
                className="hud-panel w-11 h-11 rounded-xl flex items-center justify-center hover:border-amber-400 text-sky-300 cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Achievements Overlay (T)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAchievements();
                }}
                className="hud-panel w-11 h-11 rounded-xl flex items-center justify-center hover:border-amber-400 text-amber-300 cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="hud-panel w-11 h-11 rounded-xl flex items-center justify-center hover:border-amber-400 text-slate-100 cursor-pointer transition-colors"
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Game (P)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onPauseGame();
                }}
                className="hud-panel w-11 h-11 rounded-xl flex items-center justify-center hover:border-amber-400 text-slate-100 cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Restart Shift (R)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestartGame();
                }}
                className="hud-panel w-11 h-11 rounded-xl flex items-center justify-center hover:border-amber-400 text-slate-100 cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </div>

          {/* BOTTOM UNIFIED COLLAPSIBLE UPGRADE & GARAGE DOCK */}
          <div className="w-full flex flex-col items-center pointer-events-none">
            <div className="mb-2 px-3.5 py-1 rounded-lg hud-caption-badge text-xs md:text-sm font-medium text-amber-200 text-center">
              {hud.statusMessage}
            </div>

            <div className="pointer-events-auto flex flex-col items-center w-full max-w-[960px]">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleDock();
                }}
                className="hud-panel px-4 py-1 rounded-t-xl border-b-0 text-xs font-semibold text-amber-200 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                {dockCollapsed ? '▴ Show Plow Upgrades [H]' : '▾ Hide Plow Upgrades [H]'}
              </button>

              {!dockCollapsed && (
                <div className="hud-panel rounded-2xl p-2.5 w-full grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {UPGRADE_ORDER.map((id) => {
                    const spec = UPGRADE_SPECS[id];
                    const lvl = upgradeLevels[id];
                    const isMax = lvl >= spec.maxLevel;
                    const cost = getUpgradeCost(id, lvl);
                    const affordable = canPurchaseUpgrade(id, upgradeLevels, coins);

                    return (
                      <button
                        key={id}
                        type="button"
                        tabIndex={-1}
                        disabled={!affordable || isMax}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onBuyUpgrade(id);
                        }}
                        className={`flex flex-col justify-between p-2.5 rounded-xl text-left transition-transform ${
                          affordable && !isMax
                            ? 'bg-slate-800/95 hover:bg-slate-700/95 border border-amber-400/60 cursor-pointer active:scale-98'
                            : 'bg-slate-900/80 border border-slate-700/50 opacity-75 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <UpgradeSvgIcon id={id} />
                            <span className="font-display font-bold text-xs md:text-sm text-white truncate">
                              {spec.name}
                            </span>
                          </div>
                          <span className="font-mono-tabular text-[11px] font-bold text-sky-300 shrink-0">
                            [{spec.keyHint}] Lv.{lvl}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-300 truncate mb-2">
                          {spec.roleClue}
                        </div>

                        <div className="flex items-center justify-between w-full pt-1 border-t border-slate-700/60">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {isMax ? 'MAXED' : 'UPGRADE'}
                          </span>
                          <span
                            className={`font-mono-tabular text-xs font-bold ${
                              isMax
                                ? 'text-emerald-400'
                                : affordable
                                ? 'text-amber-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {isMax ? 'MAX' : `${cost} Coins`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          3. ACHIEVEMENT OVERLAY MODAL (Toggled via [T] or HUD Badge Strip)
         ===================================================================== */}
      {achievementsOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/85 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="achievements-modal-title"
            data-testid="achievements-overlay"
            className="bg-[#1b1412] border-2 border-amber-500/60 shadow-2xl rounded-2xl p-6 max-w-3xl w-full flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-0.5">
                  FROSTPINE HALL OF MERIT · {unlockedAchievements.length}/{ACHIEVEMENT_SPECS.length}{' '}
                  UNLOCKED
                </div>
                <h2
                  id="achievements-modal-title"
                  className="font-display font-extrabold text-2xl text-white"
                >
                  Plowing Achievements &amp; Badges
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Earn milestone badges during your shift for instant bonus coins. Unlocked badges
                  shine directly on your GameHUD.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Achievements Overlay"
                onClick={onToggleAchievements}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0 border border-slate-600/60"
              >
                Close [T]
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {ACHIEVEMENT_SPECS.map((spec) => {
                const isUnlocked = unlockedSet.has(spec.id);
                const prog = getAchievementProgress(spec.id, achievementProgressInput);

                return (
                  <div
                    key={spec.id}
                    data-testid={`achievement-card-${spec.id}`}
                    className={`rounded-xl p-3 flex items-start gap-3 border ${
                      isUnlocked
                        ? 'bg-[#131e33] border-amber-400'
                        : 'bg-[#0d1524] border-slate-700/80'
                    }`}
                  >
                    <AchievementBadgeIcon id={spec.id} unlocked={isUnlocked} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-display font-bold text-sm text-white truncate">
                          {spec.title}
                        </span>
                        <span
                          className={`font-mono-tabular text-[11px] font-bold shrink-0 ${
                            isUnlocked ? 'text-emerald-300' : 'text-amber-300'
                          }`}
                        >
                          {isUnlocked ? 'UNLOCKED' : `+${spec.rewardCoins}c`}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-300 mt-0.5 mb-2 truncate">
                        {spec.milestoneText}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-400 mb-1">
                        <span>Progress</span>
                        <span>
                          {Math.round(prog.current)}
                          {spec.unitSuffix} / {spec.targetValue}
                          {spec.unitSuffix}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
                        <div
                          className={`h-full ${isUnlocked ? 'bg-amber-400' : 'bg-sky-400'}`}
                          style={{ width: `${Math.round(prog.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onToggleAchievements}
                className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer whitespace-nowrap shrink-0"
              >
                Back to Plowing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. SINGLE FOCUSED STATUS MODAL CARD (PAUSED / VICTORY / GAME OVER)
         ===================================================================== */}
      {(phase === 'paused' || phase === 'gameover') && !achievementsOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/75 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-status-title"
            className="hud-panel-warm rounded-2xl p-6 md:p-8 max-w-md w-full flex flex-col gap-5"
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-1">
                {phase === 'paused'
                  ? `STAGE ${modalStats.stage} · SHIFT PAUSED`
                  : modalStats.victory
                  ? `STAGE ${modalStats.stage} COMPLETE`
                  : 'THERMOS DEPLETED'}
              </div>
              <h2
                id="modal-status-title"
                className="font-display font-extrabold text-2xl md:text-3xl text-white"
              >
                {phase === 'paused'
                  ? 'Alpine Garage Break'
                  : modalStats.victory
                  ? 'Frostpine Plaza 100% Cleared!'
                  : 'Chilled Out in the Snow!'}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                {phase === 'paused'
                  ? 'Take a breather, check your Achievement Badges, or upgrade your snowplow.'
                  : modalStats.victory
                  ? 'Every last snowdrift is spotless! Ready to plow the next heavier snowfall?'
                  : 'Your cocoa thermos ran cold. Warm up at the lodge and try the shift again!'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-slate-400">SCORE</div>
                <div className="font-mono-tabular font-bold text-xl text-white mt-0.5">
                  {Math.round(modalStats.score)}
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-slate-400">CLEARED</div>
                <div className="font-mono-tabular font-bold text-xl text-sky-300 mt-0.5">
                  {modalStats.clearPct}%
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-slate-400">PEAK COMBO</div>
                <div className="font-mono-tabular font-bold text-xl text-amber-300 mt-0.5">
                  {modalStats.peakMultiplier.toFixed(1)}x
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {phase === 'paused' ? (
                <>
                  <button
                    type="button"
                    onClick={onResumeGame}
                    className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Resume Plowing (Esc)
                  </button>
                  <button
                    type="button"
                    onClick={onToggleAchievements}
                    className="w-full py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-200 font-semibold text-sm cursor-pointer whitespace-nowrap shrink-0 border border-amber-500/40"
                  >
                    View Achievements ({unlockedAchievements.length}/{ACHIEVEMENT_SPECS.length})
                  </button>
                  <button
                    type="button"
                    onClick={onRestartGame}
                    className="w-full py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm cursor-pointer whitespace-nowrap shrink-0 border border-slate-600/60"
                  >
                    Restart Shift
                  </button>
                  <button
                    type="button"
                    onClick={onReturnTitle}
                    className="w-full py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-sm cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Title Screen
                  </button>
                </>
              ) : modalStats.victory ? (
                <>
                  <button
                    type="button"
                    data-start="true"
                    onClick={onNextStage}
                    className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Next Stage · Snowfall {modalStats.stage + 1}
                  </button>
                  <button
                    type="button"
                    onClick={onRestartGame}
                    className="w-full py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm cursor-pointer whitespace-nowrap shrink-0 border border-slate-600/60"
                  >
                    Replay Stage 1
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-start="true"
                    onClick={onRestartGame}
                    className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Try Shift Again
                  </button>
                  <button
                    type="button"
                    onClick={onReturnTitle}
                    className="w-full py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Title Screen
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
