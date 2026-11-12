// Parametric, drawing-scaled preview geometry for the 2027 mechanical drawings.
// World units are millimetres (1 Three.js unit = 1 mm). This remains a visual
// reconstruction; unlabelled casting surfaces and hidden details are inferred.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function addMesh(group, geometry, material, position = [0, 0, 0], axis = null) {
  const object = new THREE.Mesh(geometry, material);
  object.position.fromArray(position);
  if (axis) object.quaternion.setFromUnitVectors(V(0, 0, 1), V(...axis).normalize());
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function box(group, material, size, position, rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.position.fromArray(position);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function beamBetween(group, material, start, end, width, height) {
  const a = V(...start), b = V(...end), direction = b.clone().sub(a);
  const object = new THREE.Mesh(new THREE.BoxGeometry(direction.length(), height, width), material);
  object.position.copy(a.add(b).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(V(1, 0, 0), direction.normalize());
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function circlePath(x, y, radius) {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, TAU, true);
  return path;
}

function annulusShape(outer, inner, boltCircle = null) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, TAU, false);
  shape.closePath();
  shape.holes.push(circlePath(0, 0, inner));
  if (boltCircle) {
    const { radius, count, holeRadius, start = 0 } = boltCircle;
    for (let i = 0; i < count; i++) {
      const angle = start + i * TAU / count;
      shape.holes.push(circlePath(radius * Math.cos(angle), radius * Math.sin(angle), holeRadius));
    }
  }
  return shape;
}

function extrudeShape(group, material, shape, depth, position = [0, 0, 0], axis = [0, 0, 1], bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 64,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 2 : 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    steps: 1
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return addMesh(group, geometry, material, position, axis);
}

function annulus(group, material, outer, inner, depth, position = [0, 0, 0], axis = [0, 0, 1], boltCircle = null) {
  return extrudeShape(group, material, annulusShape(outer, inner, boltCircle), depth, position, axis, 0);
}

function cylinder(group, material, radius, depth, position, axis = [0, 0, 1], segments = 64) {
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, segments, 1, false);
  const object = new THREE.Mesh(geometry, material);
  object.position.fromArray(position);
  object.quaternion.setFromUnitVectors(V(0, 1, 0), V(...axis).normalize());
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function bolt(group, material, center, axis = [0, 0, 1], radius = 8) {
  const direction = V(...axis).normalize();
  const headCenter = V(...center).addScaledVector(direction, 2.5);
  cylinder(group, material, radius, 5, headCenter.toArray(), direction.toArray(), 12);
  const socketMaterial = new THREE.MeshStandardMaterial({ color: '#263642', roughness: 0.82, metalness: 0.25 });
  cylinder(group, socketMaterial, radius * 0.42, 0.7, headCenter.clone().addScaledVector(direction, 2.8).toArray(), direction.toArray(), 6);
}

function boltCircle(group, material, center, axis, pitchRadius, count, boltRadius = 8, start = 0) {
  const n = V(...axis).normalize();
  const helper = Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(n, helper).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const c = V(...center);
  for (let i = 0; i < count; i++) {
    const a = start + i * TAU / count;
    const p = c.clone().addScaledVector(u, pitchRadius * Math.cos(a)).addScaledVector(v, pitchRadius * Math.sin(a));
    bolt(group, material, p.toArray(), n.toArray(), boltRadius);
  }
}

function profileShape(points, holes = []) {
  const shape = new THREE.Shape();
  points(shape);
  for (const h of holes) shape.holes.push(circlePath(h.x, h.y, h.r));
  return shape;
}

function addLabel(group, text, position, scale = 130) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = 'rgba(11,30,43,.88)'; ctx.beginPath(); ctx.roundRect(1, 2, 510, 92, 16); ctx.fill();
  ctx.strokeStyle = '#6dced6'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#e2f8f8'; ctx.font = '600 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.position.fromArray(position); sprite.scale.set(scale, scale * 0.19, 1); group.add(sprite);
}

function addRib(group, material, start, end, thickness, width) {
  return beamBetween(group, material, start, end, width, thickness);
}

// A — Ø1640 rotary worktable support; stepped annular casting with radial webs.
function buildA(g, m, explode, labels) {
  // Top working ring and its stepped concentric seats.
  annulus(g, m, 820, 790, 34, [0, 145, 0], [0, 1, 0]);
  annulus(g, m, 790, 550, 38, [0, 92, 0], [0, 1, 0]);
  annulus(g, m, 715, 580, 24, [0, 65, 0], [0, 1, 0]);
  annulus(g, m, 580, 315, 38, [0, 38, 0], [0, 1, 0]);
  annulus(g, m, 315, 245, 175, [0, -12, 0], [0, 1, 0]);
  annulus(g, m, 745, 600, 42, [0, -78, 0], [0, 1, 0]);
  annulus(g, m, 790, 748, 176, [0, 0, 0], [0, 1, 0]);
  annulus(g, m, 610, 570, 130, [0, -8, 0], [0, 1, 0]);
  // Sixteen cast radial webs between the hub and outer skirt.
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16;
    const r0 = 330, r1 = 735;
    addRib(g, m, [r0 * Math.cos(a), -48, r0 * Math.sin(a)], [r1 * Math.cos(a), -48, r1 * Math.sin(a)], 105, 48);
    // Upper gusset pad on each rib.
    box(g, m, [92, 22, 64], [((r0 + r1) / 2) * Math.cos(a), 25, ((r0 + r1) / 2) * Math.sin(a)], [0, -a, 0]);
  }
  // Outer and inner fastening patterns.
  boltCircle(g, m, [0, 139, 0], [0, 1, 0], 780, 24, 10, Math.PI / 24);
  boltCircle(g, m, [0, 137, 0], [0, 1, 0], 302, 12, 9);
  if (labels) { addLabel(g, 'Ø1640 外圆', [0, 160, 0], 180); addLabel(g, 'Ø490 中心孔', [0, 75, 0], 130); }
}

// B — 375 × 430 × 415 spindle housing. The side plates, bearing ring and base
// follow the principal orthographic dimensions visible on the drawing.
function buildB(g, m, explode, labels) {
  box(g, m, [375, 24, 430], [0, 12, 0]);
  const plate = (z) => {
    const shape = profileShape(s => {
      s.moveTo(-187.5, 24); s.lineTo(187.5, 24); s.lineTo(187.5, 170);
      s.lineTo(112, 250); s.lineTo(130, 332); s.lineTo(86, 415);
      s.lineTo(-18, 415); s.lineTo(-42, 365); s.lineTo(-187.5, 330); s.closePath();
    }, [{ x: 60, y: 285, r: 94 }]);
    extrudeShape(g, m, shape, 26, [0, 0, z], [0, 0, 1], 2);
  };
  plate(-178); plate(178);
  // Main bearing housing and machined shoulder.
  annulus(g, m, 130, 95, 430, [60, 285, 0], [0, 0, 1]);
  annulus(g, m, 136, 95, 18, [60, 285, 206], [0, 0, 1]);
  annulus(g, m, 136, 95, 18, [60, 285, -206], [0, 0, -1]);
  boltCircle(g, m, [60, 285, 210], [0, 0, 1], 116, 8, 8, Math.PI / 8);
  // Cast diagonal webs, cross ties and foot pads.
  addRib(g, m, [-165, 38, -160], [25, 250, -160], 24, 32);
  addRib(g, m, [-165, 38, 160], [25, 250, 160], 24, 32);
  addRib(g, m, [160, 38, -160], [120, 200, -160], 22, 28);
  addRib(g, m, [160, 38, 160], [120, 200, 160], 22, 28);
  box(g, m, [375, 34, 430], [0, 29, 0]);
  // Small lower inspection/drive bore on the front face.
  annulus(g, m, 55, 36, 74, [-68, 104, 0], [0, 0, 1]);
  boltCircle(g, m, [-68, 104, 42], [0, 0, 1], 45, 6, 5);
  // Base mounting slots represented as machined bosses and dark bores.
  for (const x of [-140, 140]) for (const z of [-170, 170]) {
    annulus(g, m, 15, 8, 3, [x, 47, z], [0, 1, 0]);
  }
  if (labels) { addLabel(g, '主轴孔 Ø190', [60, 430, 0], 110); addLabel(g, '底座 375', [0, 70, 220], 100); }
}

// C — 600 mm horizontal / 440 mm vertical end-centre offset, Ø315 flanges.
function buildC(g, m, explode, labels) {
  const p0 = V(0, 0, 0), p3 = V(600, 440, 0);
  // Dimensioned 90-degree elbow: straight 240 mm + R200 quarter-bend + 400 mm straight.
  const firstLength = 240, bendLength = Math.PI * 100, lastLength = 400;
  const tBreak1 = firstLength / (firstLength + bendLength + lastLength);
  const tBreak2 = (firstLength + bendLength) / (firstLength + bendLength + lastLength);
  const curve = new THREE.Curve();
  curve.getPoint = (t, target = new THREE.Vector3()) => {
    if (t <= tBreak1) return target.set(0, firstLength * t / tBreak1, 0);
    if (t <= tBreak2) {
      const u = (t - tBreak1) / (tBreak2 - tBreak1), angle = Math.PI - u * Math.PI / 2;
      return target.set(200 + 200 * Math.cos(angle), 240 + 200 * Math.sin(angle), 0);
    }
    const u = (t - tBreak2) / (1 - tBreak2);
    return target.set(200 + 400 * u, 440, 0);
  };
  const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 119, 48, false), m);
  outer.castShadow = outer.receiveShadow = true; g.add(outer);
  const innerMat = new THREE.MeshStandardMaterial({ color: '#263642', roughness: 0.85, metalness: 0.18, side: THREE.DoubleSide });
  const inner = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 99, 48, false), innerMat);
  inner.castShadow = false; inner.receiveShadow = false; g.add(inner);
  const t0 = curve.getTangent(0).normalize(), t1 = curve.getTangent(1).normalize();
  const start = p0.clone().addScaledVector(t0, -9), end = p3.clone().addScaledVector(t1, 9);
  annulus(g, m, 157.5, 100, 22, start.toArray(), t0.toArray());
  annulus(g, m, 157.5, 100, 22, end.toArray(), t1.toArray());
  annulus(g, m, 126, 99, 35, p0.clone().addScaledVector(t0, 16).toArray(), t0.toArray());
  annulus(g, m, 126, 99, 35, p3.clone().addScaledVector(t1, -16).toArray(), t1.toArray());
  boltCircle(g, m, start.clone().addScaledVector(t0, 12).toArray(), t0.toArray(), 130, 8, 9, Math.PI / 8);
  boltCircle(g, m, end.clone().addScaledVector(t1, -12).toArray(), t1.toArray(), 130, 8, 9, Math.PI / 8);
  if (labels) { addLabel(g, '法兰 Ø315 · 8-Ø18', [0, -165, 0], 110); addLabel(g, '中心距 600 × 440', [300, 520, 0], 150); }
}

// D — lifting-beam support: two bearing bosses and a long curved cast arm.
function buildD(g, m, explode, labels) {
  const part = new THREE.Group();
  const main = [0, 350, 0], aux = [510, 190, 0];
  const web = profileShape(s => {
    s.moveTo(-285, 340);
    s.quadraticCurveTo(-245, 90, -20, 55);
    s.quadraticCurveTo(185, 12, 355, 92);
    s.quadraticCurveTo(450, 128, 510, 260);
    s.quadraticCurveTo(600, 390, 760, 475);
    s.lineTo(900, 570); s.lineTo(1050, 738); s.lineTo(1155, 738);
    s.lineTo(1000, 530); s.quadraticCurveTo(820, 350, 650, 205);
    s.quadraticCurveTo(545, 70, 350, 18);
    s.quadraticCurveTo(80, -20, -160, 90);
    s.quadraticCurveTo(-300, 180, -285, 340); s.closePath();
  }, [{ x: 0, y: 350, r: 50 }, { x: 510, y: 190, r: 112 }]);
  extrudeShape(part, m, web, 420, [0, 0, 0], [0, 0, 1], 3);
  // Main and secondary bearing bosses, with drawing-sized bores.
  annulus(part, m, 315, 50, 610, main, [0, 0, 1]);
  annulus(part, m, 325, 50, 22, [0, 350, 294], [0, 0, 1]);
  annulus(part, m, 325, 50, 22, [0, 350, -294], [0, 0, -1]);
  annulus(part, m, 190, 112, 450, aux, [0, 0, 1]);
  annulus(part, m, 200, 112, 20, [510, 190, 215], [0, 0, 1]);
  boltCircle(part, m, [0, 350, 300], [0, 0, 1], 285, 12, 9);
  boltCircle(part, m, [510, 190, 225], [0, 0, 1], 170, 8, 8, Math.PI / 8);
  // Long upper lifting blade with a shallow camber and two edge stiffeners.
  const arm = profileShape(s => {
    s.moveTo(-520, 585); s.quadraticCurveTo(-280, 615, -120, 520);
    s.quadraticCurveTo(120, 405, 300, 325); s.quadraticCurveTo(470, 275, 610, 355);
    s.quadraticCurveTo(820, 495, 1050, 738); s.lineTo(1155, 738);
    s.quadraticCurveTo(960, 500, 735, 345); s.quadraticCurveTo(515, 185, 300, 230);
    s.quadraticCurveTo(80, 285, -95, 430); s.quadraticCurveTo(-280, 570, -520, 550); s.closePath();
  }, [{ x: 0, y: 350, r: 50 }, { x: 510, y: 190, r: 112 }]);
  extrudeShape(part, m, arm, 150, [0, 0, 0], [0, 0, 1], 2);
  beamBetween(part, m, [-470, 580, 60], [1025, 700, 60], 22, 26);
  beamBetween(part, m, [-470, 580, -60], [1025, 700, -60], 22, 26);
  // Web-to-boss fillets represented by curved gussets.
  addRib(part, m, [-170, 100, -70], [0, 80, -70], 42, 80);
  addRib(part, m, [360, 110, 0], [510, 80, 0], 36, 80);
  if (labels) { addLabel(part, '主轴承孔 Ø100', [0, 700, 0], 140); addLabel(part, '副孔 Ø224', [510, 390, 0], 110); }
  // Drawing envelope: 1155 mm long, 738 mm high; width is reconstructed from the side views.
  part.scale.set(.69, .97, 1);
  part.position.set(360, 20, 0);
  g.add(part);
}
function halfArchShape(outer, inner) {
  const shape = new THREE.Shape();
  shape.moveTo(-outer, 0); shape.absarc(0, 0, outer, Math.PI, 0, true);
  shape.lineTo(inner, 0); shape.absarc(0, 0, inner, 0, Math.PI, false); shape.closePath();
  return shape;
}

function halfCylinderShell(group, material, length, outerRadius, innerRadius) {
  const segmentsLength = 36, segmentsArc = 64;
  for (const [radius, reverse] of [[outerRadius, false], [innerRadius, true]]) {
    const positions = [], indices = [];
    for (let i = 0; i <= segmentsLength; i++) {
      const x = -length / 2 + length * i / segmentsLength;
      for (let j = 0; j <= segmentsArc; j++) {
        const a = Math.PI * j / segmentsArc;
        positions.push(x, radius * Math.sin(a), radius * Math.cos(a));
      }
    }
    for (let i = 0; i < segmentsLength; i++) for (let j = 0; j < segmentsArc; j++) {
      const a = i * (segmentsArc + 1) + j, b = a + segmentsArc + 1;
      if (!reverse) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  // End rings in the semicircular cross-section.
  const archAxis = [1, 0, 0];
  extrudeShape(group, material, halfArchShape(outerRadius, innerRadius), 24, [-length / 2, 0, 0], archAxis);
  extrudeShape(group, material, halfArchShape(outerRadius, innerRadius), 24, [length / 2, 0, 0], archAxis);
  // Longitudinal base rails and intermittent arch ribs.
  for (const z of [-outerRadius, outerRadius]) box(group, material, [length, 34, 55], [0, -8, z]);
  for (const x of [-length * .38, 0, length * .38]) {
    extrudeShape(group, material, halfArchShape(outerRadius - 6, innerRadius + 10), 18, [x, 0, 0], archAxis);
  }
}

// E — rear bearing cover: 1160-long semicircular hood, R410 arch and base rails.
function buildE(g, m, explode, labels) {
  halfCylinderShell(g, m, 1160, 410, 382);
  // Base mounting ears and regularly spaced fastening points.
  for (const z of [-410, 410]) {
    box(g, m, [1160, 28, 68], [0, -4, z]);
    for (let i = 0; i < 10; i++) {
      const x = -520 + i * 115.5;
      annulus(g, m, 16, 8, 4, [x, 13, z], [0, 1, 0]);
    }
  }
  // Top inspection/oil boss shown at the crown of the drawing.
  annulus(g, m, 75, 48, 42, [0, 408, 0], [0, 1, 0]);
  annulus(g, m, 60, 48, 18, [0, 433, 0], [0, 1, 0]);
  boltCircle(g, m, [0, 432, 0], [0, 1, 0], 66, 3, 7);
  // Side strengthening pads and split-line lips.
  for (const x of [-470, -235, 235, 470]) {
    beamBetween(g, m, [x, 15, -385], [x, 330, -235], 28, 24);
    beamBetween(g, m, [x, 15, 385], [x, 330, 235], 28, 24);
  }
  if (labels) { addLabel(g, '半圆罩 · R410', [0, 470, 0], 150); addLabel(g, '长度 1160', [0, 30, 460], 130); }
}

// F — 440-wide cast bracket, 360-deep, 117-high with Ø40 upper eyes.
function buildF(g, m, explode, labels) {
  const makeFrame = (z) => {
    const shape = profileShape(s => {
      s.moveTo(-220, 0); s.lineTo(-220, 30);
      s.quadraticCurveTo(-218, 62, -190, 72); s.lineTo(-165, 101);
      s.quadraticCurveTo(-150, 117, -130, 112); s.lineTo(-110, 86);
      s.quadraticCurveTo(-65, 72, 0, 92); s.quadraticCurveTo(65, 112, 110, 86);
      s.lineTo(130, 112); s.quadraticCurveTo(150, 117, 165, 101);
      s.lineTo(190, 72); s.quadraticCurveTo(218, 62, 220, 30);
      s.lineTo(220, 0); s.lineTo(165, 0); s.lineTo(165, 26);
      s.quadraticCurveTo(150, 48, 125, 50); s.quadraticCurveTo(70, 54, 0, 58);
      s.quadraticCurveTo(-70, 54, -125, 50); s.quadraticCurveTo(-150, 48, -165, 26);
      s.lineTo(-165, 0); s.closePath();
    }, [
      { x: -143, y: 78, r: 20 }, { x: 143, y: 78, r: 20 },
      { x: -165, y: 43, r: 18 }, { x: -85, y: 48, r: 18 },
      { x: 85, y: 48, r: 18 }, { x: 165, y: 43, r: 18 }
    ]);
    extrudeShape(g, m, shape, 24, [0, 0, z], [0, 0, 1], 1.5);
  };
  makeFrame(-155); makeFrame(155);
  // Two longitudinal rails tie the frames into a deep bracket.
  box(g, m, [280, 28, 310], [0, 28, 0]);
  box(g, m, [360, 18, 34], [0, 8, -150]);
  box(g, m, [360, 18, 34], [0, 8, 150]);
  for (const x of [-143, 143]) {
    annulus(g, m, 40, 20, 360, [x, 78, 0], [0, 0, 1]);
    annulus(g, m, 48, 20, 16, [x, 78, 180], [0, 0, 1]);
    annulus(g, m, 48, 20, 16, [x, 78, -180], [0, 0, -1]);
  }
  // Lower cast feet and reinforcing cross ribs.
  for (const x of [-178, 178]) {
    box(g, m, [84, 25, 350], [x, 12, 0]);
    for (const z of [-125, 125]) annulus(g, m, 14, 8, 4, [x, 27, z], [0, 1, 0]);
  }
  addRib(g, m, [-170, 40, -135], [-80, 82, -135], 18, 22);
  addRib(g, m, [170, 40, 135], [80, 82, 135], 18, 22);
  if (labels) { addLabel(g, '上耳孔 Ø40', [0, 155, 0], 100); addLabel(g, '总宽 440', [0, 8, 210], 110); }
}

function rectWithCircleHole(width, height, cx, cy, radius) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.closePath();
  s.holes.push(circlePath(cx, cy, radius));
  return s;
}

// G — 606 × 945 × 990 enclosure, Ø566 main access flange and three upper ports.
function buildG(g, m, explode, labels) {
  const W = 606, H = 990, L = 945, zf = L / 2;
  // Hollow rectangular pressure-casting shell: panels rather than a solid block.
  box(g, m, [W, 36, L], [0, 18, 0]);
  box(g, m, [W, 36, L], [0, H - 18, 0]);
  box(g, m, [36, H - 72, L], [-W / 2 + 18, H / 2, 0]);
  box(g, m, [36, H - 72, L], [W / 2 - 18, H / 2, 0]);
  const portY = 368;
  extrudeShape(g, m, rectWithCircleHole(W - 72, H - 72, 0, portY, 272), 32, [0, 0, zf - 16], [0, 0, 1]);
  extrudeShape(g, m, rectWithCircleHole(W - 72, H - 72, 0, portY, 272), 32, [0, 0, -zf + 16], [0, 0, -1]);
  // Large circular duct and precision face flanges.
  annulus(g, m, 283, 272, L - 70, [0, portY, 0], [0, 0, 1]);
  annulus(g, m, 283, 272, 28, [0, portY, zf - 14], [0, 0, 1]);
  annulus(g, m, 283, 272, 28, [0, portY, -zf + 14], [0, 0, -1]);
  boltCircle(g, m, [0, portY, zf - 5], [0, 0, 1], 272, 12, 9, Math.PI / 12);
  boltCircle(g, m, [0, portY, -zf + 5], [0, 0, -1], 272, 12, 9, Math.PI / 12);
  // Three upper inspection bosses (Ø132 outside, Ø79 opening in the drawing).
  for (const x of [-155, 0, 155]) {
    annulus(g, m, 66, 39.5, 52, [x, 815, zf - 26], [0, 0, 1]);
    annulus(g, m, 66, 39.5, 52, [x, 815, -zf + 26], [0, 0, -1]);
    boltCircle(g, m, [x, 815, zf - 5], [0, 0, 1], 54, 6, 6, Math.PI / 6);
  }
  // External cast ribs, feet and a lower service opening.
  for (const z of [-330, 330]) {
    addRib(g, m, [-270, 80, z], [-190, 335, z], 28, 38);
    addRib(g, m, [270, 80, z], [190, 335, z], 28, 38);
    addRib(g, m, [-260, 730, z], [-170, 820, z], 24, 32);
    addRib(g, m, [260, 730, z], [170, 820, z], 24, 32);
  }
  annulus(g, m, 50, 34, 70, [0, 130, zf + 15], [0, 0, 1]);
  for (const x of [-250, 250]) box(g, m, [110, 36, 220], [x, 18, 0]);
  if (labels) { addLabel(g, '主法兰 Ø566', [0, 700, zf + 40], 140); addLabel(g, '3 × 上部接口', [0, 910, zf + 30], 130); }
}

// H — 680 × 650 × 890 housing, Ø540 front flange and Ø530 shell.
function buildH(g, m, explode, labels) {
  const W = 680, H = 890, L = 650, zf = L / 2, cy = 550;
  // Main cylindrical chamber with its open through-bore.
  annulus(g, m, 265, 220, L - 56, [0, cy, 0], [0, 0, 1]);
  annulus(g, m, 270, 220, 30, [0, cy, zf - 15], [0, 0, 1]);
  annulus(g, m, 270, 220, 30, [0, cy, -zf + 15], [0, 0, -1]);
  boltCircle(g, m, [0, cy, zf - 5], [0, 0, 1], 250, 12, 9, Math.PI / 12);
  boltCircle(g, m, [0, cy, -zf + 5], [0, 0, -1], 250, 12, 9, Math.PI / 12);
  // Outer rectangular support frame, 680 wide and 890 high.
  box(g, m, [W, 30, L], [0, 15, 0]);
  box(g, m, [W, 30, L], [0, H - 15, 0]);
  for (const x of [-325, 325]) {
    box(g, m, [30, H - 60, L], [x, H / 2, 0]);
    box(g, m, [55, 34, L], [x, 290, 0]);
    addRib(g, m, [x * .88, 42, -250], [x * .88, 270, -205], 30, 42);
    addRib(g, m, [x * .88, 42, 250], [x * .88, 270, 205], 30, 42);
  }
  // Internal radial support vanes visible in the section views.
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    const r0 = 220, r1 = 255;
    addRib(g, m, [r0 * Math.cos(a), cy + r0 * Math.sin(a), -190], [r1 * Math.cos(a), cy + r1 * Math.sin(a), -190], 16, 24);
  }
  // Top and lower service bosses from the detail views.
  annulus(g, m, 60, 31, 45, [0, 820, 0], [0, 1, 0]);
  annulus(g, m, 71, 42.5, 48, [0, 150, zf - 24], [0, 0, 1]);
  annulus(g, m, 71, 42.5, 48, [0, 150, -zf + 24], [0, 0, -1]);
  boltCircle(g, m, [0, 150, zf - 5], [0, 0, 1], 58, 6, 6);
  // Cross braces and side mounting lugs.
  for (const z of [-zf + 18, zf - 18]) {
    box(g, m, [W, 20, 35], [0, 290, z]);
    box(g, m, [W, 20, 35], [0, 820, z]);
  }
  for (const x of [-325, 325]) for (const z of [-240, 240]) annulus(g, m, 18, 9, 4, [x, 280, z], [1, 0, 0]);
  if (labels) { addLabel(g, '主壳体 Ø530', [0, 840, zf + 25], 120); addLabel(g, '机架 680 × 890', [0, 60, zf + 25], 120); }
}

const builders = { A: buildA, B: buildB, C: buildC, D: buildD, E: buildE, F: buildF, G: buildG, H: buildH };

export function buildPart(id, material, explode = 0, labels = false) {
  const root = new THREE.Group();
  root.name = `Part-${id}-millimetres`;
  (builders[id] || buildB)(root, material, explode, labels);
  root.userData.units = 'mm';
  return root;
}

export function disposePart(root, preservedMaterial) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
      if (item !== preservedMaterial) { materials.add(item); if (item.map) textures.add(item.map); }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}
