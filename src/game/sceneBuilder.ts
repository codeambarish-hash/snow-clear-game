import * as THREE from 'three';

export interface PlowTruckRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  bladeGroup: THREE.Group;
  heatedEdgeMesh: THREE.Mesh;
  heatedEdgeMat: THREE.MeshStandardMaterial;
  beaconLeft: THREE.Mesh;
  beaconRight: THREE.Mesh;
  wheels: THREE.Object3D[];
}

export interface HazardVisualRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  telegraphRing: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  aimLine: THREE.Mesh;
  aimMat: THREE.MeshBasicMaterial;
}

/**
 * Generates procedural CanvasTextures with proper colorSpace and anisotropy.
 */
export function createProceduralTextures(maxAnisotropy: number) {
  // 1. Cobblestone Village Road Albedo Texture
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 256;
  roadCanvas.height = 256;
  const rCtx = roadCanvas.getContext('2d')!;
  rCtx.fillStyle = '#2d3748';
  rCtx.fillRect(0, 0, 256, 256);

  // Draw warm slate cobblestones
  const rows = 8;
  const cols = 6;
  const cellW = 256 / cols;
  const cellH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offsetX = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offsetX + 3;
      const y = r * cellH + 3;
      const w = cellW - 6;
      const h = cellH - 6;
      const shade = 58 + ((r * 7 + c * 13) % 22);
      const warm = (r + c) % 3 === 0 ? 8 : 0;
      rCtx.fillStyle = `rgb(${shade + warm}, ${shade + 4}, ${shade + 12})`;
      rCtx.beginPath();
      rCtx.roundRect(x, y, w, h, 6);
      rCtx.fill();
    }
  }
  const roadColorTex = new THREE.CanvasTexture(roadCanvas);
  roadColorTex.colorSpace = THREE.SRGBColorSpace;
  roadColorTex.wrapS = THREE.RepeatWrapping;
  roadColorTex.wrapT = THREE.RepeatWrapping;
  roadColorTex.repeat.set(14, 14);
  roadColorTex.anisotropy = maxAnisotropy;

  // 2. Grayscale Bump / Micro-Relief Texture (NoColorSpace for linear data)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const bx = Math.random() * 256;
    const by = Math.random() * 256;
    const v = 100 + Math.floor(Math.random() * 55);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(bx, by, 3, 3);
  }
  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(12, 12);
  bumpTex.anisotropy = maxAnisotropy;

  // 3. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(6, 12, 24, 0.65)');
  grad.addColorStop(0.6, 'rgba(6, 12, 24, 0.28)');
  grad.addColorStop(1, 'rgba(6, 12, 24, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
  contactShadowTex.colorSpace = THREE.SRGBColorSpace;

  return { roadColorTex, bumpTex, contactShadowTex };
}

/**
 * Builds the Hero 11-Part Procedural Snowplow Truck (THREE.Group)
 * Pivot is at bottom-center (y = 0) so it sits flush on ground.
 */
export function buildSnowplowTruck(
  contactShadowTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): PlowTruckRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Contact shadow disc grounded at y = 0.02
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.8), shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, 0.02, 0.2);
  root.add(shadowDisc);

  // Materials with varied roughness (>= 0.25 contrast between adjacent parts)
  const cabPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xe65336, // Cozy rescue tangerine-red
    roughness: 0.28,
    metalness: 0.2,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e2636,
    roughness: 0.78,
    metalness: 0.45,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa5e8ff,
    roughness: 0.1,
    metalness: 0.1,
    transmission: isSoftwareGl ? 0 : 0.65,
    transparent: true,
    opacity: isSoftwareGl ? 0.75 : 1,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xd0dce8,
    roughness: 0.22,
    metalness: 0.88,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf4b659,
    roughness: 0.3,
    metalness: 0.82,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    roughness: 0.88,
    metalness: 0.08,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x7c4a2b,
    roughness: 0.75,
    metalness: 0.05,
  });

  // Part 1: Heavy-duty lower chassis frame
  const frameGeo = new THREE.BoxGeometry(1.75, 0.42, 3.1);
  const frameMesh = new THREE.Mesh(frameGeo, chassisMat);
  frameMesh.position.set(0, 0.52, 0);
  frameMesh.castShadow = !isSoftwareGl;
  frameMesh.receiveShadow = !isSoftwareGl;
  chassisGroup.add(frameMesh);

  // Part 2: Beveled ExtrudeGeometry Cab Body (Primary silhouette)
  const cabShape = new THREE.Shape();
  cabShape.moveTo(-0.85, 0);
  cabShape.lineTo(0.85, 0);
  cabShape.lineTo(0.8, 1.15);
  cabShape.lineTo(-0.78, 1.15);
  cabShape.closePath();

  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    steps: 1,
    depth: 1.55,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  cabGeo.center();
  const cabMesh = new THREE.Mesh(cabGeo, cabPaintMat);
  cabMesh.position.set(0, 1.25, 0.35);
  cabMesh.castShadow = !isSoftwareGl;
  cabMesh.receiveShadow = !isSoftwareGl;
  chassisGroup.add(cabMesh);

  // Part 3: Engine Hood Nose
  const hoodGeo = new THREE.BoxGeometry(1.52, 0.68, 0.95);
  const hoodMesh = new THREE.Mesh(hoodGeo, cabPaintMat);
  hoodMesh.position.set(0, 1.02, 1.42);
  hoodMesh.castShadow = !isSoftwareGl;
  chassisGroup.add(hoodMesh);

  // Part 4: Wraparound Cabin Windshield & Windows (Secondary read)
  const windshieldGeo = new THREE.BoxGeometry(1.58, 0.52, 1.28);
  const windshieldMesh = new THREE.Mesh(windshieldGeo, glassMat);
  windshieldMesh.position.set(0, 1.42, 0.42);
  chassisGroup.add(windshieldMesh);

  // Part 5: Rear Cocoa Tank & Salt Hopper Bed
  const bedGeo = new THREE.BoxGeometry(1.66, 0.56, 1.25);
  const bedMesh = new THREE.Mesh(bedGeo, woodMat);
  bedMesh.position.set(0, 0.98, -0.92);
  bedMesh.castShadow = !isSoftwareGl;
  chassisGroup.add(bedMesh);

  // Cozy Cocoa Barrel on flatbed
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.88, 16);
  barrelGeo.rotateZ(Math.PI / 2);
  const barrelMesh = new THREE.Mesh(barrelGeo, woodMat);
  barrelMesh.position.set(0, 1.42, -0.92);
  chassisGroup.add(barrelMesh);

  // Brass straps on cocoa barrel
  const strapGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.08, 16);
  strapGeo.rotateZ(Math.PI / 2);
  const strapLeft = new THREE.Mesh(strapGeo, brassMat);
  strapLeft.position.set(-0.24, 1.42, -0.92);
  const strapRight = new THREE.Mesh(strapGeo, brassMat);
  strapRight.position.set(0.24, 1.42, -0.92);
  chassisGroup.add(strapLeft, strapRight);

  // Part 6: Curved TubeGeometry Chrome Exhaust Stack (Accent detail)
  const exhaustCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.78, 0.8, -0.15),
    new THREE.Vector3(-0.88, 1.4, -0.15),
    new THREE.Vector3(-0.88, 2.05, -0.2),
    new THREE.Vector3(-0.96, 2.18, -0.32),
  ]);
  const exhaustGeo = new THREE.TubeGeometry(exhaustCurve, 12, 0.075, 8, false);
  const exhaustMesh = new THREE.Mesh(exhaustGeo, steelMat);
  chassisGroup.add(exhaustMesh);

  // Part 7: Twin Roof Rotary Amber Beacons (LatheGeometry dome)
  const beaconPoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.14, 0.18),
    new THREE.Vector2(0, 0.22),
  ];
  const beaconGeo = new THREE.LatheGeometry(beaconPoints, 12);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const beaconLeft = new THREE.Mesh(beaconGeo, beaconMat);
  beaconLeft.position.set(-0.45, 1.88, 0.35);
  const beaconRight = new THREE.Mesh(beaconGeo, beaconMat);
  beaconRight.position.set(0.45, 1.88, 0.35);
  chassisGroup.add(beaconLeft, beaconRight);

  // Part 8: Warm Halogen Headlights
  const headlightGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12);
  headlightGeo.rotateX(Math.PI / 2);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d6,
    emissive: 0xffe49e,
    emissiveIntensity: 2.0,
    roughness: 0.15,
  });
  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-0.52, 0.98, 1.9);
  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(0.52, 0.98, 1.9);
  chassisGroup.add(hlLeft, hlRight);

  // Part 9: 4 Chunky Snow Wheels + Lathe Brass Hubs
  const wheels: THREE.Object3D[] = [];
  const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.41, 12);
  hubGeo.rotateZ(Math.PI / 2);

  const wheelCoords: [number, number, number][] = [
    [-0.92, 0.48, 1.05],
    [0.92, 0.48, 1.05],
    [-0.92, 0.48, -0.95],
    [0.92, 0.48, -0.95],
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    const wGroup = new THREE.Group();
    wGroup.position.set(wx, wy, wz);
    const tire = new THREE.Mesh(tireGeo, rubberMat);
    const hub = new THREE.Mesh(hubGeo, brassMat);
    wGroup.add(tire, hub);
    root.add(wGroup);
    wheels.push(wGroup);
  }

  // Part 10 & 11: Curved Concave Snowplow Blade + Hydraulic Arms + Thermal Edge Strip
  const bladeGroup = new THREE.Group();
  bladeGroup.position.set(0, 0.48, 2.15);
  root.add(bladeGroup);

  // Hydraulic struts connecting truck frame to blade
  const strutGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8);
  strutGeo.rotateX(Math.PI / 2);
  const strutLeft = new THREE.Mesh(strutGeo, steelMat);
  strutLeft.position.set(-0.42, 0.05, -0.35);
  const strutRight = new THREE.Mesh(strutGeo, steelMat);
  strutRight.position.set(0.42, 0.05, -0.35);
  bladeGroup.add(strutLeft, strutRight);

  // Curved scoop profile extruded horizontally
  const scoopShape = new THREE.Shape();
  scoopShape.moveTo(0, -0.38);
  scoopShape.quadraticCurveTo(-0.32, 0.05, 0.06, 0.52);
  scoopShape.lineTo(0.18, 0.48);
  scoopShape.quadraticCurveTo(-0.16, 0.05, 0.14, -0.34);
  scoopShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(scoopShape, {
    steps: 1,
    depth: 2.6,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  bladeGeo.center();
  bladeGeo.rotateY(Math.PI / 2);

  const bladeMesh = new THREE.Mesh(bladeGeo, steelMat);
  bladeMesh.castShadow = !isSoftwareGl;
  bladeMesh.receiveShadow = !isSoftwareGl;
  bladeGroup.add(bladeMesh);

  // Thermal heated bottom scraper edge (glows brighter as plowHeat is upgraded!)
  const heatedEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xff7722,
    emissive: 0xff5500,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.6,
  });
  const heatedEdgeGeo = new THREE.BoxGeometry(2.68, 0.14, 0.18);
  const heatedEdgeMesh = new THREE.Mesh(heatedEdgeGeo, heatedEdgeMat);
  heatedEdgeMesh.position.set(0, -0.34, 0.12);
  bladeGroup.add(heatedEdgeMesh);

  return {
    root,
    chassisGroup,
    bladeGroup,
    heatedEdgeMesh,
    heatedEdgeMat,
    beaconLeft,
    beaconRight,
    wheels,
  };
}

/**
 * Builds the Cozy Alpine Lodge & Clocktower Landmark (8 distinct parts)
 */
export function buildAlpineLodge(isSoftwareGl: boolean): THREE.Group {
  const group = new THREE.Group();

  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x6b3e26,
    roughness: 0.78,
    metalness: 0.05,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x5a6578,
    roughness: 0.85,
    metalness: 0.1,
  });
  const snowRoofMat = new THREE.MeshStandardMaterial({
    color: 0xf1f6ff,
    roughness: 0.52,
    metalness: 0.05,
  });
  const warmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffebb3,
    emissive: 0xffaa33,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xeab354,
    roughness: 0.3,
    metalness: 0.8,
  });

  // 1. Stone foundation
  const foundMesh = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.7, 5.6), stoneMat);
  foundMesh.position.set(0, 0.35, 0);
  foundMesh.receiveShadow = !isSoftwareGl;
  group.add(foundMesh);

  // 2. Main Timber Hall
  const hallMesh = new THREE.Mesh(new THREE.BoxGeometry(7.0, 2.8, 5.0), timberMat);
  hallMesh.position.set(0, 2.1, 0);
  hallMesh.castShadow = !isSoftwareGl;
  hallMesh.receiveShadow = !isSoftwareGl;
  group.add(hallMesh);

  // 3. Pitched Snow-Capped Roof (ExtrudeGeometry prism)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.1, 0);
  roofShape.lineTo(0, 2.4);
  roofShape.lineTo(4.1, 0);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    steps: 1,
    depth: 5.8,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 2,
  });
  roofGeo.center();
  const roofMesh = new THREE.Mesh(roofGeo, snowRoofMat);
  roofMesh.position.set(0, 4.5, 0);
  roofMesh.castShadow = !isSoftwareGl;
  group.add(roofMesh);

  // 4. Tall Alpine Clocktower (Landmark vista silhouette)
  const towerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.2, 2.2), timberMat);
  towerMesh.position.set(2.0, 3.8, -0.8);
  towerMesh.castShadow = !isSoftwareGl;
  group.add(towerMesh);

  // 5. Clocktower Spire Roof
  const spireGeo = new THREE.ConeGeometry(1.75, 2.6, 4);
  spireGeo.rotateY(Math.PI / 4);
  const spireMesh = new THREE.Mesh(spireGeo, snowRoofMat);
  spireMesh.position.set(2.0, 8.1, -0.8);
  group.add(spireMesh);

  // 6. Glowing Clock Face & Cozy Cabin Windows
  const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 16), warmWindowMat);
  clockDial.rotation.x = Math.PI / 2;
  clockDial.position.set(2.0, 5.6, 0.32);
  group.add(clockDial);

  const winGeo = new THREE.BoxGeometry(1.1, 1.0, 0.12);
  const win1 = new THREE.Mesh(winGeo, warmWindowMat);
  win1.position.set(-1.8, 2.1, 2.52);
  const win2 = new THREE.Mesh(winGeo, warmWindowMat);
  win2.position.set(0.2, 2.1, 2.52);
  group.add(win1, win2);

  // 7. Stone Chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.8, 0.9), stoneMat);
  chimney.position.set(-2.4, 4.4, -1.2);
  group.add(chimney);

  // 8. Cocoa Refill Station Pad in front of Lodge (z = +4.4)
  const padRingGeo = new THREE.RingGeometry(1.8, 2.25, 24);
  padRingGeo.rotateX(-Math.PI / 2);
  const padRingMat = new THREE.MeshBasicMaterial({
    color: 0xf6ad55,
    side: THREE.DoubleSide,
  });
  const padRing = new THREE.Mesh(padRingGeo, padRingMat);
  padRing.position.set(-0.8, 0.04, 4.6);
  group.add(padRing);

  const mugSign = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.7, 12), brassMat);
  mugSign.position.set(-3.2, 1.2, 3.6);
  group.add(mugSign);

  return group;
}

/**
 * Builds a smaller Cozy Village Chalet (5 parts)
 */
export function buildVillageChalet(
  roofTint: number,
  wallTint: number,
  isSoftwareGl: boolean
): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: wallTint, roughness: 0.75 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofTint, roughness: 0.5 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a3,
    emissive: 0xffa726,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.85 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 3.8), stoneMat);
  base.position.y = 0.25;
  g.add(base);

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 3.4), wallMat);
  body.position.y = 1.6;
  body.castShadow = !isSoftwareGl;
  body.receiveShadow = !isSoftwareGl;
  g.add(body);

  const roofGeo = new THREE.ConeGeometry(3.4, 2.0, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 3.65;
  roof.castShadow = !isSoftwareGl;
  g.add(roof);

  const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.1), winMat);
  win1.position.set(-0.9, 1.65, 1.72);
  const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.1), winMat);
  win2.position.set(0.9, 1.65, 1.72);
  g.add(win1, win2);

  return g;
}

/**
 * Builds visual rigs for the 3 distinct winter hazard archetypes,
 * each as a 4-7 part THREE.Group with ground telegraph rings.
 */
export function buildHazardRig(
  archetype: 'curling_stone' | 'snow_golem' | 'frost_totem',
  contactShadowTex: THREE.CanvasTexture
): HazardVisualRig {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // Contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  // Telegraph ring on ground
  const telegraphMat = new THREE.MeshBasicMaterial({
    color: 0xff5533,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringRadius = archetype === 'frost_totem' ? 4.2 : 1.8;
  const telegraphRing = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius * 0.78, ringRadius, 24),
    telegraphMat
  );
  telegraphRing.rotation.x = -Math.PI / 2;
  telegraphRing.position.y = 0.05;
  group.add(telegraphRing);

  // Aim sight line for curling stone charger
  const aimMat = new THREE.MeshBasicMaterial({
    color: 0xff6b4a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 6.5), aimMat);
  aimLine.rotation.x = -Math.PI / 2;
  aimLine.position.set(0, 0.05, 3.25);
  group.add(aimLine);

  if (archetype === 'curling_stone') {
    // Polished granite stone + crimson band + brass gooseneck handle
    const graniteMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.25,
      metalness: 0.35,
    });
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xe53e3e,
      roughness: 0.4,
      metalness: 0.2,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf6ad55,
      roughness: 0.2,
      metalness: 0.85,
    });

    const stoneBody = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.95, 0.56, 20), graniteMat);
    stoneBody.position.y = 0.32;
    const strikeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.22, 20), bandMat);
    strikeBand.position.y = 0.32;
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.1, 16), bandMat);
    topCap.position.y = 0.62;
    const handlePost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 10), brassMat);
    handlePost.position.set(0, 0.78, -0.15);
    const handleGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 10), brassMat);
    handleGrip.rotation.x = Math.PI / 2;
    handleGrip.position.set(0, 0.92, 0.08);

    bodyGroup.add(stoneBody, strikeBand, topCap, handlePost, handleGrip);
  } else if (archetype === 'snow_golem') {
    // 3 stacked snow spheres + cozy red scarf + carrot nose + top hat
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xf0f7ff,
      roughness: 0.65,
      metalness: 0.05,
    });
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0xdd3b2a,
      roughness: 0.8,
    });
    const hatMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.4,
    });
    const carrotMat = new THREE.MeshStandardMaterial({
      color: 0xed8936,
      roughness: 0.5,
    });

    const baseBall = new THREE.Mesh(new THREE.SphereGeometry(0.78, 16, 14), snowMat);
    baseBall.position.y = 0.68;
    const midBall = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 14), snowMat);
    midBall.position.y = 1.62;
    const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), snowMat);
    headBall.position.y = 2.35;

    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 16), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 2.02;

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 8), carrotMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 2.35, 0.48);

    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 14), hatMat);
    hatBrim.position.y = 2.72;
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 14), hatMat);
    hatTop.position.y = 2.95;

    bodyGroup.add(baseBall, midBall, headBall, scarf, nose, hatBrim, hatTop);
  } else {
    // frost_totem: Carved Ice Obelisk + floating crystal rings
    const iceMat = new THREE.MeshPhysicalMaterial({
      color: 0x63b3ed,
      emissive: 0x2b6cb0,
      emissiveIntensity: 0.7,
      roughness: 0.15,
      metalness: 0.2,
    });
    const baseStone = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      roughness: 0.8,
    });

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.45, 8), baseStone);
    pedestal.position.y = 0.22;

    const crystalCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), iceMat);
    crystalCore.scale.set(0.85, 1.85, 0.85);
    crystalCore.position.y = 1.65;

    const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 8, 20), iceMat);
    orbitRing.rotation.x = Math.PI / 3;
    orbitRing.position.y = 1.65;

    bodyGroup.add(pedestal, crystalCore, orbitRing);
  }

  return {
    group,
    bodyGroup,
    telegraphRing,
    telegraphMat,
    aimLine,
    aimMat,
  };
}
