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

function fitCamera(state, model, element) {
  if (!state || !model || !element) return;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, maxDim * .5);
  const aspect = Math.max(.35, element.clientWidth / Math.max(1, element.clientHeight));
  const verticalFov = THREE.MathUtils.degToRad(state.camera.fov);
  const tanV = Math.tan(verticalFov / 2);
  const tanH = tanV * aspect;
  const direction = new THREE.Vector3(1, .72, 1).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction,right).normalize();
  // Perspective fit from all eight projected box corners, not an overly
  // conservative bounding sphere. Occupies ~85% of the available viewport.
  const margin = .86;
  let distance = radius;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x,y,z).sub(center);
        const depth = p.dot(direction);
        distance = Math.max(distance,
          depth + Math.abs(p.dot(right)) / (tanH * margin),
          depth + Math.abs(p.dot(up)) / (tanV * margin));
      }
  distance = Math.max(distance, radius * 1.12);
  state.center.copy(center);
  state.fitDistance = distance;
  state.modelRadius = radius;
  state.camera.position.copy(center).addScaledVector(direction, distance);
  state.camera.up.set(0, 1, 0);
  state.camera.near = Math.max(.1, radius / 2000);
  state.camera.far = Math.max(10000, distance + radius * 14);
  state.camera.lookAt(center);
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(center);
  state.controls.minDistance = Math.max(2, radius * .12);
  state.controls.maxDistance = Math.max(distance * 8, radius * 12);
  state.controls.update();

  const groundY = bounds.min.y - maxDim * .035;
  state.ground.position.set(center.x, groundY, center.z);
  state.ground.scale.setScalar(Math.max(1, maxDim / 1800));
  state.grid.position.set(center.x, groundY + .5, center.z);
  state.grid.scale.setScalar(Math.max(.7, maxDim / 1800));
  state.axes.position.set(bounds.min.x - maxDim * .055, bounds.min.y, bounds.min.z - maxDim * .055);
  state.axes.scale.setScalar(maxDim / 1500);

  state.keyLight.position.set(center.x + maxDim * .85, center.y + maxDim * 1.5, center.z + maxDim * 1.1);
  state.fillLight.position.set(center.x - maxDim * 1.1, center.y + maxDim * .35, center.z - maxDim * .9);
  state.rimLight.position.set(center.x, center.y + maxDim * .65, center.z + maxDim * 1.3);
  state.keyLight.target.position.copy(center); state.fillLight.target.position.copy(center); state.rimLight.target.position.copy(center);
  const shadowExtent = maxDim * .9;
  state.keyLight.shadow.camera.left = -shadowExtent; state.keyLight.shadow.camera.right = shadowExtent;
  state.keyLight.shadow.camera.top = shadowExtent; state.keyLight.shadow.camera.bottom = -shadowExtent;
  state.keyLight.shadow.camera.near = .1; state.keyLight.shadow.camera.far = maxDim * 5;
  state.keyLight.shadow.camera.updateProjectionMatrix();
  state.renderer.render(state.scene, state.camera);
}

const Viewer = forwardRef(function Viewer({ id, imported, options, viewCommand, background = 'midnight' }, ref) {
  const mount = useRef(null), gizmo = useRef(null), state = useRef(null), [issue, setIssue] = useState('');

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
      const camera = new THREE.PerspectiveCamera(34, 1, .1, 20000);
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
      const model = imported ? importedGroup(imported, material) : buildPart(id, material, options.explode, options.labels);
      scene.add(model);

      const current = {
        renderer, scene, camera, controls, material, model, modelIsImported: !!imported,
        keyLight, fillLight, rimLight, ground, grid, axes, center: new THREE.Vector3(),
        fitDistance: 1000, modelRadius: 500
      };
      state.current = current;

      function resize() {
        const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
        fitCamera(current, current.model, element); axesGizmo(gizmo.current, camera);
      }
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); resize();
      lossHandler = event => { event.preventDefault(); setIssue('浏览器的 WebGL 图形上下文丢失。请刷新页面，并检查浏览器硬件加速是否开启。'); };
      renderer.domElement.addEventListener('webglcontextlost', lossHandler);
      const animate = () => {
        frame = window.requestAnimationFrame(animate);
        try { controls.update(); renderer.render(scene, camera); axesGizmo(gizmo.current, camera); }
        catch (error) { window.cancelAnimationFrame(frame); frame = null; console.error('[ForgeStudio] 3D render failed:', error); setIssue(`三维渲染失败：${error.message || '未知错误'}`); }
      };
      animate(); setIssue('');
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
      if (current.model) { current.scene.remove(current.model); safeDispose(current.model, current.material, current.modelIsImported); }
      const root = imported ? importedGroup(imported, current.material) : buildPart(id, current.material, options.explode, options.labels);
      current.scene.add(root); current.model = root; current.modelIsImported = !!imported;
      fitCamera(current, root, mount.current); axesGizmo(gizmo.current, current.camera); setIssue('');
    } catch (error) {
      console.error('[ForgeStudio] Model creation failed:', error); setIssue(`模型创建失败：${error.message || '未知错误'}`);
    }
  }, [id, imported, options.explode, options.labels]);

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
    const current = state.current; if (!current) return;
    const name = viewCommand.name;
    if (name === 'zoomIn' || name === 'zoomOut') {
      const factor = name === 'zoomIn' ? .76 : 1.32;
      const direction = current.camera.position.clone().sub(current.controls.target).multiplyScalar(factor);
      current.camera.position.copy(current.controls.target.clone().add(direction));
    } else {
      const endOnX = !imported && id === 'E';
      const directions = {
        iso: [1, .72, 1], front: endOnX ? [1, 0, 0] : [0, 0, 1],
        back: endOnX ? [-1, 0, 0] : [0, 0, -1],
        right: endOnX ? [0, 0, 1] : [1, 0, 0], top: [0, 1, .001]
      };
      const direction = new THREE.Vector3(...(directions[name] || directions.iso)).normalize();
      current.camera.position.copy(current.center).addScaledVector(direction, current.fitDistance);
      current.camera.up.set(0, 1, 0);
      if (name === 'top') current.camera.up.set(0, 0, -1);
      current.controls.target.copy(current.center);
    }
    current.camera.lookAt(current.controls.target); current.camera.updateProjectionMatrix(); current.controls.update();
    axesGizmo(gizmo.current, current.camera);
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
    issue ? React.createElement('div', { className: 'webgl-error', role: 'alert' },
      React.createElement('strong', null, '3D 模型未能渲染'),
      React.createElement('span', null, issue),
      React.createElement('span', null, '建议使用新版 Chrome / Edge，开启硬件加速后刷新。浏览器按 F12 → Console 可查看具体错误。')
    ) : null
  );
});

export default Viewer;
