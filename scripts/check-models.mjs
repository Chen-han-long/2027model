// CI validation of all shipped glTF binary solids. Requires no browser and no
// Python/CadQuery at deployment time (GLBs are committed as generated assets).
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const base=resolve('public/models');
const manifest=JSON.parse(readFileSync(join(base,'validation.json'),'utf8'));
const expected='ABCDEFGH'.split('');
assert.deepEqual(manifest.map(x=>x.part).sort(),expected);
for(const name of expected){
  const file=join(base,`${name}.glb`);
  assert(existsSync(file),`缺少零件文件: ${file}`);
  const buf=readFileSync(file);
  assert(buf.length>1000,`${name} GLB 过小`);
  assert.equal(buf.toString('utf8',0,4),'glTF',`${name} GLB 文件头异常`);
  assert.equal(buf.readUInt32LE(4),2,`${name} 不是 GLB v2`);
  assert.equal(buf.readUInt32LE(8),buf.length,`${name} GLB 长度不匹配`);
  const jsonLength=buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii',16,20),'JSON',`${name} 缺少 JSON 块`);
  const gltf=JSON.parse(buf.toString('utf8',20,20+jsonLength));
  assert((gltf.meshes||[]).length>0,`${name} 没有网格`);
  assert((gltf.accessors||[]).length>0,`${name} 没有顶点数据`);
  const positions=gltf.meshes.flatMap(mesh=>mesh.primitives||[]).map(p=>gltf.accessors[p.attributes.POSITION]);
  assert(positions.length,`${name} 没有顶点属性`);
  for(const a of positions){
    assert(a && a.count>=3,`${name} 顶点数不足`);
    assert(a.min?.length===3 && a.max?.length===3,`${name} 缺少包围盒`);
    assert(a.min.every(Number.isFinite)&&a.max.every(Number.isFinite),`${name} 顶点包含非有限坐标`);
  }
  const m=manifest.find(x=>x.part===name);
  assert.equal(m.cad_valid,true,`${name} 原始 CAD 未通过校验`);
  assert.equal(m.watertight_glb,true,`${name} 仍然存在非水密网格`);
  assert.equal(m.solids,1,`${name} 存在游离 CAD 实体`);
  assert(m.triangles>200,`${name} 三角形数量异常`);
  const ext=m.bounds_mm.map(pair=>pair[1]-pair[0]);
  assert(ext.every(x=>Number.isFinite(x)&&x>40&&x<5000),`${name} 包围尺寸异常: ${ext}`);
  console.log(`${name}: valid GLB | ${m.triangles.toLocaleString()} triangles | ${ext.map(x=>Math.round(x)).join(' × ')} mm`);
}
console.log('全部 8 件 CAD 几何文件已通过发布前完整性检查。');
