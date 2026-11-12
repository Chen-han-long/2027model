import React, {forwardRef,useRef,useEffect,useImperativeHandle,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {STLExporter} from 'three/examples/jsm/exporters/STLExporter.js';

const VIEW_DIRECTIONS={iso:[1,.73,1],front:[0,0,1],back:[0,0,-1],right:[1,0,0],left:[-1,0,0],top:[0,1,.0001],bottom:[0,-1,.0001]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vector=a=>new THREE.Vector3(...a);

function disposeTree(root,material){
  if(!root)return;
  const geometries=new Set(),materials=new Set();
  root.traverse(x=>{if(x.geometry)geometries.add(x.geometry);
    if(x.material)for(const m of Array.isArray(x.material)?x.material:[x.material])if(m!==material)materials.add(m);
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function orientationGizmo(canvas,camera){
  const ctx=canvas?.getContext('2d');if(!ctx)return;
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const inv=camera.quaternion.clone().invert(),base=[
    ['X','#fc8580',new THREE.Vector3(1,0,0)],['Y','#7cdaa3',new THREE.Vector3(0,1,0)],['Z','#89b8ff',new THREE.Vector3(0,0,1)]
  ];
  const axes=base.map(([label,color,d])=>({label,color,v:d.applyQuaternion(inv)})).sort((a,b)=>a.v.z-b.v.z);
  for(const a of axes){const x=w/2+a.v.x*w*.26,y=h/2-a.v.y*h*.26;
    ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(x,y);ctx.lineWidth=4;ctx.strokeStyle=a.color;ctx.lineCap='round';ctx.stroke();
    ctx.font='bold 20px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=a.color;
    ctx.fillText(a.label,w/2+a.v.x*w*.37,h/2-a.v.y*h*.37);
  }
  ctx.beginPath();ctx.arc(w/2,h/2,4,0,Math.PI*2);ctx.fillStyle='#d9edf6';ctx.fill();
}
// Recover older GLB files that were exported without the glTF NORMAL attribute.
// Physically based materials require surface normals for proper illumination.
// A flat-normal fallback is safer for CAD faces than inventing a single constant normal.
function ensureSurfaceNormals(scene, partId='导入模型') {
  let repaired=0;
  scene.traverse(object=>{
    if(!object.isMesh || !object.geometry)return;
    const geometry=object.geometry;
    const positions=geometry.getAttribute('position');
    if(!positions || !positions.count)return;
    const normal=geometry.getAttribute('normal');
    let missing=!normal || normal.count!==positions.count;
    if(!missing) {
      const samples=[0,Math.floor(normal.count/2),normal.count-1];
      missing=samples.some(i=>{
        const x=normal.getX(i),y=normal.getY(i),z=normal.getZ(i);
        const magnitude=x*x+y*y+z*z;
        return !Number.isFinite(magnitude)||magnitude<0.001;
      });
    }
    if(missing) {
      const fallback=geometry.index?geometry.toNonIndexed():geometry.clone();
      fallback.computeVertexNormals();
      object.geometry=fallback;
      // Disposing here would break other meshes if they share the same geometry.
      // Dispose the original geometries only when the loaded scene is discarded.
      repaired++;
    }
  });
  if(repaired)console.warn(`[FORGE] ${partId}: repaired missing GLB normals on ${repaired} mesh(es).`);
  return repaired;
}

function isUsable(root){
  if(!root)throw Error('模型为空');
  let vertices=0,meshes=0;
  root.traverse(o=>{if(!o.isMesh)return;meshes++;
    const pos=o.geometry?.getAttribute('position');
    if(!pos||!pos.count)throw Error('模型包含空网格');
    vertices+=pos.count;
  });
  const bounds=new THREE.Box3().setFromObject(root);
  const size=bounds.getSize(new THREE.Vector3());
  if(!meshes||vertices<3||bounds.isEmpty()||![size.x,size.y,size.z].every(x=>x>0&&x<100000&&Number.isFinite(x)))
    throw Error('模型尺寸或几何数据异常');
  return {bounds,vertices,meshes};
}
// Model and camera orientation are independent of DOM resize.
function fitModel(state,direction=new THREE.Vector3(1,.73,1)){
  if(!state?.model)return;
  const {bounds}=isUsable(state.model),center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3()),r=bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const aspect=Math.max(.3,state.el.clientWidth/Math.max(state.el.clientHeight,1));
  const dir=direction.clone().normalize();
  const up=Math.abs(dir.y)>.98?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,dir).normalize();
  const actualUp=new THREE.Vector3().crossVectors(dir,right).normalize();
  const tanV=Math.tan(THREE.MathUtils.degToRad(state.perspective.fov)/2);
  const tanH=tanV*aspect;
  let distance=r*1.2,halfHeight=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const q=new THREE.Vector3(x,y,z).sub(center);
    const h=Math.abs(q.dot(right)),v=Math.abs(q.dot(actualUp)),depth=q.dot(dir);
    distance=Math.max(distance,depth+h/tanH/.83,depth+v/tanV/.83);
    halfHeight=Math.max(halfHeight,v/.84,h/aspect/.84);
  }
  state.center.copy(center);state.fitDistance=distance;state.orthoHalf=halfHeight;
  state.perspective.near=Math.max(.05,r/2000);state.perspective.far=Math.max(20000,distance*15);
  state.perspective.aspect=aspect;state.perspective.updateProjectionMatrix();
  state.ortho.left=-halfHeight*aspect;state.ortho.right=halfHeight*aspect;
  state.ortho.top=halfHeight;state.ortho.bottom=-halfHeight;
  state.ortho.near=.01;state.ortho.far=Math.max(20000,distance*15);
  state.ortho.zoom=1;state.ortho.updateProjectionMatrix();
  state.camera.up.copy(up);state.camera.position.copy(center).addScaledVector(dir,distance);
  state.camera.lookAt(center);state.controls.target.copy(center);
  state.controls.minDistance=Math.max(1,r*.08);state.controls.maxDistance=distance*12;
  state.controls.minZoom=.12;state.controls.maxZoom=40;state.controls.update();
  state.grid.position.set(center.x,bounds.min.y-size.y*.06,center.z);
  state.grid.scale.setScalar(Math.max(.05,size.length()/2000));
  state.ground.position.set(center.x,bounds.min.y-size.y*.064,center.z);
  state.ground.scale.setScalar(Math.max(.05,size.length()/2500));
  state.axes.position.set(bounds.min.x,bounds.min.y,bounds.min.z);
  state.axes.scale.setScalar(Math.max(.05,size.length()/1500));
  state.key.position.copy(center).add(new THREE.Vector3(r*1.5,r*1.9,r*1.6));
  state.key.target.position.copy(center);
  const sc=r*1.5;state.key.shadow.camera.left=-sc;state.key.shadow.camera.right=sc;
  state.key.shadow.camera.top=sc;state.key.shadow.camera.bottom=-sc;
  state.key.shadow.camera.far=r*9;state.key.shadow.camera.updateProjectionMatrix();
}
function switchProjection(state,projection){
  if(!state||state.projection===projection)return;
  const target=state.controls.target.clone();
  const old=state.camera,dir=old.position.clone().sub(target).normalize();
  const perspectiveHeight=2*old.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(state.perspective.fov)/2);
  const currentHeight=old.isOrthographicCamera?2*state.orthoHalf/Math.max(.1,old.zoom):perspectiveHeight;
  const next=projection==='orthographic'?state.ortho:state.perspective;
  next.position.copy(old.position);next.up.copy(old.up);
  if(next.isOrthographicCamera){next.zoom=clamp(2*state.orthoHalf/currentHeight,.12,40);next.updateProjectionMatrix();}
  else {const d=currentHeight/(2*Math.tan(THREE.MathUtils.degToRad(next.fov)/2));next.position.copy(target).addScaledVector(dir,d);next.updateProjectionMatrix();}
  next.lookAt(target);state.camera=next;state.controls.object=next;state.projection=projection;
  state.controls.target.copy(target);state.controls.update();
}
function applyView(state,name){
  if(!state?.model)return;
  if(name==='zoomIn'||name==='zoomOut'){
    const f=name==='zoomIn'?.78:1.28;
    if(state.camera.isOrthographicCamera){state.camera.zoom=clamp(state.camera.zoom/f,.12,40);state.camera.updateProjectionMatrix();}
    else{state.camera.position.copy(state.controls.target).addScaledVector(state.camera.position.clone().sub(state.controls.target),f);}
    state.controls.update();return;
  }
  const dir=name==='fit'?state.camera.position.clone().sub(state.controls.target):vector(VIEW_DIRECTIONS[name]||VIEW_DIRECTIONS.iso);
  fitModel(state,dir);
}
const Viewer=forwardRef(function Viewer({id,imported,options,viewCommand,projection='perspective',background='midnight'},ref){
  const mount=useRef(null),axisCanvas=useRef(null),state=useRef(null),requestId=useRef(0);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const el=mount.current;if(!el)return;
    let raf=0,resize,renderer;
    try{
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none;';
      el.appendChild(renderer.domElement);
      const scene=new THREE.Scene(),perspective=new THREE.PerspectiveCamera(35,1,.1,30000),ortho=new THREE.OrthographicCamera(-100,100,100,-100,.1,30000);
      const camera=projection==='orthographic'?ortho:perspective;
      const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;
      controls.minPolarAngle=.005;controls.maxPolarAngle=Math.PI-.005;controls.enablePan=true;
      scene.add(new THREE.AmbientLight('#dcecf7',.9));scene.add(new THREE.HemisphereLight('#e8f4ff','#334a55',1.15));
      const key=new THREE.DirectionalLight('#fff7e9',2.25);key.position.set(500,900,900);key.castShadow=true;
      key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.00015;scene.add(key,key.target);
      const fill=new THREE.DirectionalLight('#8ac7f2',.9);fill.position.set(-600,400,-500);scene.add(fill);
      // Soft camera-following light keeps CAD details readable when viewing back faces.
      const headlight=new THREE.DirectionalLight('#ffffff',.4);
      headlight.castShadow=false;
      scene.add(headlight,headlight.target);
      const material=new THREE.MeshPhysicalMaterial({color:'#8eabc0',metalness:.18,roughness:.67,clearcoat:0,side:THREE.DoubleSide});
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(2800,2800),new THREE.ShadowMaterial({opacity:.26}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
      const grid=new THREE.GridHelper(2200,44,'#567587','#314654');scene.add(grid);
      const axes=new THREE.AxesHelper(180);scene.add(axes);
      const st={el,renderer,scene,perspective,ortho,camera,controls,material,ground,grid,axes,key,fill,model:null,modelIsImported:false,
        center:new THREE.Vector3(),fitDistance:1000,orthoHalf:800,projection,headlight};state.current=st;
      resize=new ResizeObserver(()=>{
        const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);
        const aspect=w/h;perspective.aspect=aspect;perspective.updateProjectionMatrix();
        ortho.left=-st.orthoHalf*aspect;ortho.right=st.orthoHalf*aspect;
        ortho.top=st.orthoHalf;ortho.bottom=-st.orthoHalf;ortho.updateProjectionMatrix();
      });resize.observe(el);
      const paint=()=>{raf=requestAnimationFrame(paint);controls.update();
        headlight.position.copy(st.camera.position);
        headlight.target.position.copy(controls.target);
        renderer.render(scene,st.camera);orientationGizmo(axisCanvas.current,st.camera);
      };paint();
    }catch(e){console.error('WebGL startup failed',e);setError('WebGL 初始化失败：'+(e.message||'未知错误'));}
    return()=>{++requestId.current;cancelAnimationFrame(raf);resize?.disconnect();
      const st=state.current;if(st?.renderer===renderer){st.controls.dispose();if(st.model&&!st.modelIsImported)disposeTree(st.model,st.material);
        st.ground.geometry.dispose();st.ground.material.dispose();st.grid.geometry.dispose();
        if(Array.isArray(st.grid.material))st.grid.material.forEach(x=>x.dispose());else st.grid.material.dispose();
        st.axes.geometry.dispose();if(Array.isArray(st.axes.material))st.axes.material.forEach(x=>x.dispose());else st.axes.material.dispose();
        st.material.dispose();state.current=null;
      }renderer?.dispose();renderer?.domElement.remove();};
  },[]);

  useEffect(()=>{
    const st=state.current;if(!st)return;
    const req=++requestId.current;setError('');setLoading(true);
    const commit=(root,isImported)=>{
      if(req!==requestId.current){if(!isImported)disposeTree(root,st.material);return;}
      try{
        ensureSurfaceNormals(root, id);
        root.traverse(o=>{if(o.isMesh){o.material=st.material;o.castShadow=true;o.receiveShadow=true;}});
        isUsable(root);root.updateMatrixWorld(true);
        const old=st.model,oldImported=st.modelIsImported;
        st.scene.add(root);st.model=root;st.modelIsImported=isImported;
        try{fitModel(st,new THREE.Vector3(1,.73,1));}
        catch(e){st.model=old;st.modelIsImported=oldImported;throw e;}
        if(old){st.scene.remove(old);if(!oldImported)disposeTree(old,st.material);}
        setError('');setLoading(false);
      }catch(e){st.scene.remove(root);if(!isImported)disposeTree(root,st.material);console.error(e);setError('无法显示模型：'+e.message);setLoading(false);}
    };
    if(imported){const copy=imported.object.clone(true);commit(copy,true);return;}
    const url=`${import.meta.env.BASE_URL}models/${id}.glb?v=2.2`;
    new GLTFLoader().load(url,gltf=>commit(gltf.scene,false),undefined,e=>{
      if(req!==requestId.current)return;
      console.error('Unable to load drawing solid',url,e);
      setError(`无法加载 ${id} 件三维实体，请检查 GitHub public/models/${id}.glb 是否上传完整。`);setLoading(false);
    });
    return()=>{requestId.current++;};
  },[id,imported]);

  useEffect(()=>{const st=state.current;if(!st)return;st.material.color.set(options.color);st.material.metalness=options.metalness;
    st.material.roughness=options.roughness;st.material.opacity=options.opacity;
    st.material.transparent=options.opacity<1;st.material.depthWrite=options.opacity>=1;
    st.material.wireframe=options.wireframe;st.material.needsUpdate=true;
    st.key.intensity=options.light;st.key.castShadow=options.shadows;
    if(st.headlight)st.headlight.intensity=Math.max(.16,options.light*.20);
    st.grid.visible=options.grid;st.ground.visible=options.shadows;st.axes.visible=options.axes;
    st.controls.autoRotate=options.rotate;st.controls.autoRotateSpeed=.7;
  },[options]);
  useEffect(()=>{switchProjection(state.current,projection);},[projection]);
  useEffect(()=>{applyView(state.current,viewCommand.name);},[viewCommand]);

  useImperativeHandle(ref,()=>({
    captureForAI(){const st=state.current;if(!st?.model)throw Error('模型尚未加载');st.renderer.render(st.scene,st.camera);
      const source=st.renderer.domElement,c=document.createElement('canvas'),scale=Math.min(1,980/Math.max(source.width,source.height));
      c.width=source.width*scale;c.height=source.height*scale;
      const ctx=c.getContext('2d');ctx.fillStyle=background==='light'?'#dce8ee':'#1d2d39';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
      return c.toDataURL('image/jpeg',.78);
    },
    screenshot(){const st=state.current;if(!st?.model)throw Error('模型尚未加载');st.renderer.render(st.scene,st.camera);
      st.renderer.domElement.toBlob(blob=>{if(blob)downloadBlob(blob,`2027-${imported?.name||id}-view.png`)},'image/png');
    },
    exportSTL(){const st=state.current;if(!st?.model)throw Error('模型尚未加载');st.model.updateMatrixWorld(true);
      const buffer=new STLExporter().parse(st.model,{binary:true});downloadBlob(new Blob([buffer],{type:'model/stl'}),`2027-${imported?.name||id}-preview.stl`);
    }
  }),[id,imported,background]);
  return <div className="native-viewer">
    <div className="native-canvas" ref={mount}/>
    <canvas className="live-axis-gizmo" ref={axisCanvas} width={180} height={180} aria-label="实时 XYZ 相机方向"/>
    {loading&&<div className="model-load-indicator">正在加载 {id} 件 CAD 实体…</div>}
    {error&&<div className="webgl-error" role="alert"><strong>模型加载失败</strong><span>{error}</span><span>请核对 GitHub Actions 构建日志或模型文件是否缺失。</span></div>}
  </div>;
});
export default Viewer;
