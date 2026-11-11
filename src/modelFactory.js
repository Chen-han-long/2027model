// 2027 engineering drawings: conceptual display geometry, not manufacturing CAD.
// Pure Three.js geometry avoids renderer reconciliation errors and allows deterministic export.
import * as THREE from 'three';

const V = (p) => new THREE.Vector3(...p);
function mesh(group, geometry, material, pos=[0,0,0], rot=[0,0,0]) {
  const o=new THREE.Mesh(geometry, material);
  o.position.fromArray(pos); o.rotation.set(...rot);
  o.castShadow=true; o.receiveShadow=true; group.add(o); return o;
}
function box(g,mat,size=[1,1,1],pos=[0,0,0],rot=[0,0,0]) {
  return mesh(g,new THREE.BoxGeometry(...size),mat,pos,rot);
}
function cyl(g,mat,r=.5,len=.4,pos=[0,0,0],rot=[Math.PI/2,0,0],segments=64) {
  return mesh(g,new THREE.CylinderGeometry(r,r,len,segments),mat,pos,rot);
}
function ring(g,mat,outer=1,inner=.7,depth=.3,pos=[0,0,0],rot=[0,0,0]) {
  const s=new THREE.Shape(); s.absarc(0,0,outer,0,Math.PI*2,false);
  const hole=new THREE.Path(); hole.absarc(0,0,inner,0,Math.PI*2,true);s.holes.push(hole);
  const geo=new THREE.ExtrudeGeometry(s,{depth,curveSegments:64,bevelEnabled:true,bevelSegments:2,bevelThickness:.02,bevelSize:.02});
  geo.translate(0,0,-depth/2);
  return mesh(g,geo,mat,pos,rot);
}
function wedge(g,mat,pts,holes=[],depth=.3,pos=[0,0,0]){
  const s=new THREE.Shape();pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
  for(const [x,y,r] of holes){const h=new THREE.Path();h.absarc(x,y,r,0,Math.PI*2,true);s.holes.push(h);}
  const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.022,bevelThickness:.022,bevelSegments:2,curveSegments:48});geo.translate(0,0,-depth/2);
  return mesh(g,geo,mat,pos);
}
function beam(g,mat,from,to,width=.18,depth=.23){
  const d=V(to).sub(V(from));const mid=V(to).add(V(from)).multiplyScalar(.5);
  return box(g,mat,[Math.hypot(d.x,d.y),width,depth],mid.toArray(),[0,0,Math.atan2(d.y,d.x)]);
}
function bolt(g,mat,pos,r=.065){
  // The head is oriented along the local Z axis, with the face toward the viewer.
  cyl(g,mat,r*1.47,.055,pos,[Math.PI/2,0,0],12);
  const recess=new THREE.MeshBasicMaterial({color:'#22313c',side:THREE.DoubleSide});
  mesh(g,new THREE.CircleGeometry(r*.72,6),recess,[pos[0],pos[1],pos[2]+.035]);
}
function boltCircle(g,mat,r,count,z,center=[0,0],size=.045,start=0){
  for(let i=0;i<count;i++){const a=start+i*Math.PI*2/count;bolt(g,mat,[center[0]+r*Math.cos(a),center[1]+r*Math.sin(a),z],size);}
}
function arcBar(g,mat,r,tube,start,end,z=0,center=[0,0]){
  return mesh(g,new THREE.TorusGeometry(r,tube,12,90,end-start),mat,[center[0],center[1],z],[0,0,start]);
}
function label(g,text,pos){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='rgba(11,30,43,.86)';ctx.beginPath();ctx.roundRect(1,2,510,92,16);ctx.fill();
  ctx.strokeStyle='#6dced6';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#e2f8f8';ctx.font='600 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,48);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true});
  const sprite=new THREE.Sprite(m);sprite.position.fromArray(pos);sprite.scale.set(1.95,.366,1);g.add(sprite);
}
function a(g,m,e,l){
  const outer=new THREE.Group();outer.rotation.x=-.12;g.add(outer);
  ring(outer,m,2.72,1.05,.4,[0,0,-.45-e*.25]);
  ring(outer,m,2.38,1.05,.25,[0,0,.35+e*.35]);
  ring(outer,m,1.22,.94,1.35);
  ring(outer,m,2.7,2.4,.36,[0,0,-.05]);
  for(let i=0;i<12;i++){const ang=i*Math.PI/6;const segment=new THREE.Group();segment.rotation.z=ang;outer.add(segment);box(segment,m,[1.26,.17,.55],[1.83,0,-.04]);box(segment,m,[.67,.23,.29],[2.24,0,.25]);}
  boltCircle(outer,m,2.57,24,.18,[0,0],.039);boltCircle(outer,m,1.23,12,.8,[0,0],.034);
  if(l){label(outer,'中央通孔 · 示意',[0,0,1.25]);label(outer,'环形筋板',[2.25,1.2,.8]);}
}
function b(g,m,e,l){
  box(g,m,[5.4,.32,2.3],[0,-2.05,0]);
  wedge(g,m,[[-2.3,-1.85],[-2.3,-.65],[-1.15,.42],[.55,2.05],[1.65,2.07],[2.35,.75],[2.15,-1.85]],[[.83,.9,.72]],.33,[0,0,-.87]);
  wedge(g,m,[[-2.3,-1.85],[-2.3,-.7],[-1.25,.45],[.55,2.04],[1.8,1.94],[2.35,.5],[2.25,-1.85]],[[.83,.9,.72]],.3,[0,0,.87]);
  ring(g,m,1.03,.66,1.95,[.83,.9,0]);ring(g,m,1.2,.66,.28,[.83,.9,1.1+e*.7]);
  boltCircle(g,m,.96,10,1.27+e*.7,[.83,.9],.048);
  beam(g,m,[-1.8,-1.75,.94],[.04,.53,.94],.19,.14);
  beam(g,m,[-1.9,-1.75,-.94],[.04,.53,-.94],.18,.14);
  box(g,m,[2.3,1.4,.12],[-.85,-1.1,.99]);
  [-2.3,-1.35,1.32,2.32].forEach(x=>bolt(g,m,[x,-1.88,1.03],.073));
  if(l){label(g,'主轴孔',[.83,.9,1.7+e*.7]);label(g,'斜支撑壁',[-1.6,-1.2,1.35]);}
}
function c(g,m,e,l){
  const curve=new THREE.CatmullRomCurve3([[-1.45,-1.75,0],[-1.45,-.65,0],[-1.15,.15,0],[-.45,.95,0],[.6,1.15,0],[1.35,1.3,0]].map(V),false,'centripetal');
  mesh(g,new THREE.TubeGeometry(curve,100,.6,28,false),m);
  ring(g,m,.86,.49,.22,[-1.45,-1.75-e*.45,0],[Math.PI/2,0,0]);
  ring(g,m,.86,.49,.22,[1.35+e*.45,1.3,0],[0,Math.PI/2,0]);
  cyl(g,m,.48,.1,[-1.45,-1.89-e*.45,0],[0,0,0]);
  cyl(g,m,.48,.1,[1.49+e*.45,1.3,0],[0,0,Math.PI/2]);
  for(const s of [-1,1])box(g,m,[.2,.9,.15],[.35*s,.85,.5],[0,0,s*.5]);
  if(l){label(g,'弯管过渡',[.25,1.75,.5]);label(g,'连接法兰',[-1.5,-2.35,.2]);}
}
function d(g,m,e,l){
  wedge(g,m,[[-2.9,1.9],[-1,.45],[.3,.9],[2.85,1.95],[2.35,.85],[1.95,-1.5],[-.5,-1.8],[-2,-.5]],[[-.65,-.35,.7],[1.38,-1.13,.39]],.34,[0,0,-.7]);
  wedge(g,m,[[-2.9,1.9],[-1,.42],[.3,.8],[2.85,1.95],[2.3,.78],[1.98,-1.5],[-.55,-1.84],[-2,-.46]],[[-.65,-.35,.7],[1.38,-1.13,.39]],.34,[0,0,.7]);
  ring(g,m,1.13,.67,1.72,[-.65,-.35,0]);ring(g,m,.69,.37,1.45,[1.38,-1.13,0]);
  ring(g,m,1.19,.67,.17,[-.65,-.35,1.02+e*.6]);
  beam(g,m,[-2.65,1.78,.35],[-1.45,.8,.35],.24,.2);
  beam(g,m,[.55,.91,.36],[2.75,1.82,.36],.22,.2);
  beam(g,m,[1.98,-1.45,.55],[2.5,.8,.55],.22,.2);
  if(l){label(g,'主支承孔',[-.65,-.35,1.5]);label(g,'辅助孔',[1.4,-1.1,1.3]);}
}
function ePart(g,m,e,l){
  const s=new THREE.Shape();
  s.moveTo(-2.8,-.35);s.absarc(0,-.35,2.8,Math.PI,0,true);
  s.lineTo(1.95,-.35);s.absarc(0,-.35,1.95,0,Math.PI,false);s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:1.06,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:80});geo.translate(0,0,-.53);
  mesh(g,geo,m);
  box(g,m,[6,.24,1.45],[0,-.9,0]);
  arcBar(g,m,2.45,.1,0,Math.PI,.63,[0,-.35]);arcBar(g,m,2.67,.09,0,Math.PI,-.6,[0,-.35]);
  for(let i=0;i<9;i++){const ang=i*Math.PI/8;bolt(g,m,[2.51*Math.cos(ang),-.35+2.51*Math.sin(ang),.64],.055);}
  [-2.54,-1.7,1.7,2.54].forEach(x=>bolt(g,m,[x,-.92,.77],.065));
  if(l){label(g,'轴承罩壳',[0,2.75,.9]);label(g,'安装底面',[2,-1.15,.9]);}
}
function f(g,m,e,l){
  arcBar(g,m,2.12,.32,0,Math.PI,-.4,[0,-1.05]);arcBar(g,m,2.12,.32,0,Math.PI,.42,[0,-1.05]);
  for(let i=1;i<=7;i++){const ang=i*Math.PI/8;const x=2.12*Math.cos(ang);const y=-1.05+2.12*Math.sin(ang);box(g,m,[.14,.14,.95],[x,y,0]);}
  box(g,m,[1.35,.48,1.55],[-2.26,-1.04,0]);box(g,m,[1.35,.48,1.55],[2.26,-1.04,0]);
  box(g,m,[1.65,.36,1.32],[0,1.22,0]);ring(g,m,.36,.17,1.4,[0,1.3,0]);
  [-2.42,-1.98,1.98,2.42].forEach(x=>bolt(g,m,[x,-.8,.85],.058));
  if(l){label(g,'中央定位座',[0,1.88,.9]);label(g,'支撑脚',[2.25,-1.2,1]);}
}
function gPart(g,m,e,l){
  box(g,m,[4.65,4.7,.37],[0,0,-.93]);ring(g,m,1.76,1.37,1.6,[0,.05,.12]);ring(g,m,1.92,1.37,.22,[0,.05,1.02]);
  for(const x of [-1,1])for(const y of [-1,1])box(g,m,[.41,4.5,1.6],[x*2.15,0,0]);
  box(g,m,[4.6,.43,1.6],[0,2.14,0]);box(g,m,[4.6,.43,1.6],[0,-2.14,0]);
  for(const s of [-1,1]){beam(g,m,[s*2.1,1.9,1.05],[s*1.3,1.28,1.05],.17,.18);beam(g,m,[s*2.1,-1.9,1.05],[s*1.3,-1.25,1.05],.17,.18);}
  for(const x of [-1,1])for(const y of [-1,1])bolt(g,m,[x*1.98,y*1.98,1.02],.07);
  boltCircle(g,m,1.69,12,1.19,[0,0],.045);
  if(l){label(g,'舱体圆口',[0,.15,1.7]);label(g,'箱体框架',[2.1,2.1,1.7]);}
}
function h(g,m,e,l){
  box(g,m,[4.9,4.9,.3],[0,0,-1]);ring(g,m,2.06,1.55,1.7);ring(g,m,2.25,1.55,.23,[0,0,1.05]);
  for(const x of [-1,1])box(g,m,[.38,4.74,1.6],[x*2.31,0,0]);
  for(const y of [-1,1])box(g,m,[4.74,.38,1.6],[0,y*2.31,0]);
  for(let i=0;i<8;i++){const ang=(i+.5)*Math.PI/4;beam(g,m,[1.9*Math.cos(ang),1.9*Math.sin(ang),.86],[2.42*Math.sign(Math.cos(ang)),2.42*Math.sign(Math.sin(ang)),.86],.16,.19);}
  boltCircle(g,m,1.96,16,1.22,[0,0],.045);
  for(const x of [-1,1])for(const y of [-1,1])bolt(g,m,[x*2.3,y*2.3,1.02],.066);
  if(l){label(g,'中心筒体',[0,0,1.75]);label(g,'方形法兰',[2.35,2.35,1.6]);}
}

const builders={A:a,B:b,C:c,D:d,E:ePart,F:f,G:gPart,H:h};
export function buildPart(id,material,explode=0,labels=false){
  const root=new THREE.Group();
  const fn=builders[id]||builders.B; fn(root,material,explode,labels);
  return root;
}
export function disposePart(root,preservedMaterial){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m!==preservedMaterial){materials.add(m);if(m.map)textures.add(m.map);}
    }}
  });
  for(const g of geometries)g.dispose();
  for(const t of textures)t.dispose();
  for(const m of materials)m.dispose();
}
