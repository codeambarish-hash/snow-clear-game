import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUpgradeCost,
  canPurchaseUpgrade,
  purchaseUpgrade,
  computePlowStats,
  computeComboMultiplier,
  registerSnowCleared,
  tickComboTimer,
  calculateClearPercentage,
  checkStageComplete,
  updateHazardEntity,
  evaluateAchievements,
  getAchievementProgress,
  getStageTimeOfDayPalette,
  stepSnowflakeParticle,
  type UpgradeLevels,
  type ComboState,
  type HazardEntity,
} from './rules';

test('upgrade cost scales and purchase deducts coins and increments level', () => {
  const initialLevels: UpgradeLevels = {
    bladeWidth: 1,
    enginePower: 1,
    plowHeat: 1,
    cocoaTank: 1,
  };
  const cost = getUpgradeCost('bladeWidth', 1);
  assert.equal(cost, 25);
  assert.equal(canPurchaseUpgrade('bladeWidth', initialLevels, 20), false);
  assert.equal(canPurchaseUpgrade('bladeWidth', initialLevels, 25), true);

  const res = purchaseUpgrade('bladeWidth', initialLevels, 60);
  assert.equal(res.purchased, true);
  assert.equal(res.costPaid, 25);
  assert.equal(res.coins, 35);
  assert.equal(res.levels.bladeWidth, 2);

  const statsBefore = computePlowStats(initialLevels);
  const statsAfter = computePlowStats(res.levels);
  assert.ok(statsAfter.bladeRadius > statsBefore.bladeRadius);
});

test('combo multiplier reaches 10x and decays when timer expires', () => {
  const initialCombo: ComboState = {
    count: 0,
    multiplier: 1,
    timer: 0,
    maxTimer: 3.4,
    peakMultiplier: 1,
  };

  assert.equal(computeComboMultiplier(0), 1);
  assert.equal(computeComboMultiplier(4), 1.5);
  assert.equal(computeComboMultiplier(8), 2.0);
  assert.equal(computeComboMultiplier(72), 10.0);

  const step1 = registerSnowCleared(initialCombo, 4, 3.5);
  assert.equal(step1.combo.count, 4);
  assert.equal(step1.combo.multiplier, 1.5);
  assert.ok(step1.pointsEarned > 0);

  const step2 = registerSnowCleared(step1.combo, 4, 3.5);
  assert.equal(step2.combo.multiplier, 2.0);
  assert.equal(step2.milestoneReached, true);

  const tickedPartial = tickComboTimer(step2.combo, 1.0);
  assert.equal(tickedPartial.count, 8);
  assert.equal(tickedPartial.timer, 2.5);

  const tickedExpired = tickComboTimer(tickedPartial, 3.0);
  assert.equal(tickedExpired.count, 0);
  assert.equal(tickedExpired.multiplier, 1);
  assert.equal(tickedExpired.peakMultiplier, 2.0);
});

test('stage clear percentage and win condition trigger at target threshold', () => {
  assert.equal(calculateClearPercentage(42, 100), 42);
  assert.equal(checkStageComplete(84, 100, 85), false);
  assert.equal(checkStageComplete(85, 100, 85), true);
  assert.equal(checkStageComplete(100, 100, 100), true);
});

test('achievement evaluation unlocks 10x combo and 100% level clear badges without duplicate rewards', () => {
  const initialInput = {
    totalDriftsCleared: 12,
    clearPct: 50,
    peakComboMultiplier: 10.0,
    totalUpgradesBought: 0,
    hazardsRammed: 0,
  };

  const firstEval = evaluateAchievements([], initialInput);
  const unlockedIds = firstEval.newlyUnlocked.map((a) => a.id);
  assert.ok(unlockedIds.includes('first_drift'));
  assert.ok(unlockedIds.includes('combo_5x'));
  assert.ok(unlockedIds.includes('combo_10x'));
  assert.ok(!unlockedIds.includes('clear_100'));
  assert.equal(firstEval.bonusCoins, 15 + 30 + 75);

  // Now reach 100% clear
  const fullClearEval = evaluateAchievements(firstEval.updatedUnlocked, {
    ...initialInput,
    clearPct: 100,
  });
  const newlyIds = fullClearEval.newlyUnlocked.map((a) => a.id);
  assert.deepEqual(newlyIds, ['clear_85', 'clear_100']);
  assert.equal(fullClearEval.bonusCoins, 40 + 100);

  // Progress ratio check
  const prog100 = getAchievementProgress('clear_100', { ...initialInput, clearPct: 100 });
  assert.equal(prog100.ratio, 1);
});

test('three distinct hazard archetypes execute distinct telegraph and movement policies', () => {
  const stone: HazardEntity = {
    id: 1,
    archetype: 'curling_stone',
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    homeX: 0,
    homeZ: 0,
    phaseTimer: 0,
    windupTimer: 0,
    activeTimer: 0,
    cooldownTimer: 0,
    stunnedTimer: 0,
    radius: 1.1,
  };

  const r1 = updateHazardEntity(stone, 5, 0, 0.1);
  assert.equal(r1.triggeredTelegraph, true);
  assert.ok(r1.hazard.windupTimer > 0);

  const golem: HazardEntity = {
    ...stone,
    id: 2,
    archetype: 'snow_golem',
  };
  const r2 = updateHazardEntity(golem, 5, 0, 0.5);
  assert.notEqual(r2.hazard.x, 0);

  const totem: HazardEntity = {
    ...stone,
    id: 3,
    archetype: 'frost_totem',
  };
  const r3 = updateHazardEntity(totem, 4, 0, 0.1);
  assert.equal(r3.triggeredTelegraph, true);
  assert.equal(r3.hazard.windupTimer, 0.65);
});

test('time-of-day palettes cycle distinctly per stage and manual offset', () => {
  const p1 = getStageTimeOfDayPalette(1, 0);
  const p2 = getStageTimeOfDayPalette(2, 0);
  const p3 = getStageTimeOfDayPalette(3, 0);
  const p4 = getStageTimeOfDayPalette(4, 0);

  assert.equal(p1.id, 'morning');
  assert.equal(p2.id, 'sunset');
  assert.equal(p3.id, 'night');
  assert.equal(p4.id, 'alpenglow');
  assert.notEqual(p1.horizonHex, p2.horizonHex);
  assert.notEqual(p2.horizonHex, p3.horizonHex);
});

test('snowfall particle drifts downward with wind sway and wraps to sky canopy at ground level', () => {
  const flake = {
    x: 2,
    y: 0.4,
    z: -3,
    fallSpeed: 2.5,
    swayAmp: 1.2,
    swayFreq: 1.5,
    phase: 0.5,
    scale: 1,
  };

  // Step 0.2s so y drops below 0.25 and wraps to canopyHeight (23)
  const stepped = stepSnowflakeParticle(flake, 0.2, 10.0, 26, 23);
  assert.equal(stepped.y, 23);
  assert.notEqual(stepped.x, flake.x);
});

