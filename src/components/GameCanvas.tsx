import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  computePlowStats,
  registerSnowCleared,
  tickComboTimer,
  calculateClearPercentage,
  checkStageComplete,
  updateHazardEntity,
  getStageTimeOfDayPalette,
  stepSnowflakeParticle,
  type UpgradeLevels,
  type ComboState,
  type HazardEntity,
  type TimeOfDayId,
  type SnowflakeParticle,
} from '../game/rules';
import {
  createProceduralTextures,
  buildSnowplowTruck,
  buildAlpineLodge,
  buildVillageChalet,
  buildHazardRig,
  type HazardVisualRig,
} from '../game/sceneBuilder';
import { synthAudio } from '../game/audio';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  score: number;
  bestScore: number;
  coins: number;
  stage: number;
  clearPct: number;
  targetPct: number;
  warmth: number;
  maxWarmth: number;
  comboCount: number;
  comboMultiplier: number;
  comboTimerRatio: number;
  peakMultiplier: number;
  boostCharge: number; // 0..1
  nearCocoaPad: boolean;
  victory: boolean;
  stageTargetReached: boolean;
  totalDriftsCleared: number;
  hazardsRammed: number;
  timeOfDayId: TimeOfDayId;
  timeOfDayLabel: string;
  statusMessage: string;
}

interface GameCanvasProps {
  phase: GamePhase;
  upgradeLevels: UpgradeLevels;
  timeOfDayOffset: number;
  resetToken: number;
  stageToken: number;
  onHudUpdate: (hud: HudSnapshot) => void;
  onAwardCoins: (deltaCoins: number) => void;
  onPhaseChange: (nextPhase: GamePhase, finalSnapshot?: HudSnapshot) => void;
  onQuickUpgradeKey: (slot: 1 | 2 | 3 | 4) => void;
  onToggleDock: () => void;
  onToggleAchievements: () => void;
  onCycleTimeOfDay: () => void;
  onToggleMute: () => void;
  onNextStageShortcut: () => void;
}

// Pre-allocated scratch math helpers (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _color = new THREE.Color();
const _targetZenith = new THREE.Color();
const _targetMid = new THREE.Color();
const _targetHorizon = new THREE.Color();
const _targetKey = new THREE.Color();
const _targetHemiSky = new THREE.Color();
const _targetHemiGround = new THREE.Color();
const _targetRim = new THREE.Color();

interface SnowCell {
  x: number;
  z: number;
  baseScale: number;
  hp: number;
  maxHp: number;
  cleared: boolean;
  visualScale: number;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  isGold: boolean;
}

export default function GameCanvas({
  phase,
  upgradeLevels,
  timeOfDayOffset,
  resetToken,
  stageToken,
  onHudUpdate,
  onAwardCoins,
  onPhaseChange,
  onQuickUpgradeKey,
  onToggleDock,
  onToggleAchievements,
  onCycleTimeOfDay,
  onToggleMute,
  onNextStageShortcut,
}: GameCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const upgradesRef = useRef<UpgradeLevels>(upgradeLevels);
  upgradesRef.current = upgradeLevels;

  const timeOffsetRef = useRef<number>(timeOfDayOffset);
  timeOffsetRef.current = timeOfDayOffset;

  const callbacksRef = useRef({
    onHudUpdate,
    onAwardCoins,
    onPhaseChange,
    onQuickUpgradeKey,
    onToggleDock,
    onToggleAchievements,
    onCycleTimeOfDay,
    onToggleMute,
    onNextStageShortcut,
  });
  callbacksRef.current = {
    onHudUpdate,
    onAwardCoins,
    onPhaseChange,
    onQuickUpgradeKey,
    onToggleDock,
    onToggleAchievements,
    onCycleTimeOfDay,
    onToggleMute,
    onNextStageShortcut,
  };

  const simRef = useRef<{
    resetRun: (keepStage: boolean, advanceStage: boolean) => void;
  } | null>(null);

  useEffect(() => {
    if (resetToken > 0) {
      simRef.current?.resetRun(false, false);
    }
  }, [resetToken]);

  useEffect(() => {
    if (stageToken > 0) {
      simRef.current?.resetRun(true, true);
    }
  }, [stageToken]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialRect = container.getBoundingClientRect();
    const initW = Math.max(1, initialRect.width || window.innerWidth);
    const initH = Math.max(1, initialRect.height || window.innerHeight);
    renderer.setSize(initW, initH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'snowplow-canvas');
    container.appendChild(renderer.domElement);

    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = initW;
    overlayCanvas.height = initH;
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.inset = '0';
    overlayCanvas.style.width = '100%';
    overlayCanvas.style.height = '100%';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.setAttribute('data-testid', 'snowfall-overlay-canvas');
    container.appendChild(overlayCanvas);
    const overlayCtx = overlayCanvas.getContext('2d')!;

    const scene = new THREE.Scene();

    // 2. Dynamic Time-of-Day Shifting Sky Gradient Background Texture
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d')!;
    const skyGradientTex = new THREE.CanvasTexture(skyCanvas);
    skyGradientTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyGradientTex;

    const initialPalette = getStageTimeOfDayPalette(1, timeOffsetRef.current);
    const curZenith = new THREE.Color(initialPalette.zenithHex);
    const curMid = new THREE.Color(initialPalette.midSkyHex);
    const curHorizon = new THREE.Color(initialPalette.horizonHex);

    const paintSkyGradient = () => {
      const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, `#${curZenith.getHexString()}`);
      grad.addColorStop(0.52, `#${curMid.getHexString()}`);
      grad.addColorStop(1, `#${curHorizon.getHexString()}`);
      skyCtx.fillStyle = grad;
      skyCtx.fillRect(0, 0, 4, 256);
      skyGradientTex.needsUpdate = true;
    };
    paintSkyGradient();

    const sceneFog = new THREE.FogExp2(initialPalette.horizonHex, 0.014);
    scene.fog = sceneFog;

    // 3. Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Camera Setup
    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.5, 180);
    camera.position.set(0, 14.5, 31.5);
    camera.lookAt(0, 1.8, 6.0);

    // 5. Balanced 3-Point Warm/Cool Studio Lighting Rig (Dynamically driven by Time-of-Day)
    const hemiLight = new THREE.HemisphereLight(
      initialPalette.hemiSkyHex,
      initialPalette.hemiGroundHex,
      initialPalette.hemiIntensity
    );
    hemiLight.position.set(0, 45, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      initialPalette.keyLightHex,
      initialPalette.keyIntensity
    );
    keyLight.position.set(initialPalette.sunX, initialPalette.sunY, initialPalette.sunZ);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    const d = 32;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 95;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(initialPalette.rimLightHex, 0.72);
    rimLight.position.set(-22, 18, -26);
    scene.add(rimLight);

    const lodgeLight = new THREE.PointLight(0xffaa44, initialPalette.lanternIntensity, 18, 1.8);
    lodgeLight.position.set(-0.8, 3.2, -10.5);
    scene.add(lodgeLight);

    // 6. Procedural Textures & Environment Geometry
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { roadColorTex, bumpTex, contactShadowTex } = createProceduralTextures(maxAniso);

    const terrainGeo = new THREE.CylinderGeometry(27.5, 32.5, 6, 48);
    terrainGeo.translate(0, -3.0, 0);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xdce8f7,
      roughness: 0.72,
      metalness: 0.04,
      bumpMap: bumpTex,
      bumpScale: 0.04,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    scene.add(terrainMesh);

    const plazaGeo = new THREE.PlaneGeometry(34, 34);
    plazaGeo.rotateX(-Math.PI / 2);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: roadColorTex,
      bumpMap: bumpTex,
      bumpScale: 0.08,
      roughness: 0.68,
      metalness: 0.12,
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.y = 0.02;
    plazaMesh.receiveShadow = !isSoftwareGl;
    scene.add(plazaMesh);

    const lodgeGroup = buildAlpineLodge(isSoftwareGl);
    lodgeGroup.position.set(0, 0, -15.5);
    scene.add(lodgeGroup);

    const chaletWest = buildVillageChalet(0xeef5ff, 0x744228, isSoftwareGl);
    chaletWest.position.set(-18.5, 0, -6);
    chaletWest.rotation.y = Math.PI / 2;
    scene.add(chaletWest);

    const chaletEast = buildVillageChalet(0xeef5ff, 0x5c3c28, isSoftwareGl);
    chaletEast.position.set(18.5, 0, -6);
    chaletEast.rotation.y = -Math.PI / 2;
    scene.add(chaletEast);

    const chaletSouthWest = buildVillageChalet(0xeef5ff, 0x684832, isSoftwareGl);
    chaletSouthWest.position.set(-18.5, 0, 10);
    chaletSouthWest.rotation.y = Math.PI / 2;
    scene.add(chaletSouthWest);

    const chaletSouthEast = buildVillageChalet(0xeef5ff, 0x6e3d2c, isSoftwareGl);
    chaletSouthEast.position.set(18.5, 0, 10);
    chaletSouthEast.rotation.y = -Math.PI / 2;
    scene.add(chaletSouthEast);

    const treeCount = 110;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.4, 7);
    trunkGeo.translate(0, 0.7, 0);
    const foliageLowerGeo = new THREE.ConeGeometry(1.65, 2.8, 7);
    foliageLowerGeo.translate(0, 2.3, 0);
    const foliageTopGeo = new THREE.ConeGeometry(1.15, 2.4, 7);
    foliageTopGeo.translate(0, 3.9, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.85 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2b5447, roughness: 0.72 });
    const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 0.55 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const pineInst = new THREE.InstancedMesh(foliageLowerGeo, pineMat, treeCount);
    const capInst = new THREE.InstancedMesh(foliageTopGeo, snowCapMat, treeCount);

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + (i % 3) * 0.12;
      const dist = 21.5 + (i % 4) * 1.4 + Math.sin(i * 3.1) * 0.9;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;
      const s = 0.85 + ((i * 17) % 35) / 100;

      _dummyObj.position.set(tx, 0, tz);
      _dummyObj.rotation.set(0, (i * 1.3) % (Math.PI * 2), 0);
      _dummyObj.scale.set(s, s * (0.9 + (i % 4) * 0.08), s);
      _dummyObj.updateMatrix();

      trunkInst.setMatrixAt(i, _dummyObj.matrix);
      pineInst.setMatrixAt(i, _dummyObj.matrix);
      capInst.setMatrixAt(i, _dummyObj.matrix);

      const shade = 0.88 + ((i * 7) % 24) / 100;
      _color.setRGB(0.16 * shade, 0.34 * shade, 0.28 * shade);
      pineInst.setColorAt(i, _color);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    pineInst.instanceMatrix.needsUpdate = true;
    if (pineInst.instanceColor) pineInst.instanceColor.needsUpdate = true;
    capInst.instanceMatrix.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    pineInst.computeBoundingSphere();
    capInst.computeBoundingSphere();
    scene.add(trunkInst, pineInst, capInst);

    // 7. Hero Snowplow Truck
    const plowRig = buildSnowplowTruck(contactShadowTex, isSoftwareGl);
    scene.add(plowRig.root);

    // 8. Interactive Snow Mound Grid (InstancedMesh)
    const snowCells: SnowCell[] = [];
    for (let gx = -13; gx <= 13; gx += 1.25) {
      for (let gz = -10.5; gz <= 16.5; gz += 1.25) {
        const distFromSpawn = Math.hypot(gx - 0, gz - 13.5);
        if (distFromSpawn < 2.2) continue;
        if (Math.abs(gx) < 4.5 && gz < -11.5) continue;

        const isDeepBank =
          (Math.abs(gx) > 8.5 && Math.abs(gz) < 6) ||
          (Math.hypot(gx, gz - 1) < 3.5);

        snowCells.push({
          x: gx + (Math.sin(gx * 3.7 + gz) * 0.18),
          z: gz + (Math.cos(gz * 2.9 - gx) * 0.18),
          baseScale: isDeepBank ? 1.28 : 0.92 + ((Math.abs(gx * 3 + gz * 7) % 10) * 0.03),
          hp: isDeepBank ? 2.1 : 1.0,
          maxHp: isDeepBank ? 2.1 : 1.0,
          cleared: false,
          visualScale: 1.0,
        });
      }
    }

    const snowMoundGeo = new THREE.SphereGeometry(0.78, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const snowMoundMat = new THREE.MeshStandardMaterial({
      color: 0xf4f9ff,
      roughness: 0.58,
      metalness: 0.05,
    });
    const snowInstMesh = new THREE.InstancedMesh(snowMoundGeo, snowMoundMat, snowCells.length);
    snowInstMesh.frustumCulled = false;
    snowInstMesh.receiveShadow = !isSoftwareGl;
    scene.add(snowInstMesh);

    const syncSnowInstances = () => {
      for (let i = 0; i < snowCells.length; i++) {
        const cell = snowCells[i];
        const s = cell.cleared ? 0.0001 : cell.baseScale * cell.visualScale;
        _dummyObj.position.set(cell.x, 0.01, cell.z);
        _dummyObj.rotation.set(0, (i * 1.1) % Math.PI, 0);
        _dummyObj.scale.set(s, s * (cell.maxHp > 1.5 ? 0.85 : 0.55), s);
        _dummyObj.updateMatrix();
        snowInstMesh.setMatrixAt(i, _dummyObj.matrix);

        if (cell.maxHp > 1.5) {
          _color.setHex(0xcbe3ff);
        } else {
          _color.setHex(0xf5f9ff);
        }
        snowInstMesh.setColorAt(i, _color);
      }
      snowInstMesh.instanceMatrix.needsUpdate = true;
      if (snowInstMesh.instanceColor) snowInstMesh.instanceColor.needsUpdate = true;
    };

    // 9. Pooled Action Particle System (Snow Spray & Gold Coins)
    const PARTICLE_POOL_SIZE = 160;
    const particlePool: PooledParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: -10,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.5,
      scale: 0.2,
      isGold: false,
    }));
    let particleCursor = 0;

    const particleGeo = new THREE.DodecahedronGeometry(0.22, 0);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInst = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_POOL_SIZE);
    particleInst.frustumCulled = false;
    scene.add(particleInst);

    const spawnParticles = (
      ox: number,
      oy: number,
      oz: number,
      count: number,
      speed: number,
      isGold = false
    ) => {
      for (let i = 0; i < count; i++) {
        const p = particlePool[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_POOL_SIZE;
        p.active = true;
        p.x = ox + (Math.random() - 0.5) * 1.1;
        p.y = oy + Math.random() * 0.4;
        p.z = oz + (Math.random() - 0.5) * 1.1;
        const ang = Math.random() * Math.PI * 2;
        const spd = speed * (0.5 + Math.random() * 0.8);
        p.vx = Math.cos(ang) * spd;
        p.vy = 2.4 + Math.random() * 3.8;
        p.vz = Math.sin(ang) * spd;
        p.maxLife = 0.32 + Math.random() * 0.28;
        p.life = p.maxLife;
        p.scale = isGold ? 0.95 : 0.7 + Math.random() * 0.6;
        p.isGold = isGold;
      }
    };

    // 10. Light Snowfall Particle Effect Overlay (Zero-GC InstancedMesh Canopy)
    const SNOWFALL_COUNT = 220;
    const snowflakes: SnowflakeParticle[] = Array.from({ length: SNOWFALL_COUNT }, (_, idx) => ({
      x: ((idx * 37) % 52) - 26,
      y: ((idx * 19) % 22) + 0.5,
      z: ((idx * 29) % 44) - 22,
      fallSpeed: 1.65 + (idx % 7) * 0.28,
      swayAmp: 0.9 + (idx % 5) * 0.25,
      swayFreq: 1.1 + (idx % 4) * 0.3,
      phase: idx * 0.7,
      scale: 0.55 + (idx % 6) * 0.14,
    }));

    const flakeGeo = new THREE.OctahedronGeometry(0.11, 0);
    const flakeMat = new THREE.MeshBasicMaterial({
      color: 0xf8fbff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const snowfallInst = new THREE.InstancedMesh(flakeGeo, flakeMat, SNOWFALL_COUNT);
    snowfallInst.frustumCulled = false;
    snowfallInst.renderOrder = 5;
    scene.add(snowfallInst);

    // 11. Three Distinct Winter Hazard Entities & Visual Rigs
    let hazards: HazardEntity[] = [];
    const hazardRigs: HazardVisualRig[] = [
      buildHazardRig('curling_stone', contactShadowTex),
      buildHazardRig('snow_golem', contactShadowTex),
      buildHazardRig('frost_totem', contactShadowTex),
    ];
    hazardRigs.forEach((rig) => scene.add(rig.group));

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 12. Mutable Simulation State
    let playerX = 0;
    let playerZ = 13.5;
    let playerHeading = Math.PI;
    let playerSpeed = 0;
    let squashX = 1;
    let squashY = 1;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let boostTimer = 0;
    let boostCharge = 1.0;
    let invulnTimer = 0;
    let stageNumber = 1;
    let score = 0;
    let bestScore = 0;
    let coins = 40;
    let warmth = 3;
    let stageTargetReached = false;
    let totalDriftsCleared = 0;
    let hazardsRammed = 0;
    let statusMessage =
      'Clear 85% of the plaza (or 100% for the Perfectionist badge)! Chain drifts for a 10x Combo!';

    let comboState: ComboState = {
      count: 0,
      multiplier: 1,
      timer: 0,
      maxTimer: 3.4,
      peakMultiplier: 1,
    };

    const initHazards = (stage: number) => {
      const speedMul = 1 + (stage - 1) * 0.15;
      hazards = [
        {
          id: 0,
          archetype: 'curling_stone',
          x: -8,
          z: -2,
          vx: 0,
          vz: 0,
          homeX: -8,
          homeZ: -2,
          phaseTimer: 0,
          windupTimer: 0,
          activeTimer: 0,
          cooldownTimer: 1.5 / speedMul,
          stunnedTimer: 0,
          radius: 1.05,
        },
        {
          id: 1,
          archetype: 'snow_golem',
          x: 6.5,
          z: 3.5,
          vx: 0,
          vz: 0,
          homeX: 6.5,
          homeZ: 3.5,
          phaseTimer: 0,
          windupTimer: 0,
          activeTimer: 0,
          cooldownTimer: 0,
          stunnedTimer: 0,
          radius: 1.1,
        },
        {
          id: 2,
          archetype: 'frost_totem',
          x: 0,
          z: -3.5,
          vx: 0,
          vz: 0,
          homeX: 0,
          homeZ: -3.5,
          phaseTimer: 0,
          windupTimer: 0,
          activeTimer: 0,
          cooldownTimer: 2.2 / speedMul,
          stunnedTimer: 0,
          radius: 1.15,
        },
      ];
    };

    const resetRun = (keepStage: boolean, advanceStage: boolean) => {
      if (advanceStage) {
        stageNumber += 1;
      } else if (!keepStage) {
        stageNumber = 1;
        score = 0;
      }
      const derived = computePlowStats(upgradesRef.current);
      const activeTod = getStageTimeOfDayPalette(stageNumber, timeOffsetRef.current);
      warmth = derived.maxWarmth;
      playerX = 0;
      playerZ = 13.5;
      playerHeading = Math.PI;
      playerSpeed = 0;
      plowRig.root.position.set(playerX, 0, playerZ);
      plowRig.root.rotation.y = playerHeading;
      squashX = 1;
      squashY = 1;
      boostTimer = 0;
      boostCharge = 1.0;
      invulnTimer = 0;
      hitstopTimer = 0;
      cameraTrauma = 0;
      stageTargetReached = false;

      comboState = {
        count: 0,
        multiplier: 1,
        timer: 0,
        maxTimer: derived.comboDuration,
        peakMultiplier: comboState.peakMultiplier,
      };

      for (let i = 0; i < snowCells.length; i++) {
        snowCells[i].cleared = false;
        snowCells[i].hp = snowCells[i].maxHp;
        snowCells[i].visualScale = 1.0;
      }
      syncSnowInstances();
      initHazards(stageNumber);
      statusMessage = `Stage ${stageNumber} (${activeTod.label}): Clear 85% of the snow (or 100% for Perfectionist)!`;
    };

    simRef.current = { resetRun };
    resetRun(false, false);

    // 13. Unified Input Hub
    const keysHeld = new Set<string>();
    const keysJustPressed = new Set<string>();
    let pointerNormX = 0;
    let pointerNormY = 0;

    const clearInputs = () => {
      keysHeld.clear();
      keysJustPressed.clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const code = e.code;
      keysHeld.add(code);
      keysJustPressed.add(code);

      if (code === 'KeyM') {
        callbacksRef.current.onToggleMute();
      } else if (code === 'KeyH') {
        callbacksRef.current.onToggleDock();
      } else if (code === 'KeyT') {
        callbacksRef.current.onToggleAchievements();
      } else if (code === 'KeyC') {
        const nextTod = getStageTimeOfDayPalette(stageNumber, timeOffsetRef.current + 1);
        statusMessage = `Atmosphere shifted to ${nextTod.label}!`;
        callbacksRef.current.onCycleTimeOfDay();
      } else if (code === 'KeyN' && stageTargetReached && phaseRef.current === 'playing') {
        callbacksRef.current.onNextStageShortcut();
      } else if (code === 'Escape' || code === 'KeyP') {
        if (phaseRef.current === 'playing') {
          clearInputs();
          callbacksRef.current.onPhaseChange('paused');
        } else if (phaseRef.current === 'paused') {
          clearInputs();
          callbacksRef.current.onPhaseChange('playing');
        }
      } else if (code === 'KeyR' && phaseRef.current === 'playing') {
        resetRun(false, false);
      } else if (phaseRef.current === 'playing') {
        if (code === 'Digit1') callbacksRef.current.onQuickUpgradeKey(1);
        if (code === 'Digit2') callbacksRef.current.onQuickUpgradeKey(2);
        if (code === 'Digit3') callbacksRef.current.onQuickUpgradeKey(3);
        if (code === 'Digit4') callbacksRef.current.onQuickUpgradeKey(4);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointerNormX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNormY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          overlayCanvas.width = width;
          overlayCanvas.height = height;
        }
      }
    });
    resizeObserver.observe(container);

    // 14. Main Animation & Simulation Loop
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let titleOrbitAngle = 0;
    let lastHudEmitTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function buildHudSnapshot(
      clearedCount: number,
      derivedMaxWarmth: number,
      victory = false
    ): HudSnapshot {
      const clearPct = calculateClearPercentage(clearedCount, snowCells.length);
      const tod = getStageTimeOfDayPalette(stageNumber, timeOffsetRef.current);
      return {
        score,
        bestScore,
        coins,
        stage: stageNumber,
        clearPct,
        targetPct: 85,
        warmth: Math.min(warmth, derivedMaxWarmth),
        maxWarmth: derivedMaxWarmth,
        comboCount: comboState.count,
        comboMultiplier: comboState.multiplier,
        comboTimerRatio:
          comboState.count > 0 && comboState.maxTimer > 0
            ? Math.max(0, Math.min(1, comboState.timer / comboState.maxTimer))
            : 0,
        peakMultiplier: comboState.peakMultiplier,
        boostCharge,
        nearCocoaPad: Math.hypot(playerX - -0.8, playerZ - -10.9) < 3.4,
        victory,
        stageTargetReached,
        totalDriftsCleared,
        hazardsRammed,
        timeOfDayId: tod.id,
        timeOfDayLabel: tod.label,
        statusMessage,
      };
    }

    function tick() {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt > 0 ? rawDt : 0.033, 0.05);
      const elapsed = clock.elapsedTime;
      const currentPhase = phaseRef.current;
      const derived = computePlowStats(upgradesRef.current);

      // Smoothly interpolate Time-of-Day Sky Gradient & Lighting Rig
      const targetTod = getStageTimeOfDayPalette(stageNumber, timeOffsetRef.current);
      _targetZenith.setHex(targetTod.zenithHex);
      _targetMid.setHex(targetTod.midSkyHex);
      _targetHorizon.setHex(targetTod.horizonHex);
      _targetKey.setHex(targetTod.keyLightHex);
      _targetHemiSky.setHex(targetTod.hemiSkyHex);
      _targetHemiGround.setHex(targetTod.hemiGroundHex);
      _targetRim.setHex(targetTod.rimLightHex);

      const colorLerpAlpha = 1 - Math.exp(-7.5 * dt);
      curZenith.lerp(_targetZenith, colorLerpAlpha);
      curMid.lerp(_targetMid, colorLerpAlpha);
      curHorizon.lerp(_targetHorizon, colorLerpAlpha);
      paintSkyGradient();

      sceneFog.color.copy(curHorizon);
      keyLight.color.lerp(_targetKey, colorLerpAlpha);
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, targetTod.keyIntensity, 7.5, dt);
      keyLight.position.x = THREE.MathUtils.damp(keyLight.position.x, targetTod.sunX, 7.5, dt);
      keyLight.position.y = THREE.MathUtils.damp(keyLight.position.y, targetTod.sunY, 7.5, dt);
      keyLight.position.z = THREE.MathUtils.damp(keyLight.position.z, targetTod.sunZ, 7.5, dt);

      hemiLight.color.lerp(_targetHemiSky, colorLerpAlpha);
      hemiLight.groundColor.lerp(_targetHemiGround, colorLerpAlpha);
      hemiLight.intensity = THREE.MathUtils.damp(
        hemiLight.intensity,
        targetTod.hemiIntensity,
        7.5,
        dt
      );
      rimLight.color.lerp(_targetRim, colorLerpAlpha);
      lodgeLight.intensity = THREE.MathUtils.damp(
        lodgeLight.intensity,
        targetTod.lanternIntensity,
        7.5,
        dt
      );

      // Tint snow & plaza surfaces subtly with the Time-of-Day atmosphere
      _color.setHex(0xffffff).lerp(_targetHemiSky, targetTod.id === 'morning' ? 0.12 : 0.38);
      plazaMat.color.lerp(_color, colorLerpAlpha);
      snowMoundMat.color.lerp(_color, colorLerpAlpha);
      terrainMat.color.lerp(curHorizon, colorLerpAlpha * 0.65);

      // Update continuous Light Snowfall Particle Overlay across all phases
      const ovW = overlayCanvas.width;
      const ovH = overlayCanvas.height;
      overlayCtx.clearRect(0, 0, ovW, ovH);

      // Subtle atmospheric top-sky gradient blend over the upper horizon
      const topAtmoGrad = overlayCtx.createLinearGradient(0, 0, 0, ovH * 0.34);
      topAtmoGrad.addColorStop(0, `rgba(${Math.round(curZenith.r * 255)}, ${Math.round(curZenith.g * 255)}, ${Math.round(curZenith.b * 255)}, 0.55)`);
      topAtmoGrad.addColorStop(0.55, `rgba(${Math.round(curMid.r * 255)}, ${Math.round(curMid.g * 255)}, ${Math.round(curMid.b * 255)}, 0.24)`);
      topAtmoGrad.addColorStop(1, `rgba(${Math.round(curHorizon.r * 255)}, ${Math.round(curHorizon.g * 255)}, ${Math.round(curHorizon.b * 255)}, 0.0)`);
      overlayCtx.fillStyle = topAtmoGrad;
      overlayCtx.fillRect(0, 0, ovW, ovH * 0.34);

      for (let i = 0; i < SNOWFALL_COUNT; i++) {
        snowflakes[i] = stepSnowflakeParticle(snowflakes[i], dt, elapsed, 26, 23);
        const f = snowflakes[i];
        _dummyObj.position.set(f.x, f.y, f.z);
        _dummyObj.rotation.set(elapsed * 1.2 + f.phase, elapsed * 0.9 + f.phase, 0);
        _dummyObj.scale.setScalar(f.scale);
        _dummyObj.updateMatrix();
        snowfallInst.setMatrixAt(i, _dummyObj.matrix);

        // Project snowflake into 2D snowfall overlay canvas for crisp multi-depth winter atmosphere
        const sx = ((f.x + 26) / 52) * ovW;
        const sy = (1 - (f.y - 0.25) / 22.75) * ovH;
        const radius = 1.6 + f.scale * 2.4;
        const alpha = 0.38 + (f.scale / 1.45) * 0.42;

        overlayCtx.beginPath();
        overlayCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        overlayCtx.fillStyle = `rgba(248, 252, 255, ${alpha.toFixed(2)})`;
        overlayCtx.fill();
      }
      snowfallInst.instanceMatrix.needsUpdate = true;

      // Update truck blade width & heated edge glow
      const bladeScaleX = 1 + (upgradesRef.current.bladeWidth - 1) * 0.22;
      plowRig.bladeGroup.scale.x = THREE.MathUtils.damp(
        plowRig.bladeGroup.scale.x,
        bladeScaleX,
        10,
        dt
      );
      plowRig.heatedEdgeMat.emissiveIntensity =
        0.35 + (upgradesRef.current.plowHeat - 1) * 0.45 + (boostTimer > 0 ? 1.2 : 0);

      plowRig.beaconLeft.rotation.y += dt * 8;
      plowRig.beaconRight.rotation.y -= dt * 8;

      if (currentPhase === 'title') {
        titleOrbitAngle += dt * 0.22;
        const camX = Math.sin(titleOrbitAngle) * 20 + pointerNormX * 2.5;
        const camZ = 18 + Math.cos(titleOrbitAngle) * 8 + pointerNormY * 1.8;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camX, 4, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 17.5, 4, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camZ, 4, dt);
        _vec3A.set(0, 1.2, -2);
        camera.lookAt(_vec3A);

        plowRig.chassisGroup.position.y = Math.sin(titleOrbitAngle * 14) * 0.025;
      } else if (currentPhase === 'playing') {
        if (keysJustPressed.has('Space') && boostCharge >= 0.35 && boostTimer <= 0) {
          boostTimer = 0.55;
          boostCharge = Math.max(0, boostCharge - 0.45);
          squashX = 0.84;
          squashY = 1.18;
          synthAudio.playBoost();
          spawnParticles(playerX, 0.4, playerZ, 10, 6.5, false);
        }
        keysJustPressed.clear();

        if (boostTimer > 0) {
          boostTimer = Math.max(0, boostTimer - dt);
        } else {
          boostCharge = Math.min(1, boostCharge + dt * 0.28);
        }
        if (invulnTimer > 0) {
          invulnTimer = Math.max(0, invulnTimer - dt);
        }

        const simDt = hitstopTimer > 0 ? 0 : dt;
        if (hitstopTimer > 0) {
          hitstopTimer = Math.max(0, hitstopTimer - dt);
        }

        if (simDt > 0) {
          const forwardIntent =
            (keysHeld.has('KeyW') || keysHeld.has('ArrowUp') ? 1 : 0) -
            (keysHeld.has('KeyS') || keysHeld.has('ArrowDown') ? 1 : 0);
          const turnIntent =
            (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft') ? 1 : 0) -
            (keysHeld.has('KeyD') || keysHeld.has('ArrowRight') ? 1 : 0);

          const topSpeed = boostTimer > 0 ? derived.boostSpeed : derived.maxSpeed;
          const targetSpeed =
            boostTimer > 0
              ? topSpeed
              : forwardIntent !== 0
              ? forwardIntent * topSpeed
              : 0;

          playerSpeed = THREE.MathUtils.damp(
            playerSpeed,
            targetSpeed,
            forwardIntent !== 0 || boostTimer > 0 ? 7.5 : 6.0,
            simDt
          );

          if (Math.abs(playerSpeed) > 0.15 || turnIntent !== 0) {
            const reverseFlip = playerSpeed < -0.5 ? -1 : 1;
            playerHeading += turnIntent * 2.55 * reverseFlip * simDt;
          }

          const moveX = Math.sin(playerHeading) * playerSpeed * simDt;
          const moveZ = Math.cos(playerHeading) * playerSpeed * simDt;
          playerX = THREE.MathUtils.clamp(playerX + moveX, -15.5, 15.5);
          playerZ = THREE.MathUtils.clamp(playerZ + moveZ, -11.5, 17.5);

          if (Math.abs(playerX) < 4.4 && playerZ < -11.0) {
            playerZ = -11.0;
          }

          const distStep = playerSpeed * simDt;
          for (const w of plowRig.wheels) {
            w.rotation.x += distStep * 1.8;
          }
          plowRig.chassisGroup.position.y =
            Math.abs(Math.sin(playerX * 1.8 + playerZ * 1.8)) * 0.04;
          plowRig.chassisGroup.rotation.z = THREE.MathUtils.damp(
            plowRig.chassisGroup.rotation.z,
            -turnIntent * 0.07 * (Math.abs(playerSpeed) / derived.maxSpeed),
            10,
            simDt
          );

          squashX = THREE.MathUtils.damp(squashX, 1, 12, simDt);
          squashY = THREE.MathUtils.damp(squashY, 1, 12, simDt);
          plowRig.chassisGroup.scale.set(squashX, squashY, 1 / Math.sqrt(squashX * squashY));

          plowRig.root.position.set(playerX, 0, playerZ);
          plowRig.root.rotation.y = playerHeading;

          const bladeWorldX = playerX + Math.sin(playerHeading) * 2.15;
          const bladeWorldZ = playerZ + Math.cos(playerHeading) * 2.15;

          let moundsClearedThisFrame = 0;
          let instancesDirty = false;
          const clearPower =
            (boostTimer > 0 ? 2.8 : 1.15) * derived.heavySnowClearRate * (simDt * 18);

          for (let i = 0; i < snowCells.length; i++) {
            const cell = snowCells[i];
            if (cell.cleared) continue;
            const dx = cell.x - bladeWorldX;
            const dz = cell.z - bladeWorldZ;
            const distSq = dx * dx + dz * dz;
            if (distSq <= derived.bladeRadius * derived.bladeRadius) {
              cell.hp -= clearPower;
              cell.visualScale = Math.max(0.2, cell.hp / cell.maxHp);
              instancesDirty = true;
              if (cell.hp <= 0) {
                cell.cleared = true;
                moundsClearedThisFrame++;
                spawnParticles(cell.x, 0.25, cell.z, 4, 4.5, false);
              }
            }
          }

          if (moundsClearedThisFrame > 0) {
            totalDriftsCleared += moundsClearedThisFrame;
            const res = registerSnowCleared(
              comboState,
              moundsClearedThisFrame,
              derived.comboDuration
            );
            comboState = res.combo;
            score += res.pointsEarned;
            bestScore = Math.max(bestScore, score);
            coins += res.coinsEarned;
            callbacksRef.current.onAwardCoins(res.coinsEarned);

            squashX = 1.12;
            squashY = 0.88;
            synthAudio.playSnowClear(
              comboState.count,
              comboState.multiplier,
              moundsClearedThisFrame
            );

            if (res.milestoneReached) {
              synthAudio.playComboMilestone(comboState.multiplier);
              spawnParticles(bladeWorldX, 0.8, bladeWorldZ, 14, 6.2, true);
              statusMessage = `${comboState.multiplier.toFixed(1)}x COMBO STREAK! Keep plowing toward 10.0x!`;
            }
          } else {
            comboState = tickComboTimer(comboState, simDt);
          }

          if (instancesDirty) {
            syncSnowInstances();
          }

          if (Math.hypot(playerX - -0.8, playerZ - -10.9) < 3.2 && warmth < derived.maxWarmth) {
            warmth = derived.maxWarmth;
            synthAudio.playCocoaRefill();
            spawnParticles(playerX, 1.1, playerZ, 12, 5.0, true);
            statusMessage = 'Hot Cocoa Refilled! Full Warmth Mugs restored!';
          }

          let instanceRePackDirty = false;
          for (let i = 0; i < hazards.length; i++) {
            const hRes = updateHazardEntity(hazards[i], playerX, playerZ, simDt);
            hazards[i] = hRes.hazard;
            const h = hazards[i];
            const rig = hazardRigs[i];

            if (hRes.triggeredTelegraph) {
              synthAudio.playTelegraph();
            }

            rig.group.position.set(h.x, 0, h.z);
            if (h.archetype === 'curling_stone') {
              rig.bodyGroup.rotation.y += (h.activeTimer > 0 ? 9 : 1.5) * simDt;
              if (h.windupTimer > 0) {
                rig.telegraphMat.opacity = 0.75;
                rig.aimMat.opacity = 0.65;
                rig.group.rotation.y = Math.atan2(h.vx, h.vz);
              } else {
                rig.telegraphMat.opacity = h.activeTimer > 0 ? 0.35 : 0;
                rig.aimMat.opacity = 0;
              }
            } else if (h.archetype === 'snow_golem') {
              rig.bodyGroup.rotation.z = Math.sin(h.phaseTimer * 6) * 0.08;
              rig.telegraphMat.opacity = 0.22;
              rig.telegraphMat.color.setHex(0x63b3ed);
              if (!stageTargetReached && h.stunnedTimer <= 0 && Math.random() < 0.2) {
                for (let sIdx = 0; sIdx < snowCells.length; sIdx++) {
                  const sc = snowCells[sIdx];
                  if (sc.cleared && Math.hypot(sc.x - h.x, sc.z - h.z) < 1.35) {
                    sc.cleared = false;
                    sc.hp = sc.maxHp * 0.6;
                    sc.visualScale = 0.65;
                    instanceRePackDirty = true;
                    break;
                  }
                }
              }
            } else if (h.archetype === 'frost_totem') {
              rig.bodyGroup.rotation.y += 2.2 * simDt;
              if (h.windupTimer > 0) {
                const progress = 1 - h.windupTimer / 0.65;
                rig.telegraphMat.opacity = 0.35 + progress * 0.55;
                rig.telegraphRing.scale.setScalar(0.5 + progress * 0.5);
              } else if (h.activeTimer > 0) {
                rig.telegraphMat.opacity = 0.85;
                rig.telegraphRing.scale.setScalar(1.05);
              } else {
                rig.telegraphMat.opacity = 0;
              }
            }

            const distToPlayer = Math.hypot(playerX - h.x, playerZ - h.z);
            const hitRadius =
              h.archetype === 'frost_totem' && hRes.pulseActive ? 4.1 : h.radius + 1.25;

            if (distToPlayer < hitRadius) {
              if (boostTimer > 0 && h.stunnedTimer <= 0) {
                h.stunnedTimer = 3.2;
                hazardsRammed += 1;
                const pushNorm = Math.max(0.01, distToPlayer);
                h.vx = ((h.x - playerX) / pushNorm) * 14;
                h.vz = ((h.z - playerZ) / pushNorm) * 14;
                hitstopTimer = 0.055;
                cameraTrauma = 0.65;
                const bonusCoins = 18;
                coins += bonusCoins;
                score += Math.round(120 * comboState.multiplier);
                bestScore = Math.max(bestScore, score);
                callbacksRef.current.onAwardCoins(bonusCoins);
                synthAudio.playHeavyRam();
                spawnParticles(h.x, 0.9, h.z, 22, 8.5, true);
                statusMessage = `BOOST RAM! Stunned ${h.archetype.replace('_', ' ')} for +${bonusCoins} Coins!`;
              } else if (
                invulnTimer <= 0 &&
                h.stunnedTimer <= 0 &&
                (h.archetype !== 'frost_totem' || hRes.pulseActive)
              ) {
                warmth = Math.max(0, warmth - 1);
                invulnTimer = 1.8;
                hitstopTimer = 0.045;
                cameraTrauma = 0.55;
                squashX = 1.22;
                squashY = 0.78;
                const pushNorm = Math.max(0.01, distToPlayer);
                playerX += ((playerX - h.x) / pushNorm) * 1.6;
                playerZ += ((playerZ - h.z) / pushNorm) * 1.6;
                playerSpeed *= -0.4;
                synthAudio.playChillHit();
                spawnParticles(playerX, 0.8, playerZ, 16, 6.0, false);
                statusMessage =
                  warmth > 0
                    ? 'Brrr! Chilly bump! Visit the Cozy Lodge pad to refill Warmth Mugs!'
                    : 'Out of Warmth Mugs! Returning to the Cozy Lodge...';

                if (warmth <= 0) {
                  let clearedNow = 0;
                  for (let c = 0; c < snowCells.length; c++) {
                    if (snowCells[c].cleared) clearedNow++;
                  }
                  synthAudio.playGameOver();
                  const finalSnap = buildHudSnapshot(clearedNow, derived.maxWarmth, false);
                  callbacksRef.current.onHudUpdate(finalSnap);
                  callbacksRef.current.onPhaseChange('gameover', finalSnap);
                }
              }
            }
          }

          if (instanceRePackDirty) {
            syncSnowInstances();
          }

          let clearedCount = 0;
          for (let i = 0; i < snowCells.length; i++) {
            if (snowCells[i].cleared) clearedCount++;
          }

          if (!stageTargetReached && checkStageComplete(clearedCount, snowCells.length, 85)) {
            stageTargetReached = true;
            score += 400 * stageNumber;
            bestScore = Math.max(bestScore, score);
            coins += 35;
            callbacksRef.current.onAwardCoins(35);
            synthAudio.playVictory();
            statusMessage =
              '85% Target Cleared! Press [N] for Next Stage, or plow to 100% for the Perfectionist Achievement!';
          }

          if (clearedCount === snowCells.length && snowCells.length > 0) {
            score += 600 * stageNumber;
            bestScore = Math.max(bestScore, score);
            synthAudio.playVictory();
            const victorySnap = buildHudSnapshot(clearedCount, derived.maxWarmth, true);
            callbacksRef.current.onHudUpdate(victorySnap);
            callbacksRef.current.onPhaseChange('gameover', victorySnap);
          }

          if (elapsed - lastHudEmitTime >= 0.08) {
            lastHudEmitTime = elapsed;
            callbacksRef.current.onHudUpdate(
              buildHudSnapshot(clearedCount, derived.maxWarmth, stageTargetReached)
            );
          }
        }

        cameraTrauma = Math.max(0, cameraTrauma - dt * 1.8);
        const shakeMag = cameraTrauma * cameraTrauma * 0.65;
        const shakeX = (Math.random() - 0.5) * 2 * shakeMag;
        const shakeY = (Math.random() - 0.5) * 2 * shakeMag;

        const targetCamX = playerX * 0.65 + shakeX;
        const targetCamY = 15.2 + (boostTimer > 0 ? 1.1 : 0) + shakeY;
        const targetCamZ = playerZ + 20.5;

        camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 6.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 6.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 6.5, dt);

        _vec3B.set(playerX * 0.75, 1.4, playerZ - 5.2);
        camera.lookAt(_vec3B);
      }

      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particlePool[i];
        if (!p.active) {
          _dummyObj.position.set(0, -20, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleInst.setMatrixAt(i, _dummyObj.matrix);
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          _dummyObj.position.set(0, -20, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleInst.setMatrixAt(i, _dummyObj.matrix);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt;
        const ratio = p.life / p.maxLife;
        _dummyObj.position.set(p.x, Math.max(0.05, p.y), p.z);
        _dummyObj.scale.setScalar(p.scale * ratio);
        _dummyObj.updateMatrix();
        particleInst.setMatrixAt(i, _dummyObj.matrix);
        _color.setHex(p.isGold ? 0xf6ad55 : 0xffffff);
        particleInst.setColorAt(i, _color);
      }
      particleInst.instanceMatrix.needsUpdate = true;
      if (particleInst.instanceColor) particleInst.instanceColor.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      skyGradientTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      if (overlayCanvas.parentNode === container) {
        container.removeChild(overlayCanvas);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden"
      aria-label="3D Snow Plowing Game Viewport"
    />
  );
}
