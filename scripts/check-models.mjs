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
  H: { axis: 'z', mm: 680, tolerance: 8 },
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
    if(id==='H'){
      const stages=root.userData.detailStages||[];
      if(stages.length<7||stages.some(s=>!s.ok))
        throw new Error('H housing feature stages did not all complete: '+JSON.stringify(stages));
      // Axial bearing bore must be empty, not a painted circle.
      const testRay=(point,direction,filter=()=>true)=>{
        const raycaster=new THREE.Raycaster(new THREE.Vector3(...point),new THREE.Vector3(...direction));
        return raycaster.intersectObject(root,true).filter(hit=>filter(hit.point));
      };
      if(testRay([0,552,500],[0,0,-1]).length)
        throw new Error('H main Ø540 flange bore is occluded by a false solid');
      // Front three-hole mounting plate must actually be open.
      for(const x of [-137,0,137])
        if(testRay([x,168,500],[0,0,-1],p=>p.z>250).length)
          throw new Error(`H three-port connection at x=${x} is not truly pierced`);
      // The roof inspection port must pass into the cylinder chamber.
      if(testRay([0,1000,0],[0,-1,0],p=>p.y>700).length)
        throw new Error('H top inspection connection is covered by barrel/roof');
    }
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
