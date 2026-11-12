// Runs in Node after npm install, without a browser or WebGL.
// Validates that all 8 generated meshes are finite and their major dimensions
// are consistent with the engineering drawing's legible envelope dimensions.
import * as THREE from 'three';
import { buildPart, disposePart } from '../src/modelFactory.js';

const checks = {
  A: { axis: 'x', mm: 1640, tolerance: 12 },
  B: { axis: 'x', mm: 375, tolerance: 12 },
  C: { axis: 'x', mm: 600, tolerance: 22 }, // flange adds thickness to centre offset
  D: { axis: 'x', mm: 2104, tolerance: 8 },
  E: { axis: 'x', mm: 2040, tolerance: 5 },
  F: { axis: 'x', mm: 440, tolerance: 5 },
  G: { axis: 'x', mm: 606, tolerance: 12 },
  H: { axis: 'x', mm: 680, tolerance: 8 },
};
const material = new THREE.MeshStandardMaterial({color:0x8eabc0,side:THREE.DoubleSide});
let failures = 0;
for (const [id, check] of Object.entries(checks)) {
  try {
    const root = buildPart(id, material, 0, false);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    let meshes = 0, triangles = 0;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      const arr = geo?.getAttribute('position')?.array;
      if (!arr?.length) throw new Error('Empty geometry');
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error('NaN/Infinity in vertices');
      triangles += (geo.index?.count ?? arr.length / 3) / 3;
    });
    const extent = size[check.axis];
    const error = 100 * Math.abs(extent - check.mm) / check.mm;
    if (!meshes || !triangles || error > check.tolerance || size.x <= 0 || size.y <= 0 || size.z <= 0)
      throw new Error(`Envelope mismatch: ${extent.toFixed(1)} mm vs ${check.mm} mm; ${error.toFixed(1)}%`);
    console.log(`${id}: OK | ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm | ${meshes} meshes | ${Math.round(triangles)} triangles`);
    disposePart(root, material);
  } catch (error) {
    failures++;
    console.error(`${id}: FAIL | ${error?.stack || error}`);
  }
}
material.dispose();
if (failures) process.exit(1);
