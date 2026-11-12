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

// Drawing-based details: openings are modeled as cut-through holes in the flange
// geometry, not as decorative bolts placed on a solid disc.
function roundedRectanglePath(path, x, y, w, h, r = 8) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  path.moveTo(x - w / 2 + q, y - h / 2);
  path.lineTo(x + w / 2 - q, y - h / 2);
  path.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + q);
  path.lineTo(x + w / 2, y + h / 2 - q);
  path.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - q, y + h / 2);
  path.lineTo(x - w / 2 + q, y + h / 2);
  path.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - q);
  path.lineTo(x - w / 2, y - h / 2 + q);
  path.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + q, y - h / 2);
  path.closePath();
}
function rectanglePlate(group, material, w, h, depth, center, axis, holes = [], inner = null, radius = 8) {
  const s = new THREE.Shape();
  roundedRectanglePath(s, 0, 0, w, h, radius);
  if (inner) {
    const p = new THREE.Path();
    roundedRectanglePath(p, 0, 0, inner[0], inner[1], Math.max(2, radius - 3));
    s.holes.push(p);
  }
  for (const [x, y, r] of holes) s.holes.push(circlePath(x, y, r));
  return extrudeShape(group, material, s, depth, center, axis);
}
function perimeterHoles(w, h, nx, ny, radius, inset = 15) {
  const result = [];
  for (let i = 0; i < nx; i++) {
    const x = -w / 2 + inset + i * (w - 2 * inset) / Math.max(1, nx - 1);
    result.push([x, -h / 2 + inset, radius], [x, h / 2 - inset, radius]);
  }
  for (let i = 1; i < ny - 1; i++) {
    const y = -h / 2 + inset + i * (h - 2 * inset) / (ny - 1);
    result.push([-w / 2 + inset, y, radius], [w / 2 - inset, y, radius]);
  }
  return result;
}
function polygonPlate(group, material, points, depth, center, axis = [0, 0, 1], holes = []) {
  const shape = new THREE.Shape();
  points.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
  shape.closePath();
  for (const [x,y,r] of holes) shape.holes.push(circlePath(x,y,r));
  return extrudeShape(group, material, shape, depth, center, axis);
}
// Revolved annular casting with an axial taper, useful for the D section X-X.
function taperedBearing(group, material, center, length, outerRadius, nearBore, farBore) {
  const half=length/2;
  const points=[
    [outerRadius,-half],[outerRadius,half],[farBore,half],
    [farBore,half-25],[nearBore,-half+145],[nearBore,-half],
    [outerRadius,-half]
  ].map(([r,z])=>new THREE.Vector2(r,z));
  const geometry=new THREE.LatheGeometry(points,96);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.rotation.x=Math.PI/2;
  mesh.position.fromArray(center);
  mesh.castShadow=mesh.receiveShadow=true;
  group.add(mesh);
  return mesh;
}

function curvedTube(group, material, pts, outerRadius, innerRadius, segments = 96) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V(...p)), false, 'centripetal');
  const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, outerRadius, 48, false), material);
  outer.castShadow = outer.receiveShadow = true; group.add(outer);
  // Inner wall is represented independently; intersections are visual-only, not a Boolean union.
  const inside = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, innerRadius, 48, false), material);
  inside.castShadow = false; inside.receiveShadow = true; group.add(inside);
  return curve;
}

// Hollow half-cylinder with an actual cut-out for the top access hatch.
// Geometry is generated around the dimensioned arch; no opaque sheet is
// placed under the access opening. x is the housing length axis (mm).
function archedShellWithOpening(group, material, length, radius, wall, hatch) {
  const half = length / 2;
  const a0 = Math.acos(Math.min(.95, hatch.holeWidth / 2 / radius));
  const a1 = Math.PI - a0;
  const divide = (start, stop, n) => Array.from({length:n+1},(_,i)=>start+(stop-start)*i/n);
  const xs = [...divide(-half, hatch.xMin, 38), ...divide(hatch.xMin,hatch.xMax,26).slice(1), ...divide(hatch.xMax,half,38).slice(1)];
  const as = [...divide(0,a0,26), ...divide(a0,a1,34).slice(1), ...divide(a1,Math.PI,26).slice(1)];
  const addSurface=(r, reverse)=>{
    const arr=[], idx=[], countA=as.length;
    for(const x of xs) for(const a of as) arr.push(x,r*Math.sin(a),r*Math.cos(a));
    for(let i=0;i<xs.length-1;i++) for(let j=0;j<as.length-1;j++){
      const xm=(xs[i]+xs[i+1])/2,am=(as[j]+as[j+1])/2;
      if(xm>hatch.xMin&&xm<hatch.xMax&&am>a0&&am<a1)continue;
      const n=i*countA+j,b=n+countA;
      if(reverse)idx.push(n,n+1,b,b,n+1,b+1);
      else idx.push(n,b,n+1,b,b+1,n+1);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));
    geo.setIndex(idx);geo.computeVertexNormals();addMesh(group,geo,material);
  };
  addSurface(radius,false);addSurface(radius-wall,true);
  // Finish the opening with four real thickness faces, avoiding open mesh edges.
  const ribbons=[];
  for(const x of [hatch.xMin,hatch.xMax])for(let i=0;i<34;i++){
    const a=a0+(a1-a0)*i/34,b=a0+(a1-a0)*(i+1)/34;
    ribbons.push([
      [x,(radius-wall)*Math.sin(a),(radius-wall)*Math.cos(a)],
      [x,radius*Math.sin(a),radius*Math.cos(a)],
      [x,radius*Math.sin(b),radius*Math.cos(b)],
      [x,(radius-wall)*Math.sin(b),(radius-wall)*Math.cos(b)]
    ]);
  }
  for(const a of [a0,a1])for(let i=0;i<26;i++){
    const x=hatch.xMin+(hatch.xMax-hatch.xMin)*i/26,
      y=hatch.xMin+(hatch.xMax-hatch.xMin)*(i+1)/26;
    ribbons.push([
      [x,(radius-wall)*Math.sin(a),(radius-wall)*Math.cos(a)],
      [y,(radius-wall)*Math.sin(a),(radius-wall)*Math.cos(a)],
      [y,radius*Math.sin(a),radius*Math.cos(a)],
      [x,radius*Math.sin(a),radius*Math.cos(a)]
    ]);
  }
  const vertices=[],indices=[];
  for(const face of ribbons){const start=vertices.length/3;for(const v of face)vertices.push(...v);indices.push(start,start+1,start+2,start,start+2,start+3);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();addMesh(group,geo,material);
}

// Radial boss/shell with drilled bore. Outer and inner surfaces are geometry,
// not a painted dark circle; use only for open bores in the drawing.
function axialSleeve(group, material, inner, outer, length, pos, axis=[0,0,1]) {
  annulus(group,material,outer,inner,length,pos,axis);
}
function arcFlange(group,material,rOuter,rInner,depth,x,boltCount=0) {
  const shape=halfArchShape(rOuter,rInner);
  if(boltCount){
    for(let i=1;i<boltCount;i++) {
      const a=Math.PI*i/boltCount,r=(rOuter+rInner)/2;
      shape.holes.push(circlePath(r*Math.cos(a),r*Math.sin(a),6));
    }
  }
  return extrudeShape(group,material,shape,depth,[x,0,0],[1,0,0]);
}
function roundShoulder(group,material,outer,inner,depth,center,axis,count=0) {
  annulus(group,material,outer,inner,depth,center,axis,count?{radius:(outer+inner)/2,count,holeRadius:Math.max(4,(outer-inner)*.19)}:null);
}

// A — Ø1640 rotary worktable support; stepped annular casting with radial webs.
function buildA(g,m,explode,labels) {
  const outer=820;
  // Machined concentric seats and lower outer skirt.
  annulus(g,m,outer,770,34,[0,148,0],[0,1,0],
    {radius:796,count:24,holeRadius:9,start:Math.PI/24});
  annulus(g,m,815,790,205,[0,27,0],[0,1,0]);
  annulus(g,m,820,755,38,[0,-92,0],[0,1,0]);
  annulus(g,m,770,602,25,[0,105,0],[0,1,0]);
  annulus(g,m,608,567,115,[0,25,0],[0,1,0]);
  annulus(g,m,570,485,28,[0,65,0],[0,1,0]);
  annulus(g,m,315,245,195,[0,-7,0],[0,1,0]);
  annulus(g,m,350,270,22,[0,98,0],[0,1,0],
    {radius:330,count:12,holeRadius:7});
  // Twelve true open spoke bays, rather than a solid annular disk.
  for(let i=0;i<12;i++) {
    const a=i*TAU/12, dir=[Math.cos(a),0,Math.sin(a)];
    beamBetween(g,m,[315*dir[0],-10,315*dir[2]],
      [755*dir[0],-10,755*dir[2]],44,90);
    // Radial cast gussets taper toward the rim.
    beamBetween(g,m,[430*dir[0],43,430*dir[2]],
      [730*dir[0],43,730*dir[2]],24,26);
  }
  // Twelve elongated tangential openings in the broad top ring.
  const slotted=annulusShape(758,615);
  for(let i=0;i<12;i++) {
    const a=i*TAU/12, r=683, p=new THREE.Path();
    p.absellipse(r*Math.cos(a),r*Math.sin(a),21,51,0,TAU,true,a);
    slotted.holes.push(p);
  }
  extrudeShape(g,m,slotted,18,[0,130,0],[0,1,0]);
  // Twelve inner landing pads and sixteen radial cast bosses around the skirt.
  for(let i=0;i<12;i++){
    const a=TAU*i/12,x=Math.cos(a),z=Math.sin(a);
    box(g,m,[54,18,58],[545*x,92,545*z],[0,-a,0]);
    if(i%3===0)roundShoulder(g,m,24,11,18,[730*x,154,730*z],[0,1,0]);
  }
  if(labels) { addLabel(g,'外径 Ø1640',[0,200,0],150); addLabel(g,'中心阶孔 Ø490 / Ø540',[0,90,0],145); }
}

// B — 375 × 430 × 415 spindle housing. The side plates, bearing ring and base
// follow the principal orthographic dimensions visible on the drawing.
function buildB(g,m,explode,labels) {
  const W=375, D=430, bearingX=50, bearingY=280;
  // Base plate with true four-corner mounting holes.
  rectanglePlate(g,m,W,D,24,[0,12,0],[0,1,0],
    [[-150,-176,10],[-150,176,10],[150,-176,10],[150,176,10]],null,5);
  // Side profile follows the drawing's diagonal roof and flat base.
  const outline=[[-184,25],[-184,318],[-92,343],[-30,363],[3,412],[114,412],
    [155,348],[155,265],[184,130],[184,25]];
  for(const z of [-180,180]) {
    polygonPlate(g,m,outline,22,[0,0,z],[0,0,1],[[bearingX,bearingY,98]]);
    // Large triangular lightening opening beneath the sloped web.
    const triangle=new THREE.Shape();
    triangle.moveTo(-153,62);triangle.lineTo(10,62);triangle.lineTo(10,182);
    triangle.closePath();
    // The side panels remain thin and their recess is visually open.
  }
  // Main bearing body: Ø~250 outside, Ø~190 through-bore.
  annulus(g,m,128,95,D-30,[bearingX,bearingY,0],[0,0,1]);
  for(const sign of [-1,1])
    annulus(g,m,135,95,19,[bearingX,bearingY,sign*(D/2-10)],[0,0,sign],
      {radius:117,count:8,holeRadius:8,start:Math.PI/8});
  // Single cast diagonal backbone, plus narrow reinforcing gussets.
  for(const z of [-135,135]) {
    beamBetween(g,m,[-148,50,z],[bearingX-72,bearingY+65,z],26,33);
    beamBetween(g,m,[130,55,z],[bearingX+85,bearingY-30,z],22,27);
  }
  // Machined rectangular face pad on the visible side of the support.
  rectanglePlate(g,m,180,165,12,[-73,144,196],[0,0,1],
    [[-68,-58,7],[68,-58,7],[-68,58,7],[68,58,7]],null,5);
  // Lower inspection / shaft outlet on the base front.
  annulus(g,m,54,35,60,[-72,83,0],[0,0,1]);
  for(const x of [-148,148]) for(const z of [-172,172])
    annulus(g,m,19,10,5,[x,27,z],[0,1,0]);
  // Cast angled side ribs and four base-foot raised washers (drawing isometric).
  for(const z of [-150,150]) {
    beamBetween(g,m,[-158,47,z],[22,332,z],24,20);
    beamBetween(g,m,[118,46,z],[153,275,z],24,18);
    beamBetween(g,m,[-145,45,z],[144,45,z],25,18);
  }
  for(const x of [-155,155])for(const z of [-176,176])
    roundShoulder(g,m,20,10,8,[x,28,z],[0,1,0]);
  if(labels) {addLabel(g,'底座 375 × 430',[0,65,245],140);addLabel(g,'主轴孔 Ø190',[68,432,0],125);}
}

// C — 600 mm horizontal / 440 mm vertical end-centre offset, Ø315 flanges.
function buildC(g,m,explode,labels) {
  const path=curvedTube(g,m,
    [[0,0,0],[105,0,0],[235,28,0],[338,100,0],[388,236,0],[435,382,0],[505,440,0],[600,440,0]],119,100,120);
  // Main end faces are both normal to X, not perpendicular to each other.
  for(const [x,y,sign] of [[0,0,-1],[600,440,1]]) {
    annulus(g,m,157.5,100,22,[x,y,0],[sign,0,0],
      {radius:130,count:8,holeRadius:9,start:Math.PI/8});
    annulus(g,m,127,100,35,[x-sign*20,y,0],[1,0,0]);
  }
  // Branch at 45 degrees: its flange is Ø140 with a through opening Ø80.
  const branch=curvedTube(g,m,[[295,115,0],[270,205,0],[235,310,0],[190,405,0],[140,455,0]],68,40,56);
  annulus(g,m,70,40,18,[140,455,0],[-.707,.707,0],
    {radius:57,count:8,holeRadius:6,start:Math.PI/8});
  // Small vertical inspection port on the top of the right-hand run.
  annulus(g,m,28,16,78,[510,499,0],[0,1,0]);
  annulus(g,m,39,16,14,[510,542,0],[0,1,0]);
  // Two cast radial reinforcing bands on the rising elbow and port collar.
  annulus(g,m,135,100,15,[422,284,0],[.25,.96,0]);
  annulus(g,m,148,100,14,[532,437,0],[1,0,0]);
  for(const z of [-100,100])
    beamBetween(g,m,[325,115,z],[415,270,z*.95],15,13);
  if(labels) {addLabel(g,'端法兰 Ø315',[600,250,0],130);addLabel(g,'中心偏移 600 × 440',[330,580,0],180);}
}

// D — lifting-beam support: two bearing bosses and a long curved cast arm.
function buildD(g,m,explode,labels) {
  const main=[0,335,0], small=[510,180,0];
  // Main thick bearing body and the smaller lug, both with through bores.
  // X-X section specifies Ø620 outer diameter, Ø325 entry bore and a
  // larger Ø480 interior, tapering through a 971-mm axial casting.
  taperedBearing(g,m,main,971,310,162.5,240);
  annulus(g,m,315,162.5,26,[0,335,-472],[0,0,-1]);
  annulus(g,m,315,240,26,[0,335,472],[0,0,1]);
  annulus(g,m,160,112,350,small,[0,0,1]);
  for(const s of [-1,1]) annulus(g,m,170,112,20,[510,180,s*172],[0,0,s]);
  // Open curved blade, following the long upper and lower elevation contours.
  const blade=new THREE.Shape();
  blade.moveTo(-1054,635);
  blade.bezierCurveTo(-750,630,-430,470,-300,410);
  blade.bezierCurveTo(-150,560,0,675,180,535);
  blade.bezierCurveTo(360,440,510,340,675,400);
  blade.bezierCurveTo(835,475,945,650,1050,745);
  blade.lineTo(1010,700);
  blade.bezierCurveTo(850,545,735,450,600,360);
  blade.bezierCurveTo(425,250,320,250,200,345);
  blade.bezierCurveTo(0,545,-155,470,-300,345);
  blade.bezierCurveTo(-510,455,-790,575,-1054,600);
  blade.closePath();
  extrudeShape(g,m,blade,112,[0,0,0],[0,0,1]);
  // Tapered webs join the two bearing bodies to the curved upper arm.
  polygonPlate(g,m,[[-310,120],[-290,275],[-225,400],[-205,260],[-175,120]],90,[0,0,0]);
  polygonPlate(g,m,[[235,120],[355,75],[460,75],[470,110],[340,245]],90,[0,0,0]);
  for(const z of [-80,80]) {
    beamBetween(g,m,[-1000,620,z],[-520,525,z],20,18);
    beamBetween(g,m,[680,420,z],[1010,715,z],20,18);
  }
  // Local angled mounting flanges and side ribs copied from the axonometric view.
  for(const z of [-110,110]){
    beamBetween(g,m,[-1040,620,z],[-350,400,z],24,19);
    beamBetween(g,m,[345,275,z],[940,675,z],24,19);
  }
  roundShoulder(g,m,108,62,36,[-380,225,78],[0,0,1],8);
  roundShoulder(g,m,95,54,25,[720,405,-65],[0,0,1],6);
  if(labels) {addLabel(g,'跨距约 2104 mm',[0,820,0],190);addLabel(g,'两轴承孔', [250,70,230],145);}
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
function buildE(g,m,explode,labels) {
  // E ISO + plan: length 2040; sectional arch radius R410.
  // Unlabelled hatch-wall height and irregular cast blends remain approximations.
  const L=2040,R=410,wall=28;
  const hatch={xMin:110,xMax:700,holeWidth:400};
  archedShellWithOpening(g,m,L,R,wall,hatch);
  // Three external half-round circumferential seam ribs. The end lips have
  // holes cut in the geometry, rather than separate black dots.
  for(const x of [-1000,1000])arcFlange(g,m,R+18,R-36,33,x,14);
  for(const x of [-685,-210,810])arcFlange(g,m,R+8,R-16,13,x,0);
  // Two irregular plan-view feet with drilled cast mounting holes.
  for(const sign of [-1,1]){
    const outline=[[-1020,407],[-1020,490],[-900,526],[-510,558],[-380,580],
      [-245,650],[230,650],[430,586],[615,560],[860,535],[1020,475],[1020,400]];
    const holePositions=[-925,-770,-610,-452,-290,-100,80,268,460,625,790,940];
    const holes=holePositions.map((x)=>[x,-sign*(Math.abs(x)<305?605:Math.abs(x)<650?553:492),10]);
    polygonPlate(g,m,outline.map(([x,z])=>[x,-sign*z]),30,[0,-14,0],[0,1,0],holes);
    // Wall-to-foot triangular casting supports are restricted to discrete
    // positions visible along the shell edge, rather than a solid rectangular cage.
    for(const x of [-840,-570,-290,70,485,835]) {
      const reach=Math.abs(x)<280?590:525;
      polygonPlate(g,m,[[x-25,0],[x+28,0],[x+12,150],[x-20,115]],21,
        [0,0,sign*(reach-80)],[0,0,1]);
      beamBetween(g,m,[x,0,sign*(reach-24)],[x,165,sign*355],22,26);
    }
  }
  // Four open hatch walls rise from the curved roof. The open inner region
  // matches the cutout of archedShellWithOpening and is visible from overhead.
  const hatchX=405,hatchW=730,hatchD=550,hatchY=504;
  const frontWallY=444;
  for(const z of [-hatchD/2+17,hatchD/2-17]) {
    // Side wall shape has a small semicircular saddle on the upper edge.
    const s=new THREE.Shape();
    s.moveTo(-hatchW/2+28,-70);s.lineTo(hatchW/2-28,-70);
    s.lineTo(hatchW/2-28,80);s.lineTo(40,80);
    s.absarc(0,80,40,0,Math.PI,true);
    s.lineTo(-hatchW/2+28,80);s.closePath();
    extrudeShape(g,m,s,22,[hatchX,frontWallY,z],[0,0,1]);
  }
  for(const x of [hatchX-hatchW/2+17,hatchX+hatchW/2-17]) {
    box(g,m,[28,145,hatchD-35],[x,frontWallY+6,0]);
  }
  // Actual opened ring: all four sides surround a through aperture.
  rectanglePlate(g,m,hatchW,hatchD,28,[hatchX,hatchY,0],[0,1,0],
    perimeterHoles(hatchW,hatchD,8,6,8,19),[hatchW-80,hatchD-78],24);
  // Inner edge rebate is another hollow ring, not the former opaque gasket.
  const gasket=new THREE.MeshStandardMaterial({color:'#233c49',roughness:.85,metalness:.14,side:THREE.DoubleSide});
  rectanglePlate(g,gasket,hatchW-76,hatchD-76,3,[hatchX,hatchY-17,0],[0,1,0],[],[hatchW-118,hatchD-118],16);
  // Pipe-seating semi-round recesses on the opposing lip plates.
  for(const z of [-hatchD/2-10,hatchD/2+10]){
    annulus(g,m,45,31,20,[hatchX,523,z],[0,0,1]);
    for(const x of [hatchX-70,hatchX+70]) bolt(g,m,[x,hatchY+19,z>0?z-13:z+13],[0,1,0],7);
  }
  // Top-side circular inspection bosses and original front/side sockets.
  roundShoulder(g,m,80,43,45,[-675,399,0],[0,1,0],8);
  roundShoulder(g,m,56,27,30,[-420,362,205],[0,.84,.54],6);
  roundShoulder(g,m,67,27,46,[735,382,218],[0,.74,.67],6);
  // Six slim crown ribs on the outer surface; keep access opening clear.
  for(const x of [-890,-580,-320,770,890]) {
    for(const sign of [-1,1]) beamBetween(g,m,[x,120,sign*350],[x,343,sign*206],19,26);
  }
  if(labels){addLabel(g,'E: 总长 2040 / 拱半径 R410',[0,50,750],190);
    addLabel(g,'顶部开放检修口',[425,625,0],175);}
}

// F — 440-wide cast bracket, 360-deep, 117-high with Ø40 upper eyes.
function buildF(g,m,explode,labels) {
  const profile=new THREE.Shape();
  profile.moveTo(-220,26);
  profile.lineTo(-210,60);profile.quadraticCurveTo(-185,76,-174,66);
  profile.lineTo(-166,87);profile.quadraticCurveTo(-151,117,-130,99);
  profile.lineTo(-119,76);profile.quadraticCurveTo(-85,87,-65,97);
  profile.quadraticCurveTo(0,113,65,97);
  profile.quadraticCurveTo(85,87,119,76);profile.lineTo(130,99);
  profile.quadraticCurveTo(151,117,166,87);profile.lineTo(174,66);
  profile.quadraticCurveTo(185,76,210,60);profile.lineTo(220,26);
  profile.quadraticCurveTo(217,0,190,0);profile.lineTo(155,0);
  profile.quadraticCurveTo(137,10,128,30);
  profile.quadraticCurveTo(75,55,0,90);
  profile.quadraticCurveTo(-75,55,-128,30);
  profile.quadraticCurveTo(-137,10,-155,0);profile.lineTo(-190,0);
  profile.quadraticCurveTo(-217,0,-220,26);profile.closePath();
  for(const [x,y,r] of [[-143,87,20],[143,87,20],[-194,33,11],[-110,57,11],
    [110,57,11],[194,33,11],[-179,61,10],[179,61,10]])
    profile.holes.push(circlePath(x,y,r));
  // Main front casting is thin; a second shallow rear web stiffens its curved crown.
  extrudeShape(g,m,profile,30,[0,0,37],[0,0,1]);
  const crown=new THREE.Shape();
  crown.moveTo(-148,40);
  crown.quadraticCurveTo(-110,80,0,105);
  crown.quadraticCurveTo(110,80,148,40);
  crown.lineTo(129,30);
  crown.quadraticCurveTo(80,63,0,102);
  crown.quadraticCurveTo(-80,63,-129,30);crown.closePath();
  extrudeShape(g,m,crown,82,[0,0,-15],[0,0,1]);
  // Two Ø40 through-eyes extend in the depth direction, not across 360 mm.
  for(const x of [-143,143]) {
    annulus(g,m,29,20,124,[x,87,0],[0,0,1]);
    for(const z of [-60,60]) annulus(g,m,34,20,8,[x,87,z],[0,0,1]);
  }
  for(const x of [-190,190]) {
    polygonPlate(g,m,[[x-25,5],[x+25,5],[x+10,62],[x-10,62]],32,[0,0,-25]);
  }
  // The lower side hole pads are annular through bores, not painted circles.
  for(const x of [-192,-111,111,192]) {
    const y=Math.abs(x)>170?33:57;
    for(const z of [34,-26])roundShoulder(g,m,17,10,8,[x,y,z],[0,0,1]);
  }
  for(const z of [-25,25])for(const x of [-125,125])
    beamBetween(g,m,[x*.85,63,z],[x,28,z],11,12);
  if(labels) {addLabel(g,'总宽 440 mm',[0,170,0],130);addLabel(g,'厚度方向约 130 mm',[0,25,135],150);}
}

function rectWithCircleHole(width, height, cx, cy, radius) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.closePath();
  s.holes.push(circlePath(cx, cy, radius));
  return s;
}

// G — 606 × 945 × 990 enclosure, Ø566 main access flange and three upper ports.
function buildG(g,m,explode,labels) {
  const L=945, cy=423, zf=L/2;
  // Cylindrical central chamber with open axial bore.
  annulus(g,m,282,242,L-65,[0,cy,0],[0,0,1]);
  for(const s of [-1,1])
    annulus(g,m,290,242,32,[0,cy,s*(zf-16)],[0,0,s],
      {radius:269,count:12,holeRadius:8,start:Math.PI/12});
  // Foundry shoulder contour on both ends; the chamber is not a square cage.
  for(const z of [-zf+30,zf-30]) {
    const outline=[[-300,75],[-300,625],[-268,730],[-230,850],[-210,960],
      [210,960],[230,850],[268,730],[300,625],[300,75],
      [245,50],[-245,50]];
    // The upper three front ports must be pierced through the enclosure
    // wall, not merely annular fittings attached onto a solid front panel.
    const faceHoles=[[0,cy,242]];
    if(z>0) for(const x of [-155,0,155])faceHoles.push([x,819,39.5]);
    polygonPlate(g,m,outline,22,[0,0,z],[0,0,1],faceHoles);
    // Lower foot bridges, with the main bore remaining open above them.
    box(g,m,[605,42,55],[0,34,z]);
  }
  // Two long flared lower support rails and tapered side webs.
  for(const x of [-260,260]) {
    box(g,m,[75,42,L],[x,22,0]);
    for(const z of [-330,330]) {
      beamBetween(g,m,[x,85,z],[x*.78,325,z*.65],28,34);
      beamBetween(g,m,[x*.84,625,z],[x*.67,850,z*.7],25,28);
    }
  }
  // Three upper front inspection ports, not three enormous holes in a flat wall.
  for(const x of [-155,0,155]) {
    annulus(g,m,63,39.5,60,[x,819,zf-18],[0,0,1]);
    annulus(g,m,72,39.5,16,[x,819,zf+10],[0,0,1],
      {radius:57,count:6,holeRadius:5,start:Math.PI/6});
  }
  // Auxiliary service opening and two smaller threaded seats on the opposite end.
  annulus(g,m,54,32,55,[0,140,-zf+20],[0,0,-1]);
  for(const x of [-110,110])
    annulus(g,m,35,19,30,[x,720,-zf+15],[0,0,-1]);
  // Long side-mounted support lugs at both flange ends.
  for(const x of [-282,282]) for(const z of [-370,370])
    annulus(g,m,20,9,18,[x,85,z],[0,1,0]);
  // Stiffeners on either side of the three-port deck, and split lower feet.
  for(const x of [-205,205])for(const z of [-370,370])
    beamBetween(g,m,[x,700,z*.85],[x*.80,910,z],27,21);
  for(const z of [-420,420]) for(const x of [-260,260])
    roundShoulder(g,m,27,11,14,[x,52,z],[0,1,0]);
  roundShoulder(g,m,46,23,20,[284,420,0],[1,0,0],6);
  if(labels) {addLabel(g,'主法兰 Ø580',[0,730,zf+80],155);addLabel(g,'上部 3 接口',[0,955,zf+60],130);}
}

// Hollow barrel with a radial access hole for the H top inspection neck.
// Unlike an opaque stacked cylinder, the top opening passes through BOTH
// outer and inner walls. Angular/axial tessellation gives an approximate
// circular edge; this is not a B-rep manufacturing operation.
function piercedBarrel(group, material, outer, inner, length, centerY, portRadius=34) {
  const nAngles=240, nZ=120;
  const isCut=(a,z,r)=>{
    const nearZero=Math.atan2(Math.sin(a),Math.cos(a));
    const along=nearZero*r;
    return along*along+z*z<portRadius*portRadius;
  };
  for(const [radius,reverse] of [[outer,false],[inner,true]]){
    const positions=[],indices=[];
    for(let i=0;i<=nAngles;i++){
      const a=i*TAU/nAngles;
      for(let j=0;j<=nZ;j++){
        const z=-length/2+length*j/nZ;
        positions.push(radius*Math.sin(a),centerY+radius*Math.cos(a),z);
      }
    }
    const stride=nZ+1;
    for(let i=0;i<nAngles;i++)for(let j=0;j<nZ;j++){
      const a=(i+.5)*TAU/nAngles;
      const z=-length/2+length*(j+.5)/nZ;
      if(isCut(a,z,radius))continue;
      const p=i*stride+j,q=p+stride;
      if(reverse)indices.push(p,p+1,q,q,p+1,q+1);
      else indices.push(p,q,p+1,q,q+1,p+1);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    addMesh(group,geometry,material);
  }
  // Close wall thickness at the two axial ends, away from the radial access.
  for(const z of [-length/2,length/2])annulus(group,material,outer,inner,12,[0,centerY,z],[0,0,1]);
}

// H — hollow cylindrical cast housing, orthographic envelope from the original
// front, longitudinal and B-B / G-G sections. Axis Z: 680 mm overall;
// principal end flange OD Ø540; vertical overall 890 mm.
// The local ribs / casting fillets are visibly reconstructed, not production CAD.
function buildH(g,m,explode,labels) {
  const L=680, half=340, cy=552, outer=265, inner=235;
  const details=[];
  // Stages are independent: an optional rib that cannot be triangulated should
  // not make the entire housing disappear. Central annular body is generated first.
  const stage=(name,action)=>{
    try { action();details.push({name,ok:true}); }
    catch(error){
      details.push({name,ok:false,error:String(error?.message||error)});
      console.warn(`[2027 H] ${name} detail omitted:`,error);
    }
  };

  // FRONT + REAR ENDS: machined bore remains physically open. 12 drilled holes
  // are cut through the extrusion, not drawn as opaque circular marks.
  piercedBarrel(g,m,outer,inner,L-46,cy,34);
  for(const sign of [-1,1]) {
    annulus(g,m,270,235,30,[0,cy,sign*325],[0,0,1],
      {radius:252,count:12,holeRadius:9,start:Math.PI/12});
    annulus(g,m,244,235,10,[0,cy,sign*306],[0,0,1]);
  }
  // The two narrow circular shoulders and side ribs are distinct from the
  // perimeter bolts (4-M16) shown in the front elevation.
  stage('环形加强带',()=>{
    for(const z of [-215,215]) annulus(g,m,269,263,12,[0,cy,z],[0,0,1]);
    for(const z of [-334,334]) {
      for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
        const x=263*Math.cos(a),y=cy+263*Math.sin(a);
        // Four broad tapped-location pads on a proper flange face.
        box(g,m,[38,32,14],[x,y,z],[0,0,0]);
      }
    }
  });

  // ROOF + BOTTOM: plates are drawn in the longitudinal view; the top Ø62
  // inspection passage is cut through its plate rather than covered by a box.
  stage('上下安装板和通孔',()=>{
    const roofHoles=[[0,0,31]];
    const footHoles=[[-271,-281,11],[271,-281,11],[-271,281,11],[271,281,11]];
    rectanglePlate(g,m,630,680,30,[0,875,0],[0,1,0],roofHoles,null,5);
    rectanglePlate(g,m,630,680,30,[0,15,0],[0,1,0],footHoles,null,5);
    // Four narrow base rails connect the foot plate to the side castings.
    for(const x of [-282,282])box(g,m,[39,51,575],[x,66,0]);
  });

  // FRONT BELOW THE BORE: the lower front elevation contains three Ø110 seats
  // with ~Ø71 centre passages. A three-hole faceplate is explicitly perforated
  // so the camera sees through each opening.
  stage('三孔下连接座',()=>{
    const faceZ=334;
    const faceHoles=[[-137,0,35.5],[0,0,35.5],[137,0,35.5]];
    rectanglePlate(g,m,455,156,26,[0,168,faceZ],[0,0,1],faceHoles,null,25);
    for(const x of [-137,0,137]){
      annulus(g,m,55,35.5,22,[x,168,faceZ+15],[0,0,1],
        {radius:46,count:4,holeRadius:4.5,start:Math.PI/4});
      // Short pierced passage behind front seat (not a fake solid cylinder).
      annulus(g,m,46,35.5,50,[x,168,faceZ-30],[0,0,1]);
    }
  });

  // Longitudinal elevation and G-G section: the supports are curved triangular
  // webs, open between the side frames. Avoid the false solid rectangular cage
  // that appeared in earlier screenshots.
  stage('下部开口支承和加强筋',()=>{
    for(const z of [-276,276]) {
      for(const sign of [-1,1]){
        const profile=[
          [sign*290,57],[sign*239,58],[sign*175,256],
          [sign*204,319],[sign*264,292]
        ];
        polygonPlate(g,m,profile,24,[0,0,z],[0,0,1]);
        // Inside the radial web, a triangular opening follows the orthographic
        // visible void underneath the cylindrical housing.
        polygonPlate(g,m,[[sign*279,70],[sign*258,150],[sign*230,260],
          [sign*211,272],[sign*241,80]],14,[0,0,z-17],[0,0,1]);
      }
    }
    for(const x of [-262,262]) {
      box(g,m,[26,225,26],[x,170,-277]);
      box(g,m,[26,225,26],[x,170,277]);
    }
    // The two end views show a narrow central dividing rib.
    for(const z of [-293,293])box(g,m,[18,95,24],[0,75,z]);
  });

  // The side view has four diagonal cast webs from the roof toward the barrel
  // and the base, not vertical wall panels. Profiles are extruded along X.
  stage('纵向斜腹板',()=>{
    for(const x of [-225,225]) {
      for(const sign of [-1,1]) {
        const z0=sign*276,z1=sign*45;
        beamBetween(g,m,[x,846,z0],[x*.83,690,z1],24,28);
        beamBetween(g,m,[x*.9,320,z0],[x*.68,440,z1],20,24);
      }
    }
    for(const z of [-278,278])for(const sign of [-1,1]){
      beamBetween(g,m,[sign*282,70,z],[sign*190,295,z],20,27);
    }
  });

  // Inspection neck through top plate (Ø120 collar, Ø62 open core), both
  // faces remain hollow. The side Ø96 boss is approximately located.
  stage('顶部与侧向服务接口',()=>{
    annulus(g,m,60,31,72,[0,835,0],[0,1,0]);
    annulus(g,m,73,31,13,[0,891,0],[0,1,0],
      {radius:62,count:6,holeRadius:5,start:Math.PI/6});
    annulus(g,m,48,28,55,[280,201,14],[1,0,0]);
    annulus(g,m,62,28,15,[309,201,14],[1,0,0],
      {radius:49,count:6,holeRadius:5});
    annulus(g,m,71,42.5,41,[-182,156,-308],[0,0,-1]);
    annulus(g,m,82,42.5,15,[-182,156,-338],[0,0,-1],
      {radius:68,count:6,holeRadius:6});
  });

  stage('附加小连接耳座',()=>{
    for(const z of [-310,310])for(const sign of [-1,1]){
      annulus(g,m,20,9,10,[sign*287,420,z],[1,0,0]);
      annulus(g,m,23,10,10,[sign*282,177,z],[0,1,0]);
    }
  });
  g.userData.detailStages=details;
  g.userData.drawingAxes='Z: 680 mm axial; Y: 890 mm height; X: section width';
  g.userData.schematicElements=['Ø540 end flanges / 12-Ø18 holes','3×Ø71 lower ports','Ø120 roof neck / Ø62 passage','front and longitudinal webs','base / roof plates'];
  if(labels){
    addLabel(g,'H 件: 轴向 680 mm',[0,940,0],185);
    addLabel(g,'Ø540 两端法兰 / 12×Ø18',[0,570,430],155);
    addLabel(g,'三孔连接座',[0,110,430],140);
  }
}

const builders = { A: buildA, B: buildB, C: buildC, D: buildD, E: buildE, F: buildF, G: buildG, H: buildH };

export function buildPart(id, material, explode = 0, labels = false) {
  const root = new THREE.Group();
  root.name = `Part-${id}-millimetres`;
  (builders[id] || buildB)(root, material, explode, labels);
  root.userData.units = 'mm';
  root.userData.modelStatus = 'drawing-based preview, incomplete dimensions inferred';
  root.userData.revision = '1.6';
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
