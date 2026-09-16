Plugin.register('brfx', {
 title:'BRFX — Render FX', author:'Yama Sung', icon:'auto_awesome', version:'1.0.2', variant:'both', min_version:'4.10.0', tags:['Rendering','Tools'],
 onload(){
  const oldIds=id=>typeof id==='string'&&id.indexOf('brfx_')===0;
  const clean=list=>{if(!Array.isArray(list))return;for(let i=list.length-1;i>=0;i--){let x=list[i];if(typeof x==='string'&&oldIds(x)||x&&oldIds(x.id)){list.splice(i,1);try{x&&x.delete&&x.delete()}catch(e){};continue}if(x&&Array.isArray(x.children))clean(x.children)}};
  if(typeof MenuBar!=='undefined'&&MenuBar.menus)Object.values(MenuBar.menus).forEach(m=>{try{if(m&&Array.isArray(m.structure))clean(m.structure)}catch(e){}});
  if(typeof BarItems!=='undefined')Object.keys(BarItems).forEach(id=>{if(oldIds(id))try{BarItems[id]&&BarItems[id].delete&&BarItems[id].delete()}catch(e){}});
  const url='https://raw.githubusercontent.com/yamasung7-dot/BRFX/375041201b708725be9fbaa6e6059bca196ddf2/brfx.js';
  const run=src=>{try{const m=src.match(/Plugin\.register\(['"]brfx['"]\s*,\s*(\{[\s\S]*\})\s*\);?\s*$/);if(!m)throw Error('BRFX core parse failed');const factory=new Function('return '+m[1]);const core=factory();if(core.onload)core.onload.call(this);this._core=core}catch(e){console.error('BRFX core load failed',e);Blockbench.showQuickMessage('BRFX: core load failed',3000)}};
  if(typeof fetch==='function')fetch(url).then(r=>r.text()).then(run).catch(e=>{console.error(e);Blockbench.showQuickMessage('BRFX: could not load core',3000)});
  else if(typeof $.ajax==='function')$.ajax({url,success:run,error:()=>Blockbench.showQuickMessage('BRFX: could not load core',3000)});
 },
 onunload(){try{this._core&&this._core.onunload&&this._core.onunload.call(this._core)}catch(e){}}
});
