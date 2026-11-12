import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { buildPart, disposePart } from './modelFactory.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1800);
}

function axesGizmo(canvas, camera) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const inverse = camera.quaternion.clone().invert();
  const basis = [
    { name: 'X', rgb: '#ef817b', vec: new THREE.Vector3(1, 0, 0) },
    { name: 'Y', rgb: '#8bd9ad', vec: new THREE.Vector3(0, 1, 0) },
    { name: 'Z', rgb: '#89bdfa', vec: new THREE.Vector3(0, 0, 1) }
  ];
  const origin = [W / 2, H / 2], len = W * .28;
  const projected = basis.map(axis => ({ ...axis, relative: axis.vec.applyQuaternion(inverse) }));
  projected.sort((a, b) => a.relative.z - b.relative.z);
  for (const axis of projected) {
    const x = origin[0] + axis.relative.x * len, y = origin[1] - axis.relative.y * len;
    ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(x, y); ctx.strokeStyle = axis.rgb; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = axis.rgb; ctx.fill();
    ctx.fillStyle = axis.rgb; ctx.font = 'bold 19px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(axis.name, origin[0] + axis.relative.x * (len + 15), origin[1] - axis.relative.y * (len + 15));
  }
  ctx.beginPath(); ctx.arc(...origin, 5, 0, Math.PI * 2); ctx.fillStyle = '#d4e3e9'; ctx.fill();
}

function compositeCanvas(state, background, maxSide = 0) {
  if (!state?.renderer) throw new Error('三维画布尚未就绪');
  state.renderer.render(state.scene, state.camera);
  const source = state.renderer.domElement;
  const factor = maxSide ? Math.min(1, maxSide / Math.max(source.width, source.height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * factor)); canvas.height = Math.max(1, Math.round(source.height * factor));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器无法创建截图画布');
  const colors = background === 'light' ? ['#dce8ec', '#8196a5'] : background === 'slate' ? ['#45535f', '#14202b'] : ['#263745', '#111c27'];
  const gradient = ctx.createRadialGradient(canvas.width * .48, canvas.height * .38, 0, canvas.width * .48, canvas.height * .38, Math.max(canvas.width, canvas.height) * .8);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function importedGroup(imported, material) {
  const source = imported.object.clone(true);
  source.traverse(object => {
    if (object.isMesh) { object.material = material; object.castShadow = true; object.receiveShadow = true; }
  });
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source), center = bounds.getCenter(new THREE.Vector3());
  source.position.sub(center);
  const root = new THREE.Group(); root.add(source); root.name = `Imported-${imported.name}`;
  return root;
}

function safeDispose(root, material, isImported) {
  if (!root || isImported) return;
  disposePart(root, material);
}

// An invalid geometry or distant accidental vertex must never replace a
// previously visible part. This also catches an empty model (no thrown error).
function verifyModel(root, id) {
  if (!root) throw new Error(`${id} 件没有生成三维节点`);
  let meshes = 0, finitePositions = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const positions=object.geometry?.getAttribute('position');
    if(!positions?.count)throw new Error(`${id} 件包含空网格`);
    for(let i=0;i<positions.array.length;i++){
      if(!Number.isFinite(positions.array[i]))throw new Error(`${id} 件网格坐标出现 NaN/Infinity`);
    }
    finitePositions+=positions.count;
  });
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);
  const dims=bounds.getSize(new THREE.Vector3());
  if (!meshes||finitePositions<3||bounds.isEmpty()||
      ![dims.x,dims.y,dims.z].every(v=>Number.isFinite(v)&&v>1&&v<100000))
    throw new Error(`${id} 件模型包围盒不合理或没有可见网格`);
  if(id==='H' && (dims.z<620 || dims.z>750 || dims.y<750 || dims.y>1030))
    throw new Error(`H 件生成尺寸异常：${dims.x.toFixed(0)}×${dims.y.toFixed(0)}×${dims.z.toFixed(0)} mm`);
  return {meshes, vertices:finitePositions, bounds};
}

// Deliberately simple fail-safe for H, with an unmistakable on-screen warning.
// It is never reported as a completed drawing-based model.
function emergencyHousing(material) {
  const group = new THREE.Group(); group.name = 'H-emergency-visibility';
  const outer=new THREE.Mesh(new THREE.CylinderGeometry(265,265,624,64,1,true),material);
  outer.rotation.x=Math.PI/2;outer.position.y=552;group.add(outer);
  for(const z of [-325,325]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(250,20,16,80),material);
    ring.position.set(0,552,z);group.add(ring);
  }
  for(const y of [15,875]) {
    const foot=new THREE.Mesh(new THREE.BoxGeometry(600,30,650),material);
    foot.position.set(0,y,0);group.add(foot);
  }
  return group;
}
function createVerifiedPart(id, imported, material, options) {
  let result;
  try {
    result=imported?importedGroup(imported,material):buildPart(id,material,options.explode,options.labels);
    const stats=verifyModel(result, imported ? '自定义' : id);
    const stages=result.userData?.detailStages || [];
    const omissions=stages.filter(s=>!s.ok);
    return {root:result,stats,warning:omissions.length?
      `${id} 件已显示，${omissions.map(s=>s.name).join('、')}存在生成问题（F12 控制台可查看详情）。`:''};
  } catch(error){
    if(result&&!imported) safeDispose(result,material,false);
    if(!imported&&id==='H'){
      console.error('[ForgeStudio] H drawing mesh failed; showing emergency shape:',error);
      const fallback=emergencyHousing(material);
      return {root:fallback,stats:verifyModel(fallback,'H'),warning:`H 件精细模型生成失败，当前显示的是简化保底模型。原因：${error.message}`};
    }
    throw error;
  }
}

// Projection-aware fit: orientation is independent of resize, model switching,
// or switching between orthographic and perspective projection.
const DEFAULT_DIRECTION = new THREE.Vector3(1, .75, 1).normalize();
function fitCamera(state, model, element, resetDirection = false) {
  if (!state || !model || !element) return;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x,size.y,size.z,1);
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius,maxDim*.5);
  const aspect = Math.max(.25, element.clientWidth/Math.max(1,element.clientHeight));
  const camera = state.camera;
  let direction = resetDirection ? DEFAULT_DIRECTION.clone() : camera.position.clone().sub(state.controls.target).normalize();
  if (direction.lengthSq()<.5) direction=DEFAULT_DIRECTION.clone();
  const previousScale=state.fitDistance>0 && !resetDirection
    ? THREE.MathUtils.clamp(camera.isOrthographicCamera
      ? 1/Math.max(.1,camera.zoom)
      : camera.position.distanceTo(state.controls.target)/state.fitDistance,.20,6)
    : 1;
  const worldUp = Math.abs(direction.dot(new THREE.Vector3(0,1,0)))>.998
    ? (Math.abs(camera.up.z)>.5?camera.up.clone():new THREE.Vector3(0,0,-1))
    : (resetDirection?new THREE.Vector3(0,1,0):camera.up.clone());
  const right=new THREE.Vector3().crossVectors(worldUp,direction).normalize();
  if(right.lengthSq()<.5)right.set(1,0,0);
  const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  let projectedWidth=0,projectedHeight=0;
  const relative=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center);
    const h=Math.abs(p.dot(right)),v=Math.abs(p.dot(up)),depth=p.dot(direction);
    projectedWidth=Math.max(projectedWidth,h);projectedHeight=Math.max(projectedHeight,v);
    relative.push({h,v,depth});
  }
  // Fit all 8 vertices inside the actual camera frustum, including the
  // near-to-camera corners (important for the long E / D castings).
  const margin=.82,verticalFov=THREE.MathUtils.degToRad(state.perspectiveCamera.fov);
  const tanV=Math.tan(verticalFov/2),tanH=tanV*aspect;
  let idealDistance=radius*1.2;
  for(const p of relative)idealDistance=Math.max(idealDistance,
    p.depth+p.h/(tanH*margin),p.depth+p.v/(tanV*margin));
  idealDistance=Math.max(idealDistance,radius*1.35);
  const halfHeight=Math.max(projectedHeight,projectedWidth/aspect,1)/margin;
  const ortho=state.orthoCamera;
  ortho.left=-halfHeight*aspect;ortho.right=halfHeight*aspect;
  ortho.top=halfHeight;ortho.bottom=-halfHeight;
  ortho.zoom=resetDirection?1:(camera.isOrthographicCamera?1/previousScale:Math.max(.1,ortho.zoom||1));
  ortho.near=.01;ortho.far=Math.max(20000,maxDim*20);ortho.updateProjectionMatrix();
  state.perspectiveCamera.aspect=aspect;
  state.perspectiveCamera.near=Math.max(.01,radius/5000);
  state.perspectiveCamera.far=Math.max(20000,idealDistance*12+radius*5);
  state.perspectiveCamera.updateProjectionMatrix();
  state.center.copy(center);state.modelRadius=radius;state.fitDistance=idealDistance;
  camera.position.copy(center).addScaledVector(direction,idealDistance*(camera.isOrthographicCamera?1:previousScale));
  camera.up.copy(worldUp);camera.lookAt(center);
  state.controls.target.copy(center);
  state.controls.minDistance=Math.max(.01,radius*.06);
  state.controls.maxDistance=idealDistance*25;
  state.controls.minZoom=.1;state.controls.maxZoom=30;
  state.controls.update();
  const groundY=bounds.min.y-maxDim*.04;
  state.ground.position.set(center.x,groundY,center.z);
  state.ground.scale.setScalar(Math.max(1,maxDim/1800));
  state.grid.position.set(center.x,groundY+.5,center.z);
  state.grid.scale.setScalar(Math.max(.7,maxDim/1800));
  state.axes.position.set(bounds.min.x-maxDim*.06,bounds.min.y,bounds.min.z-maxDim*.06);
  state.axes.scale.setScalar(maxDim/1500);
  state.keyLight.position.set(center.x+maxDim*.85,center.y+maxDim*1.5,center.z+maxDim*1.1);
  state.fillLight.position.set(center.x-maxDim*1.1,center.y+maxDim*.35,center.z-maxDim*.9);
  state.rimLight.position.set(center.x,center.y+maxDim*.65,center.z+maxDim*1.3);
  for(const light of [state.keyLight,state.fillLight,state.rimLight])light.target.position.copy(center);
  const extent=maxDim*.95;
  state.keyLight.shadow.camera.left=-extent;state.keyLight.shadow.camera.right=extent;
  state.keyLight.shadow.camera.top=extent;state.keyLight.shadow.camera.bottom=-extent;
  state.keyLight.shadow.camera.near=.1;state.keyLight.shadow.camera.far=maxDim*5;
  state.keyLight.shadow.camera.updateProjectionMatrix();
  state.renderer.render(state.scene,camera);
}
function setProjection(state, projection, element) {
  if(!state || state.projection===projection)return;
  const oldCamera=state.camera;
  const target=state.controls.target.clone();
  const direction=oldCamera.position.clone().sub(target).normalize();
  const ratio=THREE.MathUtils.clamp(oldCamera.isOrthographicCamera
    ? 1/Math.max(.1,oldCamera.zoom)
    : oldCamera.position.distanceTo(target)/Math.max(1,state.fitDistance),.2,5);
  const next=projection==='orthographic'?state.orthoCamera:state.perspectiveCamera;
  next.position.copy(target).addScaledVector(direction,Math.max(1,state.fitDistance));
  next.up.copy(oldCamera.up);
  next.zoom=next.isOrthographicCamera?1/ratio:1;
  next.lookAt(target);next.updateProjectionMatrix();
  state.camera=next;
  state.controls.object=next;
  state.projection=projection;
  fitCamera(state,state.model,element,false);
  // Keep one, and only one, zoom multiplier when switching projection.
  if(next.isOrthographicCamera){next.zoom=1/ratio;next.updateProjectionMatrix();}
  else{next.position.copy(state.center).addScaledVector(direction,state.fitDistance*ratio);next.lookAt(state.center);}
  state.controls.target.copy(state.center);
  state.controls.update();
}

const Viewer = forwardRef(function Viewer({ id, imported, options, viewCommand, projection = 'perspective', background = 'midnight' }, ref) {
  const mount = useRef(null), gizmo = useRef(null), state = useRef(null), [issue, setIssue] = useState(''), [notice, setNotice]=useState('');

  useEffect(() => {
    const element = mount.current; if (!element) return;
    let renderer, frame = null, resizeObserver, lossHandler;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      renderer.domElement.setAttribute('aria-label', '可旋转的三维机械零件'); element.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const perspectiveCamera = new THREE.PerspectiveCamera(34, 1, .1, 20000);
      const orthoCamera = new THREE.OrthographicCamera(-500,500,500,-500,.01,20000);
      const camera = projection==='orthographic'?orthoCamera:perspectiveCamera;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = .075; controls.rotateSpeed = .68;
      controls.zoomSpeed = .9; controls.panSpeed = .75; controls.screenSpacePanning = true;
      controls.target.set(0, 0, 0);

      scene.add(new THREE.AmbientLight('#d9e7f2', 1.05));
      scene.add(new THREE.HemisphereLight('#e9f8ff', '#26364b', 1.45));
      const keyLight = new THREE.DirectionalLight('#ffffff', 2.8); keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.bias = -.00015; scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#87c5e7', .9); scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight('#ffefdf', .65); scene.add(rimLight);
      scene.add(keyLight.target, fillLight.target, rimLight.target);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.ShadowMaterial({ transparent: true, opacity: .28 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
      const grid = new THREE.GridHelper(2000, 40, '#54778a', '#304654'); scene.add(grid);
      const axes = new THREE.AxesHelper(160); scene.add(axes);
      const material = new THREE.MeshPhysicalMaterial({ color: '#8eabc0', metalness: .58, roughness: .34, clearcoat: .12, side: THREE.DoubleSide });
      const {root:model,warning:startingWarning,stats:modelStats} = createVerifiedPart(id, imported, material, options);
      scene.add(model);

      const current = {
        renderer, scene, camera, perspectiveCamera, orthoCamera, projection, controls, material, model, modelIsImported: !!imported,
        keyLight, fillLight, rimLight, ground, grid, axes, center: new THREE.Vector3(),
        fitDistance: 1000, modelRadius: 500, modelStats, modelInput:{id, imported, explode: options.explode, labels:options.labels}
      };
      state.current = current;

      function resize() {
        const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
        renderer.setSize(width, height, false);
        // Important: viewport resize must not reset the user's orbit angle.
        fitCamera(current, current.model, element, current.fitDistance === 1000 && !current.initialized);
        current.initialized = true; axesGizmo(gizmo.current, current.camera);
      }
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); resize();
      lossHandler = event => { event.preventDefault(); setIssue('浏览器的 WebGL 图形上下文丢失。请刷新页面，并检查浏览器硬件加速是否开启。'); };
      renderer.domElement.addEventListener('webglcontextlost', lossHandler);
      const animate = () => {
        frame = window.requestAnimationFrame(animate);
        try { controls.update(); renderer.render(scene, current.camera); axesGizmo(gizmo.current, current.camera); }
        catch (error) { window.cancelAnimationFrame(frame); frame = null; console.error('[ForgeStudio] 3D render failed:', error); setIssue(`三维渲染失败：${error.message || '未知错误'}`); }
      };
      animate(); setIssue(''); setNotice(startingWarning);
    } catch (error) {
      console.error('[ForgeStudio] WebGL init failed:', error);
      setIssue(`WebGL 初始化失败：${error.message || '无法使用显卡加速'}。建议开启浏览器硬件加速并刷新。`);
    }

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (resizeObserver) resizeObserver.disconnect();
      const current = state.current;
      if (current?.renderer === renderer) {
        current.controls.dispose(); safeDispose(current.model, current.material, current.modelIsImported);
        current.material.dispose(); current.ground.geometry.dispose(); current.ground.material.dispose();
        current.grid.geometry.dispose(); current.grid.material.forEach?.(item => item.dispose());
        if (Array.isArray(current.axes.material)) current.axes.material.forEach(item => item.dispose()); else current.axes.material.dispose();
        current.axes.geometry.dispose(); state.current = null;
      }
      if (renderer) { renderer.domElement.removeEventListener('webglcontextlost', lossHandler); renderer.dispose(); renderer.domElement.remove(); }
    };
  }, []);

  useEffect(() => {
    const current = state.current; if (!current) return;
    try {
      const prior=current.modelInput;
      if(prior && prior.id===id && prior.imported===imported &&
         prior.explode===options.explode && prior.labels===options.labels) return;
      // Atomic swap: never discard the visible model until the next one is
      // fully generated, finite, and has a valid bounding box.
      const next=createVerifiedPart(id, imported, current.material, options);
      const previous=current.model,previousImported=current.modelIsImported;
      current.scene.add(next.root);
      try { fitCamera(current,next.root,mount.current,true); }
      catch (error) {
        current.scene.remove(next.root);
        safeDispose(next.root,current.material,!!imported);
        throw error;
      }
      current.model=next.root;
      current.modelIsImported=!!imported;current.modelStats=next.stats;
      current.modelInput={id,imported,explode:options.explode,labels:options.labels};
      if(previous){ current.scene.remove(previous);safeDispose(previous,current.material,previousImported); }
      axesGizmo(gizmo.current,current.camera);
      setIssue('');setNotice(next.warning);
    } catch (error) {
      console.error('[ForgeStudio] Model creation failed:', error); setNotice(`新模型加载失败，已保留上一个可用模型：${error.message || '未知错误'}`);
    }
  }, [id, imported, options.explode, options.labels]);

  useEffect(() => {
    const current=state.current;if(!current)return;
    setProjection(current, projection, mount.current);
    axesGizmo(gizmo.current,current.camera);
  }, [projection]);

  useEffect(() => {
    const current = state.current; if (!current) return;
    const material = current.material;
    material.color.set(options.color); material.metalness = options.metalness; material.roughness = options.roughness;
    material.wireframe = options.wireframe; material.opacity = options.opacity; material.transparent = options.opacity < 1;
    material.depthWrite = options.opacity >= 1; material.needsUpdate = true;
    current.keyLight.intensity = options.light; current.keyLight.castShadow = options.shadows;
    current.ground.visible = options.shadows; current.grid.visible = options.grid; current.axes.visible = options.axes;
    current.controls.autoRotate = options.rotate; current.controls.autoRotateSpeed = .75;
  }, [options]);

  useEffect(() => {
    const current=state.current;if(!current)return;
    const name=viewCommand.name,camera=current.camera;
    if(name==='zoomIn'||name==='zoomOut'){
      const factor=name==='zoomIn'?.80:1.25;
      if(camera.isOrthographicCamera){
        camera.zoom=THREE.MathUtils.clamp(camera.zoom/factor,.1,30);
        camera.updateProjectionMatrix();
      } else {
        camera.position.copy(current.controls.target).addScaledVector(
          camera.position.clone().sub(current.controls.target).multiplyScalar(factor),1);
      }
    }else if(name==='fit'){
      // Fit at the current direction, resetting zoom to show the whole part.
      if(camera.isOrthographicCamera)camera.zoom=1;
      else camera.position.copy(current.controls.target).addScaledVector(
        camera.position.clone().sub(current.controls.target).normalize(),current.fitDistance);
      fitCamera(current,current.model,mount.current,false);
    }else{
      const endOnX=!imported&&id==='E';
      const directions={
        iso:[1,.8,1],front:endOnX?[1,0,0]:[0,0,1],
        back:endOnX?[-1,0,0]:[0,0,-1],
        right:endOnX?[0,0,1]:[1,0,0],left:endOnX?[0,0,-1]:[-1,0,0],
        top:[0,1,0],bottom:[0,-1,0]
      };
      const direction=new THREE.Vector3(...(directions[name]||directions.iso)).normalize();
      camera.up.set(0,1,0);
      if(name==='top')camera.up.set(0,0,-1);
      if(name==='bottom')camera.up.set(0,0,1);
      camera.position.copy(current.center).addScaledVector(direction,current.fitDistance);
      current.controls.target.copy(current.center);
      fitCamera(current,current.model,mount.current,false);
    }
    camera.lookAt(current.controls.target);camera.updateProjectionMatrix();
    current.controls.update();axesGizmo(gizmo.current,camera);
  }, [viewCommand]);

  useImperativeHandle(ref, () => ({
    screenshot() {
      const shot = compositeCanvas(state.current, background);
      shot.toBlob(blob => { if (blob) downloadBlob(blob, `2027-${imported?.name || id}-view.png`); }, 'image/png');
    },
    captureForAI() { return compositeCanvas(state.current, background, 960).toDataURL('image/jpeg', .74); },
    exportSTL() {
      const current = state.current; if (!current?.model) throw new Error('3D 模型尚未准备好');
      current.model.updateMatrixWorld(true);
      const bytes = new STLExporter().parse(current.model, { binary: true });
      downloadBlob(new Blob([bytes], { type: 'model/stl' }), `2027-${imported?.name || id}-preview-mm.stl`);
    }
  }), [id, imported, background]);

  return React.createElement('div', { className: 'native-viewer' },
    React.createElement('div', { ref: mount, className: 'native-canvas' }),
    React.createElement('canvas', { ref: gizmo, width: 180, height: 180, className: 'live-axis-gizmo', 'aria-label': '随视角旋转的 XYZ 坐标轴' }),
    notice ? React.createElement('div',{ className:'model-notice',role:'status'},notice) : null,
    issue ? React.createElement('div', { className: 'webgl-error', role: 'alert' },
      React.createElement('strong', null, '3D 模型未能渲染'),
      React.createElement('span', null, issue),
      React.createElement('span', null, '建议使用新版 Chrome / Edge，开启硬件加速后刷新。浏览器按 F12 → Console 可查看具体错误。')
    ) : null
  );
});

export default Viewer;
