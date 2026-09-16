/* BRFX — Blockbench Render FX
 * Feature Manager Menu Pass v1.4.2
 * MIT License — see LICENSE
 */
Plugin.register('brfx',{title:'BRFX — Render FX',author:'Yama Sung',icon:'auto_awesome',version:'1.4.2',variant:'both',min_version:'4.10.0',tags:['Rendering','Tools'],onload(){
 const plugin=this;
 plugin._core=null;plugin._manager=null;
 plugin.featureVisibility={lighting:true,skybox:true,atmosphere:true,rendering:true};
 const coreUrl='https://raw.githubusercontent.com/yamasung7-dot/BRFX/638b0e2d6673c93153136d1f660b193c185b0b1d/brfx.js';
 const loadState=()=>{try{const v=JSON.parse(localStorage.getItem('brfx_feature_visibility')||'null');if(v)for(const k in plugin.featureVisibility)if(typeof v[k]==='boolean')plugin.featureVisibility[k]=v[k]}catch(e){}};
 const saveState=()=>{try{localStorage.setItem('brfx_feature_visibility',JSON.stringify(plugin.featureVisibility))}catch(e){}};loadState();
 const idOf=x=>typeof x==='string'?x:x?.id||x?.action?.id||'';
 const isBRFX=id=>String(id||'').startsWith('brfx_');
 const category=id=>{id=String(id||'').toLowerCase();if(/sky/.test(id))return'skybox';if(/fog|atmosphere|exposure|contrast|rotation/.test(id))return'atmosphere';if(/outline|toon|bloom|ambient.?occlusion|ao/.test(id))return'rendering';return'lighting'};
 const actions=()=>{const out=[];try{if(typeof BarItems==='undefined')return out;for(const id of Object.keys(BarItems)){if(isBRFX(id)&&!['brfx_feature_manager','brfx_feature_manager_item'].includes(id)&&BarItems[id])out.push(BarItems[id])}}catch(e){}return out};
 const clean=()=>{try{const tools=MenuBar?.menus?.tools;if(!tools||!Array.isArray(tools.structure))return;tools.structure=tools.structure.filter(x=>{const id=idOf(x);return id!=='brfx_menu'&&!isBRFX(id)});tools.update?.(true)}catch(e){}};
 const openManager=()=>{try{const form={lighting:{label:'Lighting Features',type:'checkbox',value:plugin.featureVisibility.lighting},skybox:{label:'Skybox Features',type:'checkbox',value:plugin.featureVisibility.skybox},atmosphere:{label:'Atmosphere Features',type:'checkbox',value:plugin.featureVisibility.atmosphere},rendering:{label:'Rendering Features',type:'checkbox',value:plugin.featureVisibility.rendering}};new Dialog({id:'brfx_feature_manager_142',title:'BRFX — Feature Manager',form,onConfirm(f){for(const k in plugin.featureVisibility)plugin.featureVisibility[k]=!!f[k];saveState();buildMenu();Blockbench.showQuickMessage('BRFX feature visibility updated',1400)}}).show()}catch(e){console.error('BRFX manager failed',e)}};
 const buildMenu=()=>{try{clean();const tools=MenuBar?.menus?.tools;if(!tools||!Array.isArray(tools.structure))return;const menuAction=new Action('brfx_menu',{name:'BRFX',icon:'auto_awesome',click:openManager});tools.structure.push(menuAction);tools.update?.(true)}catch(e){console.error('BRFX menu build failed',e)}};
 const waitForCoreActions=()=>{let n=0;const timer=setInterval(()=>{n++;buildMenu();if(n>=40)clearInterval(timer)},150);plugin._menuTimer=timer};
 const runCore=src=>{try{const start=src.indexOf("Plugin.register('brfx'");const alt=src.indexOf('Plugin.register(\"brfx\"');const at=start>=0?start:alt;if(at<0)throw Error('core registration not found');const open=src.indexOf('{',at),end=src.lastIndexOf('});');if(open<0||end<open)throw Error('core bounds not found');const core=new Function('return '+src.slice(open,end+1))();core.onload?.call(core);plugin._core=core;buildMenu();waitForCoreActions();Blockbench.showQuickMessage('BRFX 1.4.2 loaded',1500)}catch(e){console.error('BRFX core load failed',e);Blockbench.showQuickMessage('BRFX: core load failed — '+(e?.message||e),3500)}};
 const fail=e=>{console.error('BRFX core fetch failed',e);Blockbench.showQuickMessage('BRFX: could not load core',3500)};
 const ajax=()=>{try{if(typeof $!=='undefined'&&typeof $.ajax==='function'){$.ajax({url:coreUrl+'?brfx=1.4.2',cache:false,dataType:'text',success:runCore,error:(x,s,e)=>fail(e||s)});return true}}catch(e){fail(e)}return false};
 try{if(typeof fetch==='function'){const timeout=new Promise((_,r)=>setTimeout(()=>r(Error('fetch timeout')),8000));Promise.race([fetch(coreUrl+'?brfx=1.4.2',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()}),timeout]).then(runCore).catch(e=>{if(!ajax())fail(e)})}else if(!ajax())fail(Error('no network loader'))}catch(e){if(!ajax())fail(e)}
 },onunload(){try{clearInterval(this._menuTimer);this._manager?.delete?.();this._core?.onunload?.call(this._core,false);clean()}catch(e){}}});