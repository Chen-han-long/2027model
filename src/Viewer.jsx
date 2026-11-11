import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { buildPart, disposePart } from './modelFactory.js';

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1800);
}
function axesGizmo(canvas,camera){
  if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const invert=camera.quaternion.clone().invert();
  const basis=[
    {name:'X',rgb:'#ef817b',vec:new THREE.Vector3(1,0,0)},
    {name:'Y',rgb:'#8bd9ad',vec:new THREE.Vector3(0,1,0)},
    {name:'Z',rgb:'#89bdfa',vec:new THREE.Vector3(0,0,1)}
  ];
  const origin=[W/2,H/2],len=W*.28;
  const projected=basis.map(axis=>({...axis,relative:axis.vec.applyQuaternion(invert)}));
  projected.sort((a,b)=>a.relative.z-b.relative.z); // draw farther axis first
  for(const a of projected){
    const x=origin[0]+a.relative.x*len,y=origin[1]-a.relative.y*len;
    ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(x,y);ctx.strokeStyle=a.rgb;ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=a.rgb;ctx.fill();
    const lx=origin[0]+a.relative.x*(len+15),ly=origin[1]-a.relative.y*(len+15);
    ctx.fillStyle=a.rgb;ctx.font='bold 19px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(a.name,lx,ly);
  }
  ctx.beginPath();ctx.arc(...origin,5,0,Math.PI*2);ctx.fillStyle='#d4e3e9';ctx.fill();
}
function compositeCanvas(state,background,maxSide=0){
  if(!state?.renderer)throw new Error('三维画布尚未就绪');
  state.renderer.render(state.scene,state.camera);
  const source=state.renderer.domElement;
  const factor=maxSide?Math.min(1,maxSide/Math.max(source.width,source.height)):1;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*factor));canvas.height=Math.max(1,Math.round(source.height*factor));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法创建截图画布');
  const colors=background==='light'?['#dce8ec','#8196a5']:background==='slate'?['#45535f','#14202b']:['#263745','#111c27'];
  const gr=ctx.createRadialGradient(canvas.width*.48,canvas.height*.38,0,canvas.width*.48,canvas.height*.38,Math.max(canvas.width,canvas.height)*.8);
  gr.addColorStop(0,colors[0]);gr.addColorStop(1,colors[1]);ctx.fillStyle=gr;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}
function importedGroup(imported,material){
  const source=imported.object.clone(true);
  source.traverse(o=>{if(o.isMesh){o.material=material;o.castShadow=true;o.receiveShadow=true;}});
  source.updateMatrixWorld(true);
  const bbox=new THREE.Box3().setFromObject(source),size=new THREE.Vector3(),center=new THREE.Vector3();
  bbox.getSize(size);bbox.getCenter(center);
  const root=new THREE.Group();
  if(Math.max(size.x,size.y,size.z)>1e-9){
    const factor=4.75/Math.max(size.x,size.y,size.z);
    // Keep the internal object transformations intact and normalize the imported bounds.
    const wrapper=new THREE.Group();root.add(wrapper);wrapper.scale.setScalar(factor);wrapper.position.copy(center).multiplyScalar(-factor);
    wrapper.add(source);
  }else root.add(source);
  return root;
}
function safeDispose(root,material,isImported){
  if(!root)return;
  if(!isImported)disposePart(root,material);
  // Imported file meshes share source geometry: do not dispose them when changing views.
}

const Viewer=forwardRef(function Viewer({id,imported,options,viewCommand,background='midnight'},ref){
  const mount=useRef(null),gizmo=useRef(null),state=useRef(null),[issue,setIssue]=useState('');
  useEffect(()=>{
    const el=mount.current;if(!el)return;
    let renderer,frame,resizeObserver,lossHandler;
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
      renderer.domElement.setAttribute('aria-label','可旋转的三维机械零件');
      el.appendChild(renderer.domElement);
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,250);
      camera.position.set(8,5.5,9);camera.lookAt(0,0,0);
      const controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=true;controls.dampingFactor=.075;controls.rotateSpeed=.65;controls.zoomSpeed=.9;controls.panSpeed=.75;
      controls.minDistance=4;controls.maxDistance=45;controls.target.set(0,0,0);controls.update();
      scene.add(new THREE.AmbientLight('#d9e7f2',1.15));
      scene.add(new THREE.HemisphereLight('#e9f8ff','#26364b',2.0));
      const keyLight=new THREE.DirectionalLight('#ffffff',3.2);keyLight.position.set(5,9,7);keyLight.castShadow=true;
      keyLight.shadow.mapSize.set(2048,2048);
      keyLight.shadow.camera.left=-10;keyLight.shadow.camera.right=10;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;
      keyLight.shadow.camera.near=.5;keyLight.shadow.camera.far=40;keyLight.shadow.bias=-.0002;
      scene.add(keyLight);
      const fill=new THREE.DirectionalLight('#87c5e7',1.1);fill.position.set(-7,2,-6);scene.add(fill);
      const rim=new THREE.DirectionalLight('#ffefdf',.8);rim.position.set(0,3,10);scene.add(rim);
      const ground=meshGround(scene);
      const grid=new THREE.GridHelper(16,32,'#54778a','#304654');grid.position.y=-3.015;scene.add(grid);
      const axes=new THREE.AxesHelper(3.2);axes.position.set(-3.35,-2.95,-3.35);scene.add(axes);
      const material=new THREE.MeshPhysicalMaterial({color:'#8eabc0',metalness:.68,roughness:.32,clearcoat:.12,side:THREE.DoubleSide});
      const model=buildPart(id,material,options.explode,options.labels);scene.add(model);
      const s={renderer,scene,camera,controls,material,model,modelIsImported:false,keyLight,grid,axes,ground,opts:options};state.current=s;
      function resize(){
        const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
        renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);
        axesGizmo(gizmo.current,camera);
      }
      resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);resize();
      lossHandler=e=>{e.preventDefault();setIssue('浏览器的 WebGL 图形上下文丢失。请刷新页面，并检查浏览器硬件加速是否开启。');};
      renderer.domElement.addEventListener('webglcontextlost',lossHandler);
      const animate=()=>{
        frame=window.requestAnimationFrame(animate);
        try{controls.update();renderer.render(scene,camera);axesGizmo(gizmo.current,camera);}
        catch(err){window.cancelAnimationFrame(frame);frame=null;console.error('[ForgeStudio] 3D render failed:',err);setIssue(`三维渲染失败：${err.message||'未知错误'}`);}
      };
      animate();setIssue('');
    }catch(err){
      console.error('[ForgeStudio] WebGL init failed:',err);
      setIssue(`WebGL 初始化失败：${err.message||'无法使用显卡加速'}。建议开启浏览器硬件加速并刷新。`);
    }
    return ()=>{
      window.cancelAnimationFrame(frame);
      if(resizeObserver)resizeObserver.disconnect();
      const s=state.current;
      if(s?.renderer===renderer){
        s.controls.dispose();safeDispose(s.model,s.material,s.modelIsImported);s.material.dispose();
        s.ground.geometry.dispose();s.ground.material.dispose();s.grid.geometry.dispose();s.grid.material.dispose();s.axes.geometry.dispose();s.axes.material.dispose();
        state.current=null;
      }
      if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lossHandler);renderer.dispose();renderer.domElement.remove();}
    };
  },[]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    try{
      if(s.model){s.scene.remove(s.model);safeDispose(s.model,s.material,s.modelIsImported);}
      const root=imported?importedGroup(imported,s.material):buildPart(id,s.material,options.explode,options.labels);
      s.scene.add(root);s.model=root;s.modelIsImported=!!imported;
    }catch(err){console.error('[ForgeStudio] Model creation failed:',err);setIssue(`模型创建失败：${err.message}`);}
  },[id,imported,options.explode,options.labels]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    const m=s.material;
    m.color.set(options.color);m.metalness=options.metalness;m.roughness=options.roughness;
    m.wireframe=options.wireframe;m.opacity=options.opacity;m.transparent=options.opacity<1;m.depthWrite=options.opacity>=1;m.needsUpdate=true;
    s.keyLight.intensity=options.light;
    s.keyLight.castShadow=options.shadows;s.ground.visible=options.shadows;s.grid.visible=options.grid;s.axes.visible=options.axes;
    s.controls.autoRotate=options.rotate;s.controls.autoRotateSpeed=.85;
  },[options]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    const names={iso:[8,5.5,9],front:[0,.01,12],back:[0,.01,-12],right:[12,.01,0],top:[.01,12,.01]};
    const name=viewCommand.name;
    if(name==='zoomIn'||name==='zoomOut'){
      const direction=s.camera.position.clone().sub(s.controls.target).multiplyScalar(name==='zoomIn'?.77:1.3);
      s.camera.position.copy(s.controls.target.clone().add(direction));
    }else{
      s.camera.position.fromArray(names[name]||names.iso);s.controls.target.set(0,0,0);s.camera.up.set(0,1,0);
    }
    s.camera.lookAt(s.controls.target);s.camera.updateProjectionMatrix();s.controls.update();
    axesGizmo(gizmo.current,s.camera);
  },[viewCommand]);
  useImperativeHandle(ref,()=>({
    screenshot(){const shot=compositeCanvas(state.current,background);shot.toBlob(blob=>{if(blob)downloadBlob(blob,`2027-${imported?.name||id}-view.png`);},'image/png');},
    captureForAI(){return compositeCanvas(state.current,background,960).toDataURL('image/jpeg',.74);},
    exportSTL(){const s=state.current;if(!s?.model)throw new Error('3D 模型尚未准备好');
      s.model.updateMatrixWorld(true);const bytes=new STLExporter().parse(s.model,{binary:true});
      downloadBlob(new Blob([bytes],{type:'model/stl'}),`2027-${imported?.name||id}-preview.stl`);
    }
  }),[id,imported,background]);
  return React.createElement('div',{className:'native-viewer'},
    React.createElement('div',{ref:mount,className:'native-canvas'}),
    React.createElement('canvas',{ref:gizmo,width:180,height:180,className:'live-axis-gizmo','aria-label':'随视角旋转的 XYZ 坐标轴'}),
    issue?React.createElement('div',{className:'webgl-error',role:'alert'},
      React.createElement('strong',null,'3D 模型未能渲染'),
      React.createElement('span',null,issue),
      React.createElement('span',null,'建议使用新版 Chrome / Edge，开启硬件加速后刷新。浏览器按 F12 → Console 可查看具体错误。')
    ):null
  );
});
function meshGround(scene){
  const geo=new THREE.PlaneGeometry(120,120),mat=new THREE.ShadowMaterial({transparent:true,opacity:.32});
  const ground=new THREE.Mesh(geo,mat);ground.rotation.x=-Math.PI/2;ground.position.y=-3.03;ground.receiveShadow=true;scene.add(ground);return ground;
}
export default Viewer;
