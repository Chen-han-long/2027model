export const parts = [
  { id:'A', name:'工作台支座', english:'Rotary Worktable Support', material:'QT600-3', kind:'环形支撑构件', shape:'大型同轴环形支承、中央通孔、周向筋板与分布式紧固位置。', note:'根据多视图绘制的外形示意；圆环、筋板和孔位均非精确尺寸。', features:['中心通孔','环形法兰','放射状筋板','周向连接点'] },
  { id:'B', name:'主轴箱', english:'Spindle Housing', material:'QT400-18', kind:'主轴支承箱体', shape:'斜支撑连接高位圆筒形轴承座、板状底座及侧向加强筋。', note:'突出主轴孔、斜侧壁和底部安装面的示意模型。', features:['主轴安装孔','斜支撑侧板','安装底座','加强筋'] },
  { id:'C', name:'窥视连管', english:'Inspection Elbow Pipe', material:'ZG230-450', kind:'弯曲连通管件', shape:'带转向弯管、端部连接法兰及环状边缘的通道。', note:'弯管轮廓与法兰为示意几何，不代表实际流道壁厚。', features:['弯曲管道','入口法兰','出口法兰','过渡圆角'] },
  { id:'D', name:'举升梁左部支座', english:'Left Lifting Beam Support', material:'ASTM A487 4B', kind:'双孔异形支座', shape:'带大小两处圆孔的铸造支座、翼板与曲面连接结构。', note:'借鉴图中大小孔及异形翼板轮廓构造；尚未依据 CAD 曲面精确重建。', features:['主支承孔','辅助连接孔','异形翼板','加强过渡区'] },
  { id:'E', name:'后轴承箱盖', english:'Rear Bearing Housing Cover', material:'HT250', kind:'半环形箱盖', shape:'沿轴承圆周展开的弧形罩壳、分型底面与连接螺栓位置。', note:'简化为半圆罩和安装凸缘，不作为密封面加工依据。', features:['半圆罩壳','安装平面','螺栓分布','局部加强边'] },
  { id:'F', name:'支架', english:'Support Bracket', material:'QT600', kind:'弧形机械支架', shape:'跨越开口的弧形支架、上部定位孔座及下部支撑脚。', note:'保留主要拱形外观；孔径、跨距、细部尚未尺寸约束。', features:['弧形梁','左右安装台','中心定位座','侧筋'] },
  { id:'G', name:'舱体', english:'Main Enclosure', material:'ZL101A', kind:'箱体壳件', shape:'带大型中央圆口的近方形舱体、上下框架与外部加强结构。', note:'根据多个正投影视图和剖面整理的箱体示意。', features:['主圆孔','舱体框架','外部加强筋','连接孔位'] },
  { id:'H', name:'壳体', english:'Outer Housing', material:'ZL101A', kind:'圆筒式壳体', shape:'方形安装框架内的环状壳体、四角安装点和外部肋板。', note:'用简化封闭轮廓表达壳体外形，内部复杂流道未精确建模。', features:['中心筒体','方形框架','四角安装点','外部肋板'] },
];
export const partById = Object.fromEntries(parts.map((part) => [part.id, part]));
export const palettes = ['#8eabc0','#bfc6d2','#9bafac','#d7a26d','#7385ad','#9a9da2','#77b5c9','#b78b8a'];
export const quickQuestions = ['这个零件的主要作用是什么？','哪些部位可能是安装面？','图纸和三维示意模型有什么差别？'];
