/*
 * BRFX — Blockbench Render FX
 * Restore System Fix + Collapsible Settings Pass v1.0.4
 * MIT License — see LICENSE
 */
Plugin.register('brfx',{title:'BRFX — Render FX',author:'Yama Sung',icon:'auto_awesome',version:'1.0.4',variant:'both',min_version:'4.10.0',tags:['Rendering','Tools'],onload(){
 const old=id=>typeof id==='string'&&id.indexOf('brfx_')===0;
 const clean=a=>{if(!Array.isArray(a))return;for(let i=a.length-1;i>=0;i--){const x=a[i];if((typeof x==='string'&&old(x))||(x&&old(x.id))){a.splice(i,1);try{x&&x.delete&&x.delete()}catch(e){};continue}if(x&&Array.isArray(x.children))clean(x.children)}};
 if(typeof MenuBar!=='undefined'&&MenuBar.menus)Object.values(MenuBar.menus).forEach(m=>{try{if(m&&Array.isArray(m.structure))clean(m.structure)}catch(e){}});
 if(typeof BarItems!=='undefined')Object.keys(BarItems).forEach(id=>{if(old(id))try{BarItems[id]&&BarItems[id].delete&&BarItems[id].delete()}catch(e){}});
 const url='https://raw.githubusercontent.com/yamasung7-dot/BRFX/375041201b708725be9fbaa6e6059bca196ddf2b/brfx.js';
 const enhance=d=>{if(!d||d._brfxSections)return false;const groups=[['Lighting',['lightType','lightColor','lightSide','lightIntensity','environmentIntensity','environmentDistance','indirect','quality']],['Skybox',['skyEnabled','skyMode','skyImageUrl','skyRotation','skyTop','skyTopWeight','skyHorizon','skyHorizonWeight','skyBottom','skyBottomWeight']],['Atmosphere',['fogEnabled','fogColor','fogNear','fogFar']],['Rendering',['exposure','contrast']]];let made=0;groups.forEach(([title,ids])=>{const bars=ids.map(id=>{try{const b=d.getFormBar(id);return b&&b.length?b[0]:null}catch(e){return null}}).filter(Boolean);if(!bars.length)return;const header=document.createElement('button');header.type='button';header.className='brfx-section-header';header.textContent='▾ '+title;header.style.cssText='display:block;width:100%;text-align:left;margin:8px 0 4px;padding:8px 10px;border:0;border-radius:4px;background:var(--color-back);color:var(--color-text);font-weight:600;cursor:pointer;';bars[0].parentNode.insertBefore(header,bars[0]);let collapsed=false;header.addEventListener('click',()=>{collapsed=!collapsed;header.textContent=(collapsed?'▸ ':'▾ ')+title;bars.forEach(bar=>bar.classList.toggle('brfx-section-hidden',collapsed));});made++});if(made){d._brfxSections=true;let style=document.getElementById('brfx-section-style');if(!style){style=document.createElement('style');style.id='brfx-section-style';style.textContent='.brfx-section-hidden{display:none!important}.brfx-section-header:focus{outline:1px solid var(--color-accent)}';document.head.appendChild(style)}}return made>0};
 const robustRestore=core=>{try{if(core.lightSyncTimer)clearInterval(core.lightSyncTimer);core.lightSyncTimer=null}catch(e){};
  try{if(core.sceneLights)core.sceneLights.forEach(light=>{try{if(light&&light.parent)light.parent.remove(light)}catch(e){}});core.sceneLights=[]}catch(e){}
  try{if(core.ambientLight&&core.ambientLight.parent)core.ambientLight.parent.remove(core.ambientLight);core.ambientLight=null}catch(e){}
  try{if(core.lightBillboard)core.lightBillboard.remove();core.lightBillboard=null}catch(e){}
  try{if(typeof Outliner!=='undefined'&&Array.isArray(Outliner.elements))Outliner.elements.slice().forEach(el=>{if(el&&typeof el.name==='string'&&el.name.indexOf('BRFX Light Source')===0)try{el.remove()}catch(e){}})}catch(e){}
  const s=typeof core.getScene==='function'?core.getScene():null;
  if(s){const removeNamed=o=>{if(!o)return;try{if(typeof o.name==='string'&&o.name.indexOf('BRFX_')===0){if(o.parent)o.parent.remove(o);return}}catch(e){};if(o.children&&o.children.length)o.children.slice().forEach(removeNamed)};try{s.children.slice().forEach(removeNamed)}catch(e){};try{if(core.originalSceneFog!==undefined)s.fog=core.originalSceneFog||null}catch(e){}}
  core.skyDome=null;core.skyTexture=null;
  try{if(typeof Canvas!=='undefined'&&Canvas&&core.originalLightColor){Canvas.global_light_color.copy(core.originalLightColor);Canvas.global_light_side=core.originalLightSide}}catch(e){}
  try{if(typeof Sun!=='undefined'&&Sun){if(core.originalLightColor)Sun.color.copy(core.originalLightColor);if(core.originalSunIntensity!==null&&core.originalSunIntensity!==undefined)Sun.intensity=core.originalSunIntensity}}catch(e){}
  try{if(core.customDialog)core.customDialog.hide()}catch(e){}
  try{if(typeof Canvas!=='undefined'&&typeof Canvas.updateAllFaces==='function')Canvas.updateAllFaces()}catch(e){}
  try{if(typeof Preview!=='undefined'&&Preview.selected&&typeof Preview.selected.render==='function')Preview.selected.render()}catch(e){}
  try{Blockbench.showQuickMessage('BRFX: Lighting, skybox, atmosphere and BRFX controls restored',2500)}catch(e){}
 };
 const run=src=>{try{const m=src.match(/Plugin\.register\(['"]brfx['"]\s*,\s*(\{[\s\S]*\})\s*\);?\s*$/);if(!m)throw Error('BRFX core parse failed');const core=new Function('return '+m[1])();if(core.onload)core.onload.call(core);const originalUnload=core.onunload;core.onunload=function(fromRestore=false){if(fromRestore){robustRestore(core);return}if(typeof originalUnload==='function')return originalUnload.call(core,false)};this._core=core;const original=core.openSettings||core.openCustomLight;if(typeof original==='function'){core.openSettings=original;core.openCustomLight=original;core.openSettings=function(){const result=original.apply(core,arguments);let tries=0;const wait=()=>{const d=core.customDialog||((typeof Dialog!=='undefined')?Dialog.open:null);if(enhance(d)||tries++>12)return;setTimeout(wait,80)};setTimeout(wait,0);return result};core.openCustomLight=core.openSettings}}
 catch(e){console.error('BRFX core load failed',e);Blockbench.showQuickMessage('BRFX: core load failed',3000)}};
 if(typeof fetch==='function')fetch(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()}).then(run).catch(e=>{console.error(e);Blockbench.showQuickMessage('BRFX: could not load core',3000)});else if(typeof $!=='undefined'&&typeof $.ajax==='function')$.ajax({url,success:run,error:()=>Blockbench.showQuickMessage('BRFX: could not load core',3000)})
},onunload(){try{this._core&&this._core.onunload&&this._core.onunload.call(this._core,false)}catch(e){}}});
