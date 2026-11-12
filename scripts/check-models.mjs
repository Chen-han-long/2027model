// CI validation of all shipped glTF binary solids. Requires no browser and no
// Python/CadQuery at deployment time (GLBs are committed as generated assets).
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const base=resolve('public/models');
const manifest=JSON.parse(readFileSync(join(base,'validation.json'),'utf8'));
const expected='ABCDEFGH'.split('');
// The hole catalog also ships with the site. It explicitly distinguishes
// drawing readouts from approximate feature placements.
const holeCatalog=JSON.parse(readFileSync(resolve('src/holeCatalog.json'),'utf8'));
assert.deepEqual(Object.keys(holeCatalog).sort(),expected);
for(const id of expected){
  for(const h of holeCatalog[id]){
    assert(typeof h.name==='string'&&typeof h.model==='string',id+' bad hole catalog label');
    assert(['drawing','inferred'].includes(h.confidence),id+' missing confidence');
    assert(Array.isArray(h.center)&&h.center.length===3&&h.center.every(Number.isFinite),id+' invalid hole target');
    assert(Array.isArray(h.normal)&&h.normal.length===3&&h.normal.every(Number.isFinite),id+' invalid hole normal');
    assert(h.radius>0&&h.count>=1,id+' invalid hole dimensions');
  }
}

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
  const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives||[]);
  const positions=primitives.map(p=>gltf.accessors[p.attributes.POSITION]);
  assert(positions.length,`${name} 没有顶点属性`);
  const binStart=20+jsonLength+8;
  for(let i=0;i<primitives.length;i++){
    const pos=positions[i],primitive=primitives[i];
    assert(pos && pos.count>=3,`${name} 顶点数不足`);
    assert(pos.min?.length===3 && pos.max?.length===3,`${name} 缺少包围盒`);
    assert(pos.min.every(Number.isFinite)&&pos.max.every(Number.isFinite),`${name} 顶点包含非有限坐标`);
    // Bug fixed in v2.0.1: previous GLB exports had POSITION but no NORMAL.
    // Without NORMAL, THREE.MeshPhysicalMaterial can render a black silhouette.
    assert(Number.isInteger(primitive.attributes.NORMAL),
      `${name} 缺少 NORMAL 法线属性（会导致模型显示黑色）。请重新导出 GLB。`);
    const normal=gltf.accessors[primitive.attributes.NORMAL];
    assert(normal?.type==='VEC3'&&normal.componentType===5126 && normal.count===pos.count,
      `${name} 法线数据格式或顶点数量不正确`);
    const view=gltf.bufferViews[normal.bufferView];
    assert(view && (view.buffer??0)===0,`${name} 法线缓冲区缺失`);
    const stride=view.byteStride??12;
    for(const idx of [0,Math.floor(normal.count/2),normal.count-1]){
      const offset=binStart+(view.byteOffset??0)+(normal.byteOffset??0)+idx*stride;
      assert(offset+12<=buf.length,`${name} 法线数据越界`);
      const x=buf.readFloatLE(offset),y=buf.readFloatLE(offset+4),z=buf.readFloatLE(offset+8);
      const len=Math.hypot(x,y,z);
      assert(Number.isFinite(len)&&len>.9&&len<1.1,`${name} 法线无效：${len}`);
    }
  }
  const m=manifest.find(x=>x.part===name);
  assert.equal(m.cad_valid,true,`${name} 原始 CAD 未通过校验`);
  assert.equal(m.watertight_glb,true,`${name} 仍然存在非水密网格`);
  assert.equal(m.solids,1,`${name} 存在游离 CAD 实体`);
  assert.equal(m.sharp_normals_degrees,36,`${name} 并非硬边法线版本，请上传 2.4 模型`);
  assert(m.triangles>200,`${name} 三角形数量异常`);
  const ext=m.bounds_mm.map(pair=>pair[1]-pair[0]);
  assert(ext.every(x=>Number.isFinite(x)&&x>40&&x<5000),`${name} 包围尺寸异常: ${ext}`);
  console.log(`${name}: valid GLB | ${m.triangles.toLocaleString()} triangles | ${ext.map(x=>Math.round(x)).join(' × ')} mm`);
}
console.log('全部 8 件 CAD 几何文件已通过发布前完整性检查。');
