import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html, RoundedBox } from '@react-three/drei';

function ringGeometry(outer, inner, depth) {
  const s = new THREE.Shape();
  s.absarc(0, 0, outer, 0, 2 * Math.PI, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, 2 * Math.PI, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, curveSegments: 96, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.025, bevelThickness: 0.025 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function Ring({ outer=1, inner=.7, depth=.3, position=[0,0,0], rotation=[0,0,0], material }) {
  const geometry = useMemo(() => ringGeometry(outer, inner, depth), [outer, inner, depth]);
  return <mesh castShadow receiveShadow material={material} geometry={geometry} position={position} rotation={rotation} />;
}
function Box({size=[1,1,1], position=[0,0,0], rotation=[0,0,0], material, radius=.045}) {
  return <RoundedBox args={size} radius={Math.min(radius, ...size.map(v => v/5))} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow material={material} />;
}
function Cyl({radius=.5, length=.4, position=[0,0,0], rotation=[Math.PI/2,0,0], material, segments=56}) {
  return <mesh material={material} position={position} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[radius,radius,length,segments]} /></mesh>;
}
function Beam({from, to, width=.17, depth=.25, material}) {
  const dx=to[0]-from[0], dy=to[1]-from[1];
  return <Box size={[Math.hypot(dx,dy),width,depth]} position={[(from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2]} rotation={[0,0,Math.atan2(dy,dx)]} material={material} radius={.028} />;
}
function Bolt({position=[0,0,0], material, radius=.065}) {
  return <group position={position}>
    <Cyl radius={radius*1.48} length={.035} material={material} position={[0,0,0]} />
    <mesh position={[0,0,.025]}><circleGeometry args={[radius*.75,6]}/><meshStandardMaterial color="#17212b" roughness={.72}/></mesh>
  </group>;
}
function BoltCircle({radius,count=12,z=.3,material,boltSize=.045,center=[0,0],start=0}) {
  return <group>{Array.from({length:count},(_,i)=>{
    const a=i*Math.PI*2/count+start;
    return <Bolt key={i} position={[center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a),z]} radius={boltSize} material={material} />;
  })}</group>;
}
function Wedge({points, holes=[], depth=.3, position=[0,0,0], material}) {
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();
    holes.forEach(([x,y,r])=>{ const h=new THREE.Path(); h.absarc(x,y,r,0,Math.PI*2,true);shape.holes.push(h); });
    const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2});g.translate(0,0,-depth/2);g.computeVertexNormals();return g;
  },[points,holes,depth]);
  return <mesh material={material} geometry={geometry} position={position} castShadow receiveShadow />;
}
function ArcBar({radius=2, tube=.13, start=0, end=Math.PI, z=0, material, center=[0,0]}) {
  const geometry=useMemo(()=>new THREE.TorusGeometry(radius,tube,10,80,end-start),[radius,tube,start,end]);
  return <mesh geometry={geometry} material={material} position={[center[0],center[1],z]} rotation={[0,0,start]} castShadow receiveShadow />;
}
function Label({position,children}) {
  return <Html position={position} center distanceFactor={10} zIndexRange={[1,0]}><span className="mesh-label">{children}</span></Html>;
}

function ModelA({m,explode,labels}) {
  const e=explode*.7;
  return <group rotation={[-.12,0,0]}>
    <Ring outer={2.72} inner={1.05} depth={.4} position={[0,0,-.45-e*.35]} material={m}/>
    <Ring outer={2.38} inner={1.05} depth={.25} position={[0,0,.35+e*.5]} material={m}/>
    <Ring outer={1.22} inner={.94} depth={1.35} position={[0,0,0]} material={m}/>
    <Ring outer={2.7} inner={2.40} depth={.36} position={[0,0,-.05]} material={m}/>
    {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <group key={i} rotation={[0,0,a]}>
      <Box size={[1.26,.17,.55]} position={[1.83,0,-.04]} material={m}/>
      <Box size={[.67,.23,.29]} position={[2.24,0,.25]} material={m}/>
    </group>})}
    <BoltCircle radius={2.57} count={24} z={.18} material={m} boltSize={.039}/>
    <BoltCircle radius={1.23} count={12} z={.8} material={m} boltSize={.034}/>
    {labels&&<><Label position={[0,0,1.05]}>中央通孔 · 示意</Label><Label position={[2.25,1.2,.6]}>环形筋板</Label></>}
  </group>
}
function ModelB({m,explode,labels}) {
  const e=explode*.7;
  return <group>
    <Box size={[5.4,.32,2.3]} position={[0,-2.05,0]} material={m}/>
    <Wedge points={[[-2.3,-1.85],[-2.3,-.65],[-1.15,.42],[.55,2.05],[1.65,2.07],[2.35,.75],[2.15,-1.85]]} holes={[[.83,.9,.72]]} depth={.33} position={[0,0,-.87]} material={m}/>
    <Wedge points={[[-2.3,-1.85],[-2.3,-.7],[-1.25,.45],[.55,2.04],[1.8,1.94],[2.35,.5],[2.25,-1.85]]} holes={[[.83,.9,.72]]} depth={.3} position={[0,0,.87]} material={m}/>
    <Ring outer={1.03} inner={.66} depth={1.95} position={[.83,.9,0]} material={m}/>
    <Ring outer={1.2} inner={.66} depth={.28} position={[.83,.9,1.1+e]} material={m}/>
    <BoltCircle center={[.83,.9]} radius={.96} count={10} z={1.27+e} material={m} boltSize={.048}/>
    <Beam from={[-1.8,-1.75,.94]} to={[.04,.53,.94]} width={.19} depth={.14} material={m}/>
    <Beam from={[-1.9,-1.75,-.94]} to={[.04,.53,-.94]} width={.18} depth={.14} material={m}/>
    <Box size={[2.3,1.4,.12]} position={[-.85,-1.1,.99]} material={m}/>
    {[-2.3,-1.35,1.32,2.32].map((x,i)=><Bolt key={i} position={[x,-1.88,1.03]} material={m} radius={.073}/>)}
    {labels&&<><Label position={[.83,.9,1.6+e]}>主轴孔</Label><Label position={[-1.6,-1.2,1.1]}>斜支撑壁</Label></>}
  </group>
}
function ModelC({m,explode,labels}) {
  const curve = useMemo(()=>new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.45,-1.75,0),new THREE.Vector3(-1.45,-.65,0),new THREE.Vector3(-1.15,.15,0),new THREE.Vector3(-.45,.95,0),new THREE.Vector3(.6,1.15,0),new THREE.Vector3(1.35,1.3,0)
  ],false,'centripetal'),[]);
  const tube = useMemo(()=>new THREE.TubeGeometry(curve,96,.6,32,false),[curve]);
  return <group>
    <mesh geometry={tube} material={m} castShadow receiveShadow/>
    <Ring outer={.86} inner={.49} depth={.22} position={[-1.45,-1.75-explode*.45,0]} rotation={[Math.PI/2,0,0]} material={m}/>
    <Ring outer={.86} inner={.49} depth={.22} position={[1.35+explode*.45,1.3,0]} rotation={[0,Math.PI/2,0]} material={m}/>
    <Cyl radius={.48} length={.004} position={[-1.45,-1.89-explode*.45,0]} rotation={[0,0,0]} material={new THREE.MeshStandardMaterial({color:'#162736',roughness:.8})}/>
    <Cyl radius={.48} length={.004} position={[1.49+explode*.45,1.3,0]} rotation={[0,0,Math.PI/2]} material={new THREE.MeshStandardMaterial({color:'#162736',roughness:.8})}/>
    {[-1,1].map((sgn,i)=><Box key={i} size={[.20,.9,.15]} position={[.35*sgn,.85,.5]} rotation={[0,0,sgn*.5]} material={m}/>)}
    {labels&&<><Label position={[.25,1.75,.4]}>弯管过渡</Label><Label position={[-1.5,-2.32,.1]}>连接法兰</Label></>}
  </group>
}
function ModelD({m,explode,labels}) {
  return <group>
    <Wedge points={[[-2.9,1.9],[-1.0,.45],[.3,.9],[2.85,1.95],[2.35,.85],[1.95,-1.5],[-.5,-1.8],[-2,-.5]]} holes={[[ -.65,-.35,.7],[1.38,-1.13,.39]]} depth={.34} position={[0,0,-.7]} material={m}/>
    <Wedge points={[[-2.9,1.9],[-1.0,.42],[.3,.8],[2.85,1.95],[2.30,.78],[1.98,-1.5],[-.55,-1.84],[-2,-.46]]} holes={[[ -.65,-.35,.7],[1.38,-1.13,.39]]} depth={.34} position={[0,0,.7]} material={m}/>
    <Ring outer={1.13} inner={.67} depth={1.72} position={[-.65,-.35,0]} material={m}/>
    <Ring outer={.69} inner={.37} depth={1.45} position={[1.38,-1.13,0]} material={m}/>
    <Ring outer={1.19} inner={.67} depth={.17} position={[-.65,-.35,1.02+explode*.6]} material={m}/>
    <Beam from={[-2.65,1.78,.35]} to={[-1.45,.8,.35]} width={.24} depth={.2} material={m}/>
    <Beam from={[.55,.91,.36]} to={[2.75,1.82,.36]} width={.22} depth={.2} material={m}/>
    <Beam from={[1.98,-1.45,.55]} to={[2.5,.8,.55]} width={.22} depth={.2} material={m}/>
    {labels&&<><Label position={[-.65,-.35,1.5]}>主支承孔</Label><Label position={[1.4,-1.1,1.3]}>辅助孔</Label></>}
  </group>
}
function ModelE({m,labels}) {
  const geo=useMemo(()=>{
    const s=new THREE.Shape();
    s.moveTo(-2.8,-.85); s.lineTo(-2.8,-.35);
    s.absarc(0,-.35,2.8,Math.PI,0,true);s.lineTo(2.8,-.85);s.lineTo(1.95,-.85);s.lineTo(1.95,-.32);
    s.absarc(0,-.32,1.95,0,Math.PI,false);s.lineTo(-1.95,-.85);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:1.06,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:72});g.translate(0,0,-.53);return g;
  },[]);
  return <group>
    <mesh geometry={geo} material={m} castShadow receiveShadow/>
    <Box size={[6,.24,1.45]} position={[0,-.9,0]} material={m}/>
    <ArcBar radius={2.45} tube={.10} start={0} end={Math.PI} z={.63} material={m} center={[0,-.35]}/>
    <ArcBar radius={2.67} tube={.09} start={0} end={Math.PI} z={-.6} material={m} center={[0,-.35]}/>
    {Array.from({length:9},(_,i)=>{const a=i*Math.PI/8; return <Bolt key={i} position={[2.51*Math.cos(a),-.35+2.51*Math.sin(a),.64]} material={m} radius={.055}/>})}
    {[-2.54,-1.7,1.7,2.54].map((x,i)=><Bolt key={i} position={[x,-.92,.77]} material={m} radius={.065}/>)}
    {labels&&<><Label position={[0,2.55,.9]}>轴承罩壳</Label><Label position={[2,-1.15,.9]}>安装底面</Label></>}
  </group>
}
function ModelF({m,labels}) {
  return <group>
    <ArcBar radius={2.12} tube={.32} start={0} end={Math.PI} z={-.4} material={m} center={[0,-1.05]}/>
    <ArcBar radius={2.12} tube={.32} start={0} end={Math.PI} z={.42} material={m} center={[0,-1.05]}/>
    {Array.from({length:7},(_,i)=>{const a=(i+1)*Math.PI/8;return <Beam key={i} from={[(2.12)*Math.cos(a),-1.05+(2.12)*Math.sin(a),-.35]} to={[(2.12)*Math.cos(a),-1.05+(2.12)*Math.sin(a),.4]} width={.14} depth={.9} material={m}/>})}
    <Box size={[1.35,.48,1.55]} position={[-2.26,-1.04,0]} material={m}/>
    <Box size={[1.35,.48,1.55]} position={[2.26,-1.04,0]} material={m}/>
    <Box size={[1.65,.36,1.32]} position={[0,1.22,0]} material={m}/>
    <Ring outer={.36} inner={.17} depth={1.4} position={[0,1.3,0]} material={m}/>
    {[-2.42,-1.98,1.98,2.42].map((x,i)=><Bolt key={i} position={[x,-.8,.85]} material={m} radius={.058}/>)}
    {labels&&<><Label position={[0,1.88,.8]}>中央定位座</Label><Label position={[2.25,-1.2,1.0]}>支撑脚</Label></>}
  </group>
}
function ModelG({m,labels}) {
  return <group>
    <Box size={[4.65,4.7,.37]} position={[0,0,-.93]} material={m}/>
    <Ring outer={1.76} inner={1.37} depth={1.6} material={m} position={[0,.05,.12]}/>
    <Ring outer={1.92} inner={1.37} depth={.22} material={m} position={[0,.05,1.02]}/>
    {[-1,1].flatMap(x=>[-1,1].map(y=><Box key={`${x}-${y}`} size={[.41,4.5,1.6]} position={[x*2.15,0,0]} material={m}/>))}
    <Box size={[4.6,.43,1.6]} position={[0,2.14,0]} material={m}/>
    <Box size={[4.6,.43,1.6]} position={[0,-2.14,0]} material={m}/>
    {[-1,1].map(s=><React.Fragment key={s}><Beam from={[s*2.1,1.9,1.05]} to={[s*1.3,1.28,1.05]} width={.17} depth={.18} material={m}/><Beam from={[s*2.1,-1.9,1.05]} to={[s*1.3,-1.25,1.05]} width={.17} depth={.18} material={m}/></React.Fragment>)}
    {[-1,1].flatMap(x=>[-1,1].map(y=><Bolt key={`${x}-${y}`} position={[x*1.98,y*1.98,1.02]} material={m} radius={.07}/>))}
    <BoltCircle radius={1.69} count={12} z={1.19} material={m} boltSize={.045} />
    {labels&&<><Label position={[0,.15,1.7]}>舱体圆口</Label><Label position={[2.1,2.1,1.7]}>箱体框架</Label></>}
  </group>
}
function ModelH({m,labels}) {
  return <group>
    <Box size={[4.9,4.9,.3]} position={[0,0,-1.0]} material={m}/>
    <Ring outer={2.06} inner={1.55} depth={1.7} position={[0,0,0]} material={m}/>
    <Ring outer={2.25} inner={1.55} depth={.23} position={[0,0,1.05]} material={m}/>
    {[-1,1].map(x=><Box key={`lr${x}`} size={[.38,4.74,1.6]} position={[x*2.31,0,0]} material={m}/>)}
    {[-1,1].map(y=><Box key={`tb${y}`} size={[4.74,.38,1.6]} position={[0,y*2.31,0]} material={m}/>)}
    {Array.from({length:8},(_,i)=>{const a=(i+.5)*Math.PI/4;return <Beam key={i} from={[1.9*Math.cos(a),1.9*Math.sin(a),.86]} to={[2.42*Math.sign(Math.cos(a)),2.42*Math.sign(Math.sin(a)),.86]} width={.16} depth={.19} material={m}/>})}
    <BoltCircle radius={1.96} count={16} z={1.22} material={m} boltSize={.045}/>
    {[-1,1].flatMap(x=>[-1,1].map(y=><Bolt key={`${x}-${y}`} position={[x*2.3,y*2.3,1.02]} material={m} radius={.066}/>))}
    {labels&&<><Label position={[0,0,1.75]}>中心筒体</Label><Label position={[2.35,2.35,1.6]}>方形法兰</Label></>}
  </group>
}
export function ProceduralPart({id,material,explode=0,labels=false}) {
  const props={m:material,explode,labels};
  switch(id){
    case 'A':return <ModelA {...props}/>;
    case 'B':return <ModelB {...props}/>;
    case 'C':return <ModelC {...props}/>;
    case 'D':return <ModelD {...props}/>;
    case 'E':return <ModelE {...props}/>;
    case 'F':return <ModelF {...props}/>;
    case 'G':return <ModelG {...props}/>;
    case 'H':return <ModelH {...props}/>;
    default:return null;
  }
}
