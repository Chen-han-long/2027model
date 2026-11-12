import React, { useEffect, useRef, useState } from 'react';
import { Activity, Aperture, ArrowDownToLine, ArrowLeft, BadgeCheck, Box, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Code2, Compass, Download, Eye, EyeOff, FileDown, FileText, Github, Image as ImageIcon, Layers, Maximize2, Minimize2, Menu, MessageCircle, Minus, Moon, Palette, Plus, Rotate3D, RotateCcw, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Sun, UploadCloud, WandSparkles, X } from 'lucide-react';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import Viewer from './Viewer';
import { parts,partById,palettes,quickQuestions } from './data';
import { askDeepSeek, DEFAULT_GATEWAY_URL } from './ai';

const initialOptions={color:'#8eabc0',metalness:.18,roughness:.67,light:1.8,opacity:1,shadows:true,grid:true,axes:false,wireframe:false,rotate:false};
const backgrounds={midnight:'深空',slate:'石墨',light:'浅色'};
const getModelName=(imported,part)=>imported?imported.name:part.name;
const drawingUrl=(id,ext)=>`${import.meta.env.BASE_URL}drawings/${id}.${ext}`;

function Switch({checked,onChange,label}) {return <label className="switch-row"><span>{label}</span><button type="button" role="switch" aria-checked={checked} className={`switch ${checked?'active':''}`} onClick={()=>onChange(!checked)}><span/></button></label>}
function Range({label,value,onChange,min,max,step=.01,display}){return <div className="range-block"><div className="range-caption"><span>{label}</span><strong>{display||Math.round(value*100)+'%'}</strong></div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></div>}
function ViewButton({children,active=false,onClick,title}){return <button type="button" className={`view-button ${active?'selected':''}`} onClick={onClick} title={title}>{children}</button>}

export default function App(){
  const [partId,setPartId]=useState('B');
  const [options,setOptions]=useState(initialOptions);
  const [background,setBackground]=useState('midnight');
  const [tab,setTab]=useState('appearance');
  const [viewCommand,setViewCommand]=useState({name:'iso',seq:0});
  const [activeView,setActiveView]=useState('iso');
  const [projection,setProjection]=useState('perspective');
  const [showDrawing,setShowDrawing]=useState(false);
  const [expandedViewer,setExpandedViewer]=useState(false);
  const [compareMode,setCompareMode]=useState(false);
  const [showMobileNav,setShowMobileNav]=useState(false);
  const [showInspector,setShowInspector]=useState(false);
  const [imported,setImported]=useState(null);
  const [dragging,setDragging]=useState(false);
  const [messagesByModel,setMessagesByModel]=useState({});
  const [question,setQuestion]=useState('');
  const [apiKey,setApiKey]=useState(''); // 当前页面内存，不使用本地存储
  const [showKey,setShowKey]=useState(false);
  const [aiMode,setAiMode]=useState('gateway');
  const [gatewayUrl,setGatewayUrl]=useState(()=>{try{return localStorage.getItem('forge-studio-gateway-url')||DEFAULT_GATEWAY_URL;}catch{return DEFAULT_GATEWAY_URL;}});
  const [includeImage,setIncludeImage]=useState(true);
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState('');
  const viewerRef=useRef();const fileInput=useRef();const messagesEnd=useRef();const toastTimer=useRef();
  const part=partById[partId];const chatKey=imported?`import:${imported.name}`:partId;const messages=messagesByModel[chatKey]||[];
  const setOpt=(name,value)=>setOptions(o=>({...o,[name]:value}));
  function notify(txt){setToast(txt);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3800)}
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  useEffect(()=>{messagesEnd.current?.scrollIntoView({behavior:'smooth',block:'end'});},[messages.length,tab,busy]);
  useEffect(()=>{const fn=e=>{if(e.key==='Escape'){setShowDrawing(false);setShowMobileNav(false);setShowInspector(false);setExpandedViewer(false)}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[]);
  const changeView=(name)=>{setActiveView(name);setViewCommand(v=>({name,seq:v.seq+1}));};
  function choosePart(id){setPartId(id);setImported(null);setQuestion('');setOptions(o=>({...o,rotate:false}));changeView('iso');setShowMobileNav(false)}
  async function loadModel(file){
    if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['stl','obj','glb'].includes(ext)){notify('仅支持 .stl、.obj、.glb；PDF 不能直接自动转成精确三维模型。');return}
    if(file.size>50*1024*1024){notify('请导入小于 50MB 的模型文件。');return}
    try{
      let object;
      if(ext==='stl'){
        const buffer=await file.arrayBuffer();const geometry=new STLLoader().parse(buffer);
        geometry.computeVertexNormals();object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
      }else if(ext==='obj'){
        object=new OBJLoader().parse(await file.text());
      }else{
        const buffer=await file.arrayBuffer();object=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',data=>resolve(data.scene),reject));
      }
      setImported({name:file.name,object});changeView('iso');notify(`已导入 ${file.name}`);
    }catch(e){console.error(e);notify('文件解析失败，请检查格式或改用 STL、OBJ、GLB。')}
    if(fileInput.current)fileInput.current.value='';
  }
  function handleDrop(e){e.preventDefault();setDragging(false);loadModel(e.dataTransfer.files?.[0])}
  function exportModel(type){try{if(type==='stl'){viewerRef.current.exportSTL();notify('已导出三维预览 STL；未完成图纸尺寸与公差校验，不可直接加工。')}else{viewerRef.current.screenshot();notify('已导出当前视角 PNG 图片。')}}catch(e){notify(e.message||'操作失败')}}
  async function askAI(txt=question){
    const q=txt.trim();if(!q||busy)return;
    if(!apiKey.trim()){notify('请先在 AI 面板输入 DeepSeek API Key。');return;}
    if(aiMode==='gateway'&&!gatewayUrl.trim()){notify('请先填写 Cloudflare Worker 网关地址（只需设置一次）。');return;}
    const previous=messages;setQuestion('');setTab('ai');setBusy(true);
    let screenshot;
    if(includeImage){try{screenshot=viewerRef.current?.captureForAI()}catch(e){notify('当前画面截图不可用，将使用零件文字信息提问。')}}
    setMessagesByModel(map=>({...map,[chatKey]:[...previous,{role:'user',content:q,withImage:!!screenshot}]}));
    try{
      const answer=await askDeepSeek({key:apiKey,mode:aiMode,gatewayUrl,partId,customModel:imported?.name,question:q,history:previous,screenshot});
      setMessagesByModel(map=>({...map,[chatKey]:[...(map[chatKey]||[]),{role:'assistant',content:answer}]}));
    }catch(e){setMessagesByModel(map=>({...map,[chatKey]:[...(map[chatKey]||[]),{role:'error',content:e.message||'调用失败'}]}));}
    finally{setBusy(false)}
  }
  return <div className={`app app-${background}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false)}} onDrop={handleDrop}>
    <input className="sr-only" ref={fileInput} type="file" accept=".stl,.obj,.glb" onChange={e=>loadModel(e.target.files?.[0])}/>
    <aside className={`left-sidebar ${showMobileNav?'mobile-open':''}`}>
      <div className="brand">
        <div className="brand-logo"><Box size={22} strokeWidth={1.75}/></div>
        <div><div className="brand-title">FORGE <span>STUDIO</span></div><div className="brand-kicker">ENGINEERING VISUAL LAB</div></div>
        <button className="mobile-close icon-btn" onClick={()=>setShowMobileNav(false)}><X size={18}/></button>
      </div>
      <div className="sidebar-section-label"><span>项目工作区</span><span>2027 SERIES</span></div>
      <div className="project-card"><div className="project-icon"><Layers size={19}/></div><div><strong>机械零件三维可视化</strong><span>8 张工程图 · 布尔实体预览</span></div><Check size={15} className="project-check"/></div>
      <div className="parts-title"><span>零件库 <b>08</b></span><span className="parts-sub">PARTS</span></div>
      <div className="part-list">
        {parts.map(p=><button key={p.id} className={`part-item ${p.id===partId&&!imported?'active':''}`} onClick={()=>choosePart(p.id)}>
          <div className="part-image"><img src={drawingUrl(p.id,'png')} alt={`${p.id}件图纸缩略图`} loading="lazy" /></div>
          <div className="part-copy"><div className="part-line"><strong>{p.id}件 · {p.name}</strong>{p.id===partId&&!imported&&<span className="active-dot"/>}</div><span>{p.material} <i>•</i> {p.kind}</span></div>
          <ChevronRight size={15} className="part-chevron"/>
        </button>)}
        {imported&&<div className="imported-item"><UploadCloud size={17}/><span title={imported.name}>{imported.name}</span><button onClick={()=>setImported(null)} aria-label="关闭导入模型"><X size={14}/></button></div>}
      </div>
      <div className="sidebar-bottom"><div className="sidebar-tip"><ShieldCheck size={16}/><span>已改用经实体检查的简化 CAD 网格；部分未标注细节仍需校核。</span></div><button className="import-button" onClick={()=>fileInput.current?.click()}><UploadCloud size={17}/> 导入 3D 模型 <span>STL / OBJ / GLB</span></button></div>
    </aside>
    <main className="main-workspace">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setShowMobileNav(true)}><Menu size={19}/></button><span>项目</span><ChevronRight size={14}/><strong>2027 机械零件库</strong><ChevronRight size={14}/><span className="crumb-last">{imported?'自定义模型':`${part.id}件 · ${part.name}`}</span></div>
        <div className="topbar-right"><span className="saved-status"><span/> GitHub Pages 版</span><span className="topbar-divider"/><a href="https://github.com/new" title="在 GitHub 创建仓库" target="_blank" rel="noreferrer"><Github size={17}/></a><button className="icon-btn mobile-settings" onClick={()=>setShowInspector(v=>!v)} title="打开设置"><Settings2 size={18}/></button></div>
      </header>
      <div className="work-title"><div><div className="eyebrow">3D MODEL VIEWPORT <span className="eyebrow-line"/></div><h1>{getModelName(imported,part)} <span className="name-num">{imported?'IMPORT':`/ ${part.id}–2027`}</span></h1><p>{imported?'用户导入的网格文件 · 单位取决于原文件':`${part.english} · ${part.material} · 图纸外形：${part.dimensions}`}</p></div><div className="title-actions"><button className="small-action" onClick={()=>setShowDrawing(true)}><FileText size={15}/> 对照原图</button><button className="small-action primary" onClick={()=>exportModel('png')}><ImageIcon size={15}/> 导出截图</button></div></div>
      <section className={`viewer-shell ${expandedViewer?'viewer-expanded':''}`}>
        <div className="canvas-area"><Viewer ref={viewerRef} id={partId} imported={imported} options={options} viewCommand={viewCommand} projection={projection} background={background}/></div>
        {compareMode&&!imported&&<div className="drawing-compare" aria-label="原始工程图关键视图对照">
          <div className="drawing-compare-head"><span><FileText size={14}/> 原图关键视图 · {partId} 件</span><button onClick={()=>setCompareMode(false)} title="关闭图纸对照"><X size={15}/></button></div>
          <img src={`${import.meta.env.BASE_URL}drawings/views/${partId}.jpg`} alt={`${partId} 件原始 PDF 局部视图`}/>
          <p>图纸尺寸：{part.dimensions}<br/>局部裁图用于形状校核；三维仍非加工级实体。</p>
        </div>}
        <div className="viewport-top-left"><span className="live-pill"><span/> INTERACTIVE 3D</span><span className="quality-pill">{projection==='perspective'?'透视投影':'正交投影'} · MM</span></div>
        <div className="viewport-top-right"><span className="representation-pill"><CircleHelp size={13}/> {imported?'导入模型 · 原文件单位':`CAD 预览 · mm · ${part.dimensions}`}</span></div>
        <div className="viewport-hint"><Rotate3D size={15}/><span>左键旋转 · 滚轮缩放 · 右键平移 · 点击透视/正交切换</span></div>
        <div className="floating-toolbar"><div className="toolbar-segment"><ViewButton onClick={()=>changeView('iso')} active={activeView==='iso'} title="轴测视角（保留透视投影）"><Box size={17}/></ViewButton><ViewButton onClick={()=>changeView('front')} active={activeView==='front'} title="工程图正视方向">正</ViewButton><ViewButton onClick={()=>changeView('right')} active={activeView==='right'} title="侧视方向">侧</ViewButton><ViewButton onClick={()=>changeView('top')} active={activeView==='top'} title="俯视方向">俯</ViewButton><ViewButton onClick={()=>changeView('back')} active={activeView==='back'} title="背面视角">后</ViewButton><ViewButton onClick={()=>changeView('bottom')} active={activeView==='bottom'} title="仰视方向">底</ViewButton></div><div className="toolbar-divider"/><div className="toolbar-segment"><ViewButton onClick={()=>setProjection('perspective')} active={projection==='perspective'} title="真实透视投影，可随时切换">透视</ViewButton><ViewButton onClick={()=>setProjection('orthographic')} active={projection==='orthographic'} title="正交投影，便于对照工程图">正交</ViewButton></div><div className="toolbar-divider"/><div className="toolbar-segment"><ViewButton onClick={()=>changeView('zoomOut')} title="缩小"><Minus size={16}/></ViewButton><ViewButton onClick={()=>changeView('zoomIn')} title="放大"><Plus size={16}/></ViewButton><ViewButton onClick={()=>setOpt('rotate',!options.rotate)} active={options.rotate} title="自动旋转"><RotateCcw size={16}/></ViewButton></div><div className="toolbar-divider"/><div className="toolbar-segment"><ViewButton onClick={()=>setCompareMode(v=>!v)} active={compareMode} title="显示/隐藏工程图局部对照"><FileText size={16}/></ViewButton><ViewButton onClick={()=>setOpt('wireframe',!options.wireframe)} active={options.wireframe} title="线框模式"><Aperture size={16}/></ViewButton><ViewButton onClick={()=>changeView('fit')} title="按当前方向适配窗口"><Maximize2 size={16}/></ViewButton><ViewButton onClick={()=>setExpandedViewer(v=>!v)} active={expandedViewer} title={expandedViewer?'退出放大':'放大三维窗口'}>{expandedViewer?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</ViewButton></div></div>
      </section>
      <div className="bottom-content"><div className="detail-box"><span className="detail-heading">零件信息 <span>PART OVERVIEW</span></span><div className="meta-line"><div><small>图纸编号</small><strong>2027 - {partId}</strong></div><div><small>标注材料</small><strong>{part.material}</strong></div><div><small>建模类别</small><strong>{imported?'导入模型':part.kind}</strong></div><div><small>图纸尺寸</small><strong>{imported?'原文件单位':part.dimensions}</strong></div></div><p>{imported?'这是你导入的三维网格。实际几何以文件本身为准，网页未对其精度、单位或尺寸进行校验。':part.shape}</p>{!imported&&<p className="dimension-note">{part.note} 屏幕会自动适配窗口大小；这里的 1:1 指模型坐标以毫米计，不代表显示器物理长度。</p>}<div className="feature-tags">{(imported?['自定义网格','自由视角','表面材质']:part.features).map(x=><span key={x}>{x}</span>)}</div></div><div className="mini-preview" onClick={()=>setShowDrawing(true)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setShowDrawing(true)}}><div className="mini-preview-title"><FileText size={15}/> 原始工程图 <Maximize2 size={14}/></div><img src={drawingUrl(partId,'png')} alt={`${partId}件原始机械图纸预览`}/><div>点击放大查看 <ChevronRight size={14}/></div></div></div>
    </main>
    <aside className={`right-sidebar ${showInspector?'mobile-open':''}`}>
      <div className="inspector-head"><div><span className="eyebrow">CONTROL CENTER</span><h2>模型控制台</h2></div><button className="mobile-close icon-btn" onClick={()=>setShowInspector(false)}><X size={18}/></button><Settings2 className="head-icon" size={19}/></div>
      <div className="tab-switch"><button className={tab==='appearance'?'active':''} onClick={()=>setTab('appearance')}><SlidersHorizontal size={16}/> 外观调节</button><button className={tab==='ai'?'active':''} onClick={()=>setTab('ai')}><Sparkles size={16}/> AI 助手</button></div>
      {tab==='appearance' ? <div className="inspector-scroll">
        <div className="section-title"><span>材质和表面</span><span>MATERIAL</span></div>
        <div className="color-title">金属基础色 <span>{options.color.toUpperCase()}</span></div>
        <div className="swatches">{palettes.map(color=><button key={color} style={{backgroundColor:color}} className={options.color===color?'chosen':''} onClick={()=>setOpt('color',color)} aria-label={`切换颜色 ${color}`}>{options.color===color&&<Check size={16}/>}</button>)}<label className="custom-color" title="自定义颜色"><input type="color" value={options.color} onChange={e=>setOpt('color',e.target.value)}/><Palette size={17}/></label></div>
        <Range label="金属度" value={options.metalness} onChange={v=>setOpt('metalness',v)} min={0} max={1}/>
        <Range label="粗糙度" value={options.roughness} onChange={v=>setOpt('roughness',v)} min={.04} max={1}/>
        <Range label="透明程度" value={options.opacity} onChange={v=>setOpt('opacity',v)} min={.2} max={1}/>
        <div className="section-title separated"><span>灯光与环境</span><span>LIGHTING</span></div>
        <Range label="主光源强度" value={options.light} onChange={v=>setOpt('light',v)} min={.2} max={5} step={.1} display={options.light.toFixed(1)+'×'}/>
        <div className="color-title">画布背景</div>
        <div className="background-choices">{Object.entries(backgrounds).map(([id,name])=><button key={id} onClick={()=>setBackground(id)} className={background===id?'selected':''}><span className={`bg-dot bg-${id}`}/>{name}</button>)}</div>
        <Switch label="实时阴影" checked={options.shadows} onChange={v=>setOpt('shadows',v)}/>
        <Switch label="场景网格" checked={options.grid} onChange={v=>setOpt('grid',v)}/>
        <Switch label="显示坐标轴" checked={options.axes} onChange={v=>setOpt('axes',v)}/>
        <div className="section-title separated"><span>视图与结构</span><span>DISPLAY</span></div>
        <div className="projection-panel"><span>投影模式</span><div><button className={projection==='perspective'?'active':''} onClick={()=>setProjection('perspective')}>透视图</button><button className={projection==='orthographic'?'active':''} onClick={()=>setProjection('orthographic')}>正交工程视图</button></div><small>切换投影不改变当前观察方向；可随时返回透视图。与原图对照时建议使用正交。</small></div><Switch label="自动旋转" checked={options.rotate} onChange={v=>setOpt('rotate',v)}/>
        <Switch label="线框模式" checked={options.wireframe} onChange={v=>setOpt('wireframe',v)}/>
        {!imported&&<p className="cad-solid-note">当前展示的是经过 CAD 实体布尔运算的单件预览，不存在可分解的装配子件，因此已移除容易产生误导的“分解”按钮。</p>}
        <button className="reset-button" onClick={()=>{setOptions(initialOptions);setBackground('midnight');changeView('iso')}}><RotateCcw size={15}/> 恢复默认设置</button>
        <button className="download-stl" onClick={()=>exportModel('stl')}><FileDown size={16}/><span>导出示意网格 STL <small>仅供可视化参考，不能直接加工</small></span><ArrowDownToLine size={16}/></button>
      </div> : <div className="chat-layout">
        <div className="ai-intro"><div className="ai-intro-icon"><Sparkles size={18}/></div><div><strong>DeepSeek 工程助手</strong><span>基于当前零件信息回答问题</span></div><span className="model-tag">AI</span></div>
        <div className="chat-list">
          {messages.length===0&&<div className="chat-empty"><div className="chat-empty-icon"><MessageCircle size={25}/></div><h3>关于这个零件，想知道什么？</h3><p>AI 会结合当前选择的零件名称、材料和结构描述回答。开启截图后，AI 也能参考当前视角的图片；但无法从截图推断准确尺寸。</p><div className="quick-questions">{quickQuestions.map(s=><button key={s} onClick={()=>askAI(s)}><Sparkles size={13}/>{s}</button>)}</div></div>}
          {messages.map((message,i)=><div key={i} className={`chat-bubble ${message.role}`}><span className="speaker">{message.role==='user'?'你':message.role==='error'?'连接提示':'DeepSeek'}{message.withImage?' · 已附截图':''}</span><div>{message.content}</div></div>)}
          {busy&&<div className="chat-bubble assistant"><span className="speaker">DeepSeek</span><div className="typing"><i/><i/><i/></div></div>}
          <div ref={messagesEnd}/>
        </div>
        <div className="chat-compose">
          <div className="key-panel">
            <div className="key-panel-head"><span><ShieldCheck size={13}/> 你的 DeepSeek API Key</span><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取 Key ↗</a></div>
            <div className="key-input-row"><input aria-label="DeepSeek API Key" type={showKey?'text':'password'} autoComplete="off" spellCheck="false" placeholder="每次打开页面后输入 sk-..." value={apiKey} onChange={e=>setApiKey(e.target.value)} /><button type="button" onClick={()=>setShowKey(v=>!v)} title={showKey?'隐藏密钥':'显示密钥'} aria-label={showKey?'隐藏密钥':'显示密钥'}>{showKey?<EyeOff size={15}/>:<Eye size={15}/>}</button><button type="button" onClick={()=>setApiKey('')} title="清除密钥" aria-label="清除密钥"><X size={15}/></button></div>
            <div className="key-tip">密钥仅保留在本次打开的网页内存中，刷新后需重新输入；请求时会发送给 DeepSeek（经你选定的网关或直接发送）。</div>
          </div>
          <div className="ai-connect-options">
            <label className="access-code-label">连接方式<select aria-label="AI 连接方式" value={aiMode} onChange={e=>setAiMode(e.target.value)}><option value="gateway">自建 Worker 网关（推荐）</option><option value="direct">浏览器直接连接（可能失败）</option></select></label>
            {aiMode==='gateway'?<label className="access-code-label">Cloudflare Worker 地址（首次设置即可）<input aria-label="Worker 网关地址" type="url" value={gatewayUrl} onChange={e=>{const next=e.target.value;setGatewayUrl(next);try{localStorage.setItem('forge-studio-gateway-url',next)}catch{}}} placeholder="https://你的网关.workers.dev" autoComplete="url" /></label>:<p className="cors-tip">仅供尝试：DeepSeek 若未开放 CORS，浏览器会拦截请求。可靠使用请选择自建 Worker 网关。</p>}
            <Switch label="附带当前三维截图给 AI" checked={includeImage} onChange={setIncludeImage}/>
          </div>
          <form onSubmit={e=>{e.preventDefault();askAI()}}><textarea aria-label="向 DeepSeek 提问" placeholder="例如：这个支座在机械结构中起什么作用？" value={question} maxLength={1500} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askAI()}}} rows={3}/><div className="compose-bottom"><span>Enter 发送 · Shift + Enter 换行</span><button disabled={busy||!question.trim()||!apiKey.trim()} type="submit"><Send size={16}/></button></div></form>
        </div>
      </div>}
      {tab==='appearance'&&<div className="inspector-foot"><Activity size={15}/> WebGL · THREE.JS <span className="foot-dot"/> 交互式预览</div>}
    </aside>
    {dragging&&<div className="drop-overlay"><UploadCloud size={48}/><h2>松开文件，导入三维模型</h2><p>支持 STL / OBJ / GLB，最大 50MB</p></div>}
    {showDrawing&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowDrawing(false)}}><div className="drawing-dialog" role="dialog" aria-modal="true" aria-label="二维工程图预览"><div className="dialog-header"><div><FileText size={19}/><strong>原始二维工程图</strong><span>{partId} 件 · {part.name}</span></div><div><a className="pdf-link" href={drawingUrl(partId,'pdf')} target="_blank" rel="noopener noreferrer"><Download size={15}/> 打开原 PDF</a><button className="icon-btn" onClick={()=>setShowDrawing(false)} aria-label="关闭"><X size={20}/></button></div></div><div className="drawing-image"><img src={drawingUrl(partId,'png')} alt={`${partId} 件完整工程图`} /></div><div className="dialog-note">图纸仅供原图对照；三维预览由可编辑的布尔 CAD 重建，但未标注结构仍有近似，不能直接用于加工。</div></div></div>}
    {toast&&<div className="toast"><BadgeCheck size={16}/>{toast}</div>}
  </div>;
}
