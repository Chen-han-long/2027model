import assert from 'node:assert/strict';
import proxy from '../worker/deepseek-proxy.js';
const origin='https://YOUR-USERNAME.github.io';
const base='https://sample.example.workers.dev';
const options={method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}};
let r=await proxy.fetch(new Request(base,options));
assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
r=await proxy.fetch(new Request(base,{method:'POST',headers:{Origin:'https://evil.example','Authorization':'Bearer sk-fake','Content-Type':'application/json'},body:'{}'}));
assert.equal(r.status,403);
r=await proxy.fetch(new Request(base,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}));
assert.equal(r.status,401);
const saveFetch=globalThis.fetch;
let upstreamInfo;
globalThis.fetch=async(url,opts)=>{upstreamInfo={url,auth:opts.headers.Authorization,body:JSON.parse(opts.body)};return new Response(JSON.stringify({choices:[{message:{content:'回答成功'}}]}),{status:200,headers:{'Content-Type':'application/json'}});};
try{
  r=await proxy.fetch(new Request(base,{method:'POST',headers:{Origin:origin,Authorization:'Bearer sk-test-value','Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'你好'}]})}));
  assert.equal(r.status,200);assert.equal((await r.json()).choices[0].message.content,'回答成功');
  assert.equal(upstreamInfo.url,'https://api.deepseek.com/chat/completions');
  assert.equal(upstreamInfo.auth,'Bearer sk-test-value');
  assert.equal(upstreamInfo.body.model,'deepseek-flash');
}finally{globalThis.fetch=saveFetch;}
console.log('Worker simulated request tests passed.');
