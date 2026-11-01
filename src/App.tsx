/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import GameCanvas, { type GamePhase, type HudSnapshot } from './components/GameCanvas';
import GameHUD from './components/GameHUD';
import {
  purchaseUpgrade,
  evaluateAchievements,
  type UpgradeId,
  type UpgradeLevels,
  type AchievementId,
  type AchievementSpec,
  type AchievementProgressInput,
} from './game/rules';
import { synthAudio } from './game/audio';

const INITIAL_UPGRADES: UpgradeLevels = {
  bladeWidth: 1,
  enginePower: 1,
  plowHeat: 1,
  cocoaTank: 1,
};

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  bestScore: 0,
  coins: 40,
  stage: 1,
  clearPct: 0,
  targetPct: 85,
  warmth: 3,
  maxWarmth: 3,
  comboCount: 0,
  comboMultiplier: 1,
  comboTimerRatio: 0,
  peakMultiplier: 1,
  boostCharge: 1,
  nearCocoaPad: false,
  victory: false,
  stageTargetReached: false,
  totalDriftsCleared: 0,
  hazardsRammed: 0,
  timeOfDayId: 'morning',
  timeOfDayLabel: 'Crisp Alpine Morning',
  statusMessage:
    'Clear 85% of the plaza (or 100% for the Perfectionist badge)! Chain drifts for a 10x Combo!',
};

export default function App() {
  const [phase, setPhase] = useState<GamePhase>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'playing';
      }
    }
    return 'title';
  });

  const [upgradeLevels, setUpgradeLevels] = useState<UpgradeLevels>(INITIAL_UPGRADES);
  const [totalUpgradesBought, setTotalUpgradesBought] = useState<number>(0);
  const [coins, setCoins] = useState<number>(40);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [finalSnapshot, setFinalSnapshot] = useState<HudSnapshot | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementId[]>([]);
  const [activeToast, setActiveToast] = useState<AchievementSpec | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [timeOfDayOffset, setTimeOfDayOffset] = useState<number>(0);
  const [resetToken, setResetToken] = useState<number>(0);
  const [stageToken, setStageToken] = useState<number>(0);

  const unlockedRef = useRef<AchievementId[]>([]);
  unlockedRef.current = unlockedAchievements;

  const upgradesBoughtRef = useRef<number>(0);
  upgradesBoughtRef.current = totalUpgradesBought;

  const toastTimerRef = useRef<number>(0);

  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  const checkAndTriggerAchievements = useCallback((input: AchievementProgressInput) => {
    const evalResult = evaluateAchievements(unlockedRef.current, input);
    if (evalResult.newlyUnlocked.length > 0) {
      unlockedRef.current = evalResult.updatedUnlocked;
      setUnlockedAchievements(evalResult.updatedUnlocked);
      setCoins((c) => c + evalResult.bonusCoins);
      synthAudio.playAchievementUnlock();

      const latest = evalResult.newlyUnlocked[evalResult.newlyUnlocked.length - 1];
      setActiveToast(latest);
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 4500);
    }
  }, []);

  const handleHudUpdate = useCallback(
    (nextHud: HudSnapshot) => {
      setHud(nextHud);
      checkAndTriggerAchievements({
        totalDriftsCleared: nextHud.totalDriftsCleared,
        clearPct: nextHud.clearPct,
        peakComboMultiplier: nextHud.peakMultiplier,
        totalUpgradesBought: upgradesBoughtRef.current,
        hazardsRammed: nextHud.hazardsRammed,
      });
    },
    [checkAndTriggerAchievements]
  );

  const handleStartGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFinalSnapshot(null);
    setAchievementsOpen(false);
    setPhase('playing');
    synthAudio.playUpgrade();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (phase === 'title' && !achievementsOpen && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartGame();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, achievementsOpen, handleStartGame]);

  const handlePhaseChange = useCallback(
    (nextPhase: GamePhase, snapshot?: HudSnapshot) => {
      if (snapshot) {
        setFinalSnapshot(snapshot);
        checkAndTriggerAchievements({
          totalDriftsCleared: snapshot.totalDriftsCleared,
          clearPct: snapshot.clearPct,
          peakComboMultiplier: snapshot.peakMultiplier,
          totalUpgradesBought: upgradesBoughtRef.current,
          hazardsRammed: snapshot.hazardsRammed,
        });
      }
      setPhase(nextPhase);
    },
    [checkAndTriggerAchievements]
  );

  const handleAwardCoins = useCallback((deltaCoins: number) => {
    setCoins((prev) => prev + deltaCoins);
  }, []);

  const handleBuyUpgrade = useCallback(
    (id: UpgradeId) => {
      setCoins((currentCoins) => {
        const res = purchaseUpgrade(id, upgradeLevels, currentCoins);
        if (res.purchased) {
          setUpgradeLevels(res.levels);
          const nextBought = upgradesBoughtRef.current + 1;
          upgradesBoughtRef.current = nextBought;
          setTotalUpgradesBought(nextBought);
          synthAudio.playUpgrade();

          checkAndTriggerAchievements({
            totalDriftsCleared: hud.totalDriftsCleared,
            clearPct: hud.clearPct,
            peakComboMultiplier: hud.peakMultiplier,
            totalUpgradesBought: nextBought,
            hazardsRammed: hud.hazardsRammed,
          });

          return res.coins;
        }
        return currentCoins;
      });
    },
    [upgradeLevels, hud, checkAndTriggerAchievements]
  );

  const handleQuickUpgradeKey = useCallback(
    (slot: 1 | 2 | 3 | 4) => {
      const map: Record<1 | 2 | 3 | 4, UpgradeId> = {
        1: 'bladeWidth',
        2: 'enginePower',
        3: 'plowHeat',
        4: 'cocoaTank',
      };
      handleBuyUpgrade(map[slot]);
    },
    [handleBuyUpgrade]
  );

  const handleRestartGame = useCallback(() => {
    setFinalSnapshot(null);
    setAchievementsOpen(false);
    setResetToken((t) => t + 1);
    setPhase('playing');
  }, []);

  const handleNextStage = useCallback(() => {
    setFinalSnapshot(null);
    setAchievementsOpen(false);
    setStageToken((t) => t + 1);
    setPhase('playing');
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      synthAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleDock = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  const handleToggleAchievements = useCallback(() => {
    setAchievementsOpen((prev) => !prev);
  }, []);

  const handleCycleTimeOfDay = useCallback(() => {
    setTimeOfDayOffset((prev) => (prev + 1) % 4);
    synthAudio.playCocoaRefill();
  }, []);

  const achievementProgressInput: AchievementProgressInput = {
    totalDriftsCleared: hud.totalDriftsCleared,
    clearPct: hud.clearPct,
    peakComboMultiplier: hud.peakMultiplier,
    totalUpgradesBought,
    hazardsRammed: hud.hazardsRammed,
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#111b2e]">
      <GameCanvas
        phase={phase}
        upgradeLevels={upgradeLevels}
        timeOfDayOffset={timeOfDayOffset}
        resetToken={resetToken}
        stageToken={stageToken}
        onHudUpdate={handleHudUpdate}
        onAwardCoins={handleAwardCoins}
        onPhaseChange={handlePhaseChange}
        onQuickUpgradeKey={handleQuickUpgradeKey}
        onToggleDock={handleToggleDock}
        onToggleAchievements={handleToggleAchievements}
        onCycleTimeOfDay={handleCycleTimeOfDay}
        onToggleMute={handleToggleMute}
        onNextStageShortcut={handleNextStage}
      />
      <GameHUD
        phase={phase}
        hud={hud}
        finalSnapshot={finalSnapshot}
        coins={coins}
        upgradeLevels={upgradeLevels}
        unlockedAchievements={unlockedAchievements}
        achievementProgressInput={achievementProgressInput}
        activeToast={activeToast}
        achievementsOpen={achievementsOpen}
        dockCollapsed={dockCollapsed}
        muted={muted}
        onStartGame={handleStartGame}
        onResumeGame={() => setPhase('playing')}
        onPauseGame={() => setPhase('paused')}
        onRestartGame={handleRestartGame}
        onNextStage={handleNextStage}
        onReturnTitle={() => setPhase('title')}
        onBuyUpgrade={handleBuyUpgrade}
        onToggleDock={handleToggleDock}
        onToggleAchievements={handleToggleAchievements}
        onCycleTimeOfDay={handleCycleTimeOfDay}
        onDismissToast={() => setActiveToast(null)}
        onToggleMute={handleToggleMute}
      />
    </main>
  );
}
