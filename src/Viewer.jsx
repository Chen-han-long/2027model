import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as THREE from 'three';
import { ProceduralPart } from './models';

function downloadBlob(blob, filename) {
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function ImportedShape({imported,material}) {
  const prepared = useMemo(()=>{
    const copy=imported.object.clone(true);
    copy.traverse(child=>{if(child.isMesh){child.material=material;child.castShadow=true;child.receiveShadow=true;}});
    const box=new THREE.Box3().setFromObject(copy);const size=new THREE.Vector3();const center=new THREE.Vector3();box.getSize(size);box.getCenter(center);
    const max=Math.max(size.x,size.y,size.z);
    if(max<1e-10||!Number.isFinite(max))return {object:copy,scale:1,center:new THREE.Vector3()};
    return {object:copy,scale:4.7/max,center};
  },[imported,material]);
  return <group scale={prepared.scale}><primitive object={prepared.object} position={[-prepared.center.x,-prepared.center.y,-prepared.center.z]}/></group>;
}

function CameraRig({viewCommand,autoRotate,controlsRef}) {
  const {camera}=useThree();
  useEffect(()=>{
    const c=controlsRef.current;if(!c)return;
    const dir={iso:[8,5.5,9],front:[0,.01,11],back:[0,.01,-11],right:[11,.01,0],top:[0,11,.01]};
    if(viewCommand.name==='zoomIn'||viewCommand.name==='zoomOut'){
      const direction=camera.position.clone().sub(c.target).multiplyScalar(viewCommand.name==='zoomIn'?.77:1.3);
      camera.position.copy(c.target.clone().add(direction));camera.updateProjectionMatrix();c.update();return;
    }
    const next=dir[viewCommand.name]||dir.iso;
    camera.position.set(...next);c.target.set(0,0,0);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();c.update();
  },[viewCommand, camera, controlsRef]);
  useEffect(()=>{if(controlsRef.current){controlsRef.current.autoRotate=autoRotate;controlsRef.current.update();}},[autoRotate,controlsRef]);
  return null;
}

function Scene({id,imported,options,viewCommand,modelRootRef}) {
  const controls=useRef();
  const mat=useMemo(()=>new THREE.MeshPhysicalMaterial({color:options.color,metalness:options.metalness,roughness:options.roughness,clearcoat:.18,clearcoatRoughness:.3,wireframe:options.wireframe,opacity:options.opacity,transparent:options.opacity<1,side:THREE.DoubleSide,depthWrite:options.opacity>=1}),[options.color,options.metalness,options.roughness,options.wireframe,options.opacity]);
  useEffect(()=>()=>mat.dispose(),[mat]);
  return <>
    <ambientLight intensity={.60} />
    <hemisphereLight args={['#d6f1ff','#172334',1.1]} />
    <directionalLight position={[5,9,7]} intensity={options.light} castShadow={options.shadows} shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-.00025} />
    <directionalLight position={[-7,1,-6]} intensity={.9} color="#7eb1cb" />
    <directionalLight position={[0,2,10]} intensity={.55} color="#f5e9db" />
    <group ref={modelRootRef} key={imported?.name||id}>
      {imported?<ImportedShape imported={imported} material={mat}/>:<ProceduralPart id={id} material={mat} explode={options.explode} labels={options.labels}/>}
    </group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-3.03,0]} receiveShadow visible={options.shadows}>
      <planeGeometry args={[120,120]}/>
      <shadowMaterial transparent opacity={.32}/>
    </mesh>
    {options.grid && <gridHelper args={[16,32,'#3c596a','#233746']} position={[0,-3.02,0]} />}
    {options.axes && <axesHelper args={[3.2]} position={[-3.3,-2.9,-3.3]} />}
    <OrbitControls ref={controls} enableDamping dampingFactor={.075} rotateSpeed={.65} zoomSpeed={.9} panSpeed={.75} minDistance={3.3} maxDistance={29} autoRotate={options.rotate} autoRotateSpeed={.85} makeDefault />
    <CameraRig viewCommand={viewCommand} autoRotate={options.rotate} controlsRef={controls} />
  </>;
}

function compositedCanvas(renderer, background, maxSide=0) {
  if(!renderer) throw new Error('3D 画布尚未准备好');
  renderer.render(renderer.userData.scene,renderer.userData.camera);
  const source=renderer.domElement;
  const scale=maxSide?Math.min(1,maxSide/Math.max(source.width,source.height)):1;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
  const ctx=canvas.getContext('2d');
  const colors=background==='light'?['#dce8ec','#8196a5']:background==='slate'?['#45535f','#14202b']:['#263745','#111c27'];
  const gradient=ctx.createRadialGradient(canvas.width*.48,canvas.height*.38,0,canvas.width*.48,canvas.height*.38,Math.max(canvas.width,canvas.height)*.8);
  gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}

const Viewer = forwardRef(function Viewer({id,imported,options,viewCommand,background='midnight'},ref){
  const renderer=useRef();const modelRoot=useRef();
  useImperativeHandle(ref,()=>({
    screenshot(){
      const canvas=compositedCanvas(renderer.current,background);
      canvas.toBlob(blob=>{if(blob)downloadBlob(blob,`2027-${imported?.name||id}-view.png`);else alert('截图失败，请换用最新版浏览器。')},'image/png');
    },
    captureForAI(){
      return compositedCanvas(renderer.current,background,960).toDataURL('image/jpeg',.74);
    },
    exportSTL(){
      if(!modelRoot.current)throw new Error('3D 模型尚未准备好');
      const exporter=new STLExporter();
      modelRoot.current.updateMatrixWorld(true);
      const result=exporter.parse(modelRoot.current,{binary:true});
      downloadBlob(new Blob([result],{type:'model/stl'}),`2027-${imported?.name||id}-preview.stl`);
    }
  }),[id,imported,background]);
  return <Canvas shadows dpr={[1,2]} gl={{antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'}} camera={{fov:34,near:.1,far:120,position:[8,5.5,9]}} onCreated={({gl,scene,camera})=>{renderer.current=gl;gl.userData.scene=scene;gl.userData.camera=camera;gl.setClearColor('#000000',0)}}>
    <Scene id={id} imported={imported} options={options} viewCommand={viewCommand} modelRootRef={modelRoot}/>
  </Canvas>;
});
export default Viewer;
