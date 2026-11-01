export type UpgradeId = 'bladeWidth' | 'enginePower' | 'plowHeat' | 'cocoaTank';

export interface UpgradeLevels {
  bladeWidth: number;
  enginePower: number;
  plowHeat: number;
  cocoaTank: number;
}

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  keyHint: string;
  roleClue: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
}

export const UPGRADE_SPECS: Record<UpgradeId, UpgradeSpec> = {
  bladeWidth: {
    id: 'bladeWidth',
    name: 'Wide V-Blade',
    keyHint: '1',
    roleClue: 'Wider snow swath +22%',
    baseCost: 25,
    costMultiplier: 1.55,
    maxLevel: 6,
  },
  enginePower: {
    id: 'enginePower',
    name: 'Alpine Turbo',
    keyHint: '2',
    roleClue: 'Top speed & boost +18%',
    baseCost: 30,
    costMultiplier: 1.55,
    maxLevel: 6,
  },
  plowHeat: {
    id: 'plowHeat',
    name: 'Thermal Edge',
    keyHint: '3',
    roleClue: 'Melts deep banks & +Combo hold',
    baseCost: 35,
    costMultiplier: 1.6,
    maxLevel: 6,
  },
  cocoaTank: {
    id: 'cocoaTank',
    name: 'Cocoa Thermos',
    keyHint: '4',
    roleClue: '+1 Max Warmth Mug & instant sip',
    baseCost: 40,
    costMultiplier: 1.65,
    maxLevel: 6,
  },
};

export interface PlowDerivedStats {
  bladeRadius: number;
  maxSpeed: number;
  boostSpeed: number;
  comboDuration: number;
  heavySnowClearRate: number;
  maxWarmth: number;
}

export function getUpgradeCost(id: UpgradeId, currentLevel: number): number {
  const spec = UPGRADE_SPECS[id];
  if (currentLevel >= spec.maxLevel) return Infinity;
  return Math.round(spec.baseCost * Math.pow(spec.costMultiplier, currentLevel - 1));
}

export function canPurchaseUpgrade(
  id: UpgradeId,
  levels: UpgradeLevels,
  coins: number
): boolean {
  const currentLevel = levels[id];
  const spec = UPGRADE_SPECS[id];
  if (currentLevel >= spec.maxLevel) return false;
  const cost = getUpgradeCost(id, currentLevel);
  return coins >= cost;
}

export function purchaseUpgrade(
  id: UpgradeId,
  levels: UpgradeLevels,
  coins: number
): { levels: UpgradeLevels; coins: number; purchased: boolean; costPaid: number } {
  if (!canPurchaseUpgrade(id, levels, coins)) {
    return { levels, coins, purchased: false, costPaid: 0 };
  }
  const cost = getUpgradeCost(id, levels[id]);
  const nextLevels: UpgradeLevels = {
    ...levels,
    [id]: levels[id] + 1,
  };
  return {
    levels: nextLevels,
    coins: coins - cost,
    purchased: true,
    costPaid: cost,
  };
}

export function computePlowStats(levels: UpgradeLevels): PlowDerivedStats {
  return {
    bladeRadius: 1.85 + (levels.bladeWidth - 1) * 0.42,
    maxSpeed: 10.5 + (levels.enginePower - 1) * 1.65,
    boostSpeed: 17.5 + (levels.enginePower - 1) * 2.2,
    comboDuration: 3.4 + (levels.plowHeat - 1) * 0.6,
    heavySnowClearRate: 1.0 + (levels.plowHeat - 1) * 0.45,
    maxWarmth: 3 + (levels.cocoaTank - 1),
  };
}

export interface ComboState {
  count: number;
  multiplier: number;
  timer: number;
  maxTimer: number;
  peakMultiplier: number;
}

export function computeComboMultiplier(comboCount: number): number {
  if (comboCount <= 0) return 1;
  // Every 4 snow mounds increases multiplier by 0.5x up to 12.0x (72 drifts = 10.0x combo)
  const bonus = Math.floor(comboCount / 4) * 0.5;
  return Math.min(12, 1 + bonus);
}

export function registerSnowCleared(
  combo: ComboState,
  moundsCleared: number,
  comboDuration: number
): {
  combo: ComboState;
  pointsEarned: number;
  coinsEarned: number;
  milestoneReached: boolean;
} {
  if (moundsCleared <= 0) {
    return { combo, pointsEarned: 0, coinsEarned: 0, milestoneReached: false };
  }
  const prevMultiplier = combo.multiplier;
  const newCount = combo.count + moundsCleared;
  const newMultiplier = computeComboMultiplier(newCount);
  const pointsEarned = Math.round(moundsCleared * 15 * newMultiplier);
  const coinsEarned = Math.max(
    moundsCleared,
    Math.round(moundsCleared * (0.85 + newMultiplier * 0.35))
  );
  const milestoneReached =
    newMultiplier > prevMultiplier && Math.floor(newMultiplier) > Math.floor(prevMultiplier);

  return {
    combo: {
      count: newCount,
      multiplier: newMultiplier,
      timer: comboDuration,
      maxTimer: comboDuration,
      peakMultiplier: Math.max(combo.peakMultiplier, newMultiplier),
    },
    pointsEarned,
    coinsEarned,
    milestoneReached,
  };
}

export function tickComboTimer(combo: ComboState, dt: number): ComboState {
  if (combo.count <= 0) return combo;
  const nextTimer = combo.timer - dt;
  if (nextTimer <= 0) {
    return {
      count: 0,
      multiplier: 1,
      timer: 0,
      maxTimer: combo.maxTimer,
      peakMultiplier: combo.peakMultiplier,
    };
  }
  return {
    ...combo,
    timer: nextTimer,
  };
}

export function calculateClearPercentage(clearedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 100;
  return Math.min(100, Math.round((clearedCount / totalCount) * 100));
}

export function checkStageComplete(
  clearedCount: number,
  totalCount: number,
  targetPct = 85
): boolean {
  return calculateClearPercentage(clearedCount, totalCount) >= targetPct;
}

// ============================================================================
// ACHIEVEMENT & MILESTONE SYSTEM
// ============================================================================

export type AchievementId =
  | 'first_drift'
  | 'combo_5x'
  | 'combo_10x'
  | 'clear_85'
  | 'clear_100'
  | 'alpine_mechanic'
  | 'hazard_rammer';

export interface AchievementSpec {
  id: AchievementId;
  title: string;
  shortBadgeLabel: string;
  milestoneText: string;
  rewardCoins: number;
  targetValue: number;
  unitSuffix: string;
}

export const ACHIEVEMENT_SPECS: AchievementSpec[] = [
  {
    id: 'first_drift',
    title: 'Snowbreaker',
    shortBadgeLabel: 'First Plow',
    milestoneText: 'Plowing your first 10 snowdrifts',
    rewardCoins: 15,
    targetValue: 10,
    unitSuffix: ' drifts',
  },
  {
    id: 'combo_5x',
    title: 'Rhythm Plower',
    shortBadgeLabel: '5x Combo',
    milestoneText: 'Performing a 5x combo',
    rewardCoins: 30,
    targetValue: 5,
    unitSuffix: 'x',
  },
  {
    id: 'combo_10x',
    title: 'Blizzard Virtuoso',
    shortBadgeLabel: '10x Combo',
    milestoneText: 'Performing a 10x combo',
    rewardCoins: 75,
    targetValue: 10,
    unitSuffix: 'x',
  },
  {
    id: 'clear_85',
    title: 'Plaza Warden',
    shortBadgeLabel: '85% Clear',
    milestoneText: 'Clearing 85% of a level',
    rewardCoins: 40,
    targetValue: 85,
    unitSuffix: '%',
  },
  {
    id: 'clear_100',
    title: 'Alpine Perfectionist',
    shortBadgeLabel: '100% Clear',
    milestoneText: 'Clearing 100% of a level',
    rewardCoins: 100,
    targetValue: 100,
    unitSuffix: '%',
  },
  {
    id: 'alpine_mechanic',
    title: 'Custom Rig',
    shortBadgeLabel: 'Upgraded',
    milestoneText: 'Installing a garage upgrade',
    rewardCoins: 25,
    targetValue: 1,
    unitSuffix: ' upgrade',
  },
  {
    id: 'hazard_rammer',
    title: 'Golem Bumper',
    shortBadgeLabel: 'Boost Ram',
    milestoneText: 'Boost-ramming a winter hazard',
    rewardCoins: 35,
    targetValue: 1,
    unitSuffix: ' ram',
  },
];

export interface AchievementProgressInput {
  totalDriftsCleared: number;
  clearPct: number;
  peakComboMultiplier: number;
  totalUpgradesBought: number;
  hazardsRammed: number;
}

export function getAchievementProgress(
  id: AchievementId,
  input: AchievementProgressInput
): { current: number; target: number; ratio: number } {
  const spec = ACHIEVEMENT_SPECS.find((s) => s.id === id)!;
  let current = 0;
  switch (id) {
    case 'first_drift':
      current = input.totalDriftsCleared;
      break;
    case 'combo_5x':
    case 'combo_10x':
      current = input.peakComboMultiplier;
      break;
    case 'clear_85':
    case 'clear_100':
      current = input.clearPct;
      break;
    case 'alpine_mechanic':
      current = input.totalUpgradesBought;
      break;
    case 'hazard_rammer':
      current = input.hazardsRammed;
      break;
  }
  const clamped = Math.min(spec.targetValue, current);
  return {
    current: clamped,
    target: spec.targetValue,
    ratio: spec.targetValue > 0 ? Math.min(1, clamped / spec.targetValue) : 1,
  };
}

export function evaluateAchievements(
  alreadyUnlocked: readonly AchievementId[],
  input: AchievementProgressInput
): {
  newlyUnlocked: AchievementSpec[];
  updatedUnlocked: AchievementId[];
  bonusCoins: number;
} {
  const unlockedSet = new Set<AchievementId>(alreadyUnlocked);
  const newlyUnlocked: AchievementSpec[] = [];
  let bonusCoins = 0;

  for (const spec of ACHIEVEMENT_SPECS) {
    if (unlockedSet.has(spec.id)) continue;
    const prog = getAchievementProgress(spec.id, input);
    if (prog.current >= spec.targetValue) {
      unlockedSet.add(spec.id);
      newlyUnlocked.push(spec);
      bonusCoins += spec.rewardCoins;
    }
  }

  return {
    newlyUnlocked,
    updatedUnlocked: Array.from(unlockedSet),
    bonusCoins,
  };
}

export type HazardArchetype = 'curling_stone' | 'snow_golem' | 'frost_totem';

export interface HazardEntity {
  id: number;
  archetype: HazardArchetype;
  x: number;
  z: number;
  vx: number;
  vz: number;
  homeX: number;
  homeZ: number;
  phaseTimer: number;
  windupTimer: number;
  activeTimer: number;
  cooldownTimer: number;
  stunnedTimer: number;
  radius: number;
}

export function updateHazardEntity(
  h: HazardEntity,
  playerX: number,
  playerZ: number,
  dt: number
): { hazard: HazardEntity; triggeredTelegraph: boolean; pulseActive: boolean } {
  const next = { ...h };
  let triggeredTelegraph = false;
  let pulseActive = false;

  if (next.stunnedTimer > 0) {
    next.stunnedTimer = Math.max(0, next.stunnedTimer - dt);
    next.x += next.vx * dt;
    next.z += next.vz * dt;
    next.vx *= Math.exp(-5 * dt);
    next.vz *= Math.exp(-5 * dt);
    return { hazard: next, triggeredTelegraph: false, pulseActive: false };
  }

  next.phaseTimer += dt;
  const dx = playerX - next.x;
  const dz = playerZ - next.z;
  const dist = Math.hypot(dx, dz);

  if (next.archetype === 'curling_stone') {
    if (next.windupTimer > 0) {
      next.windupTimer -= dt;
      if (next.windupTimer <= 0) {
        next.activeTimer = 1.15;
        pulseActive = true;
      }
    } else if (next.activeTimer > 0) {
      next.activeTimer -= dt;
      next.x += next.vx * dt;
      next.z += next.vz * dt;
      if (Math.hypot(next.x - next.homeX, next.z - next.homeZ) > 14) {
        next.vx *= -0.7;
        next.vz *= -0.7;
      }
      if (next.activeTimer <= 0) {
        next.vx = 0;
        next.vz = 0;
        next.cooldownTimer = 1.6;
      }
    } else {
      next.cooldownTimer = Math.max(0, next.cooldownTimer - dt);
      if (next.cooldownTimer <= 0 && dist < 16) {
        const norm = Math.max(0.001, dist);
        next.vx = (dx / norm) * 11.5;
        next.vz = (dz / norm) * 11.5;
        next.windupTimer = 0.55;
        triggeredTelegraph = true;
      } else {
        next.x += (next.homeX - next.x) * 1.2 * dt;
        next.z += (next.homeZ - next.z) * 1.2 * dt;
      }
    }
  } else if (next.archetype === 'snow_golem') {
    const targetAngle = next.phaseTimer * 0.75 + next.id * 1.7;
    const patrolX = next.homeX + Math.cos(targetAngle) * 6.5;
    const patrolZ = next.homeZ + Math.sin(targetAngle * 0.8) * 6.5;
    const gdx = patrolX - next.x;
    const gdz = patrolZ - next.z;
    const gDist = Math.max(0.001, Math.hypot(gdx, gdz));
    next.vx = (gdx / gDist) * 3.4;
    next.vz = (gdz / gDist) * 3.4;
    next.x += next.vx * dt;
    next.z += next.vz * dt;
  } else if (next.archetype === 'frost_totem') {
    if (next.windupTimer > 0) {
      next.windupTimer -= dt;
      if (next.windupTimer <= 0) {
        next.activeTimer = 0.45;
        pulseActive = true;
      }
    } else if (next.activeTimer > 0) {
      next.activeTimer -= dt;
      pulseActive = true;
      if (next.activeTimer <= 0) {
        next.cooldownTimer = 2.4;
      }
    } else {
      next.cooldownTimer = Math.max(0, next.cooldownTimer - dt);
      if (next.cooldownTimer <= 0 && dist < 13) {
        next.windupTimer = 0.65;
        triggeredTelegraph = true;
      }
    }
  }

  return { hazard: next, triggeredTelegraph, pulseActive };
}

// ============================================================================
// DAY / NIGHT CYCLE & TIME-OF-DAY SHIFTING GRADIENT PALETTES
// ============================================================================

export type TimeOfDayId = 'morning' | 'sunset' | 'night' | 'alpenglow';

export interface TimeOfDayPalette {
  id: TimeOfDayId;
  label: string;
  zenithHex: number;
  midSkyHex: number;
  horizonHex: number;
  keyLightHex: number;
  keyIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  rimLightHex: number;
  lanternIntensity: number;
  sunX: number;
  sunY: number;
  sunZ: number;
}

export const TIME_OF_DAY_PALETTES: TimeOfDayPalette[] = [
  {
    id: 'morning',
    label: 'Crisp Alpine Morning',
    zenithHex: 0x1d4ed8,
    midSkyHex: 0x60a5fa,
    horizonHex: 0xdbeafe,
    keyLightHex: 0xfff7ed,
    keyIntensity: 2.05,
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0x64748b,
    hemiIntensity: 1.25,
    rimLightHex: 0xfde68a,
    lanternIntensity: 1.6,
    sunX: 28,
    sunY: 40,
    sunZ: 20,
  },
  {
    id: 'sunset',
    label: 'Golden Hour Sunset',
    zenithHex: 0x2e1065,
    midSkyHex: 0xc2410c,
    horizonHex: 0xfdba74,
    keyLightHex: 0xff7b29,
    keyIntensity: 1.65,
    hemiSkyHex: 0xfb923c,
    hemiGroundHex: 0x431407,
    hemiIntensity: 0.85,
    rimLightHex: 0xf97316,
    lanternIntensity: 3.6,
    sunX: -32,
    sunY: 18,
    sunZ: 14,
  },
  {
    id: 'night',
    label: 'Starlit Aurora Night',
    zenithHex: 0x030712,
    midSkyHex: 0x0f172a,
    horizonHex: 0x115e59,
    keyLightHex: 0x38bdf8,
    keyIntensity: 0.72,
    hemiSkyHex: 0x2dd4bf,
    hemiGroundHex: 0x090d16,
    hemiIntensity: 0.48,
    rimLightHex: 0x34d399,
    lanternIntensity: 5.2,
    sunX: 14,
    sunY: 32,
    sunZ: -24,
  },
  {
    id: 'alpenglow',
    label: 'Alpenglow Twilight',
    zenithHex: 0x1e1b4b,
    midSkyHex: 0x9d174d,
    horizonHex: 0xf472b6,
    keyLightHex: 0xf43f5e,
    keyIntensity: 1.35,
    hemiSkyHex: 0xe879f9,
    hemiGroundHex: 0x2e1065,
    hemiIntensity: 0.78,
    rimLightHex: 0xf472b6,
    lanternIntensity: 4.2,
    sunX: -24,
    sunY: 22,
    sunZ: -18,
  },
];

export function getStageTimeOfDayPalette(stage: number, manualOffset = 0): TimeOfDayPalette {
  const idx = Math.abs((stage - 1 + manualOffset) % TIME_OF_DAY_PALETTES.length);
  return TIME_OF_DAY_PALETTES[idx];
}

// ============================================================================
// LIGHT SNOWFALL PARTICLE OVERLAY KINEMATICS
// ============================================================================

export interface SnowflakeParticle {
  x: number;
  y: number;
  z: number;
  fallSpeed: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  scale: number;
}

export function stepSnowflakeParticle(
  flake: SnowflakeParticle,
  dt: number,
  elapsedTime: number,
  boundsRadius = 26,
  canopyHeight = 23
): SnowflakeParticle {
  let nextY = flake.y - flake.fallSpeed * dt;
  let nextX =
    flake.x + Math.sin(elapsedTime * flake.swayFreq + flake.phase) * flake.swayAmp * dt;
  let nextZ =
    flake.z + Math.cos(elapsedTime * (flake.swayFreq * 0.85) + flake.phase) * (flake.swayAmp * 0.7) * dt;

  // Wrap around when snowflake touches the ground or drifts outside bounds
  if (nextY < 0.25) {
    nextY = canopyHeight;
  }
  if (nextX > boundsRadius) nextX = -boundsRadius;
  if (nextX < -boundsRadius) nextX = boundsRadius;
  if (nextZ > boundsRadius) nextZ = -boundsRadius;
  if (nextZ < -boundsRadius) nextZ = boundsRadius;

  return {
    ...flake,
    x: nextX,
    y: nextY,
    z: nextZ,
  };
}

