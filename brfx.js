/* 
 * BRFX — Blockbench Render FX
 * Proper Silhouette Outlines Pass v1.3.0
 * MIT License — see LICENSE
 */
Plugin.register('brfx',{title:'BRFX — Render FX',author:'Yama Sung',icon:'auto_awesome',version:'1.3.0',variant:'both',min_version:'4.10.0',tags:['Rendering','Tools'],onload(){
 const plugin=this;
 plugin.outlineEnabled=false;
 plugin.outlineColor='#17131b';
 plugin.outlineThickness=0.08;
 plugin.outlineGroup=null;
 plugin.outlineSyncTimer=null;
 plugin.outlineMaterials=[];
 const cleanActions=()=>{try{if(typeof BarItems!=='undefined')Object.keys(BarItems).forEach(id=>{if(typeof id==='string'&&id.indexOf('brfx_outline_')===0)try{BarItems[id]&&BarItems[id].delete&&BarItems[id].delete()}catch(e){}})}catch(e){}};
 cleanActions();
 const removeOutlines=()=>{
   try{if(plugin.outlineSyncTimer)clearInterval(plugin.outlineSyncTimer)}catch(e){}
   plugin.outlineSyncTimer=null;
   try{if(plugin.outlineGroup&&plugin.outlineGroup.parent)plugin.outlineGroup.parent.remove(plugin.outlineGroup)}catch(e){}
   plugin.outlineGroup=null;
   plugin.outlineMaterials.forEach(m=>{try{m.dispose&&m.dispose()}catch(e){}});
   plugin.outlineMaterials=[];
 };
 const getScene=()=>{try{if(typeof scene!=='undefined'&&scene)return scene}catch(e){}try{if(typeof window!=='undefined'&&window.scene)return window.scene}catch(e){}return null};
 const isModelMesh=o=>{
   if(!o||!o.isMesh||!o.geometry)return false;
   if(o.name&&String(o.name).indexOf('BRFX_')===0)return false;
   if(o.isGridHelper||o.isAxesHelper||o.isLine||o.isLineSegments)return false;
   if(o.type==='GridHelper'||o.type==='AxesHelper')return false;
   return true;
 };
 const makeMaterial=()=>{
   const material=new THREE.MeshBasicMaterial({color:plugin.outlineColor,side:THREE.BackSide,depthWrite:false,depthTest:true,transparent:false});
   material.onBeforeCompile=shader=>{
     shader.uniforms.brfxOutlineThickness={value:Number(plugin.outlineThickness)||0.08};
     shader.vertexShader='uniform float brfxOutlineThickness;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','transformed += objectNormal * brfxOutlineThickness;\n#include <project_vertex>');
     material.userData.brfxShader=shader;
   };
   material.needsUpdate=true;
   plugin.outlineMaterials.push(material);
   return material;
 };
 const buildOutlines=()=>{
   removeOutlines();
   if(!plugin.outlineEnabled)return;
   const s=getScene();
   if(!s||typeof THREE==='undefined')return;
   plugin.outlineGroup=new THREE.Group();
   plugin.outlineGroup.name='BRFX_Silhouette_Outlines';
   plugin.outlineGroup.renderOrder=-10;
   const sources=[];
   try{s.traverse(o=>{if(isModelMesh(o))sources.push(o)})}catch(e){}
   sources.forEach((source,i)=>{
     try{
       const material=makeMaterial();
       const outline=new THREE.Mesh(source.geometry,material);
       outline.name='BRFX_Outline_'+i;
       outline.frustumCulled=false;
       outline.matrixAutoUpdate=false;
       outline.renderOrder=-10;
       outline.userData.brfxSource=source;
       outline.matrix.copy(source.matrixWorld);
       outline.visible=source.visible!==false;
       plugin.outlineGroup.add(outline);
     }catch(e){console.warn('BRFX outline mesh failed',e)}
   });
   if(plugin.outlineGroup.children.length)s.add(plugin.outlineGroup);
   plugin.outlineSyncTimer=setInterval(()=>{
     if(!plugin.outlineEnabled||plugin._core&&plugin._core.brfxEnabled===false){if(plugin.outlineGroup)removeOutlines();return}
     if(!plugin.outlineGroup)return;
     plugin.outlineGroup.children.forEach(o=>{
       const src=o.userData&&o.userData.brfxSource;
       if(!src)return;
       try{src.updateMatrixWorld(true);o.matrix.copy(src.matrixWorld);o.visible=src.visible!==false}catch(e){}
     });
   },50);
 };
 const updateOutlines=()=>{
   if(plugin._core&&plugin._core.brfxEnabled===false){removeOutlines();return}
   if(plugin.outlineEnabled)buildOutlines();else removeOutlines();
 };
 const openOutlineSettings=()=>{
   try{
     if(plugin.outlineDialog){plugin.outlineDialog.show();return}
     plugin.outlineDialog=new Dialog({
       id:'brfx_outline_settings',
       title:'BRFX — Silhouette Outlines',
       form:{
         enabled:{label:'Enable Silhouette Outlines',type:'checkbox',value:plugin.outlineEnabled},
         color:{label:'Outline Color',type:'color',value:plugin.outlineColor},
         thickness:{label:'Outline Thickness',type:'number',value:plugin.outlineThickness,min:0.01,max:0.5,step:0.01}
       },
       onConfirm(form){
         plugin.outlineEnabled=!!form.enabled;
         plugin.outlineColor=(form.color&&typeof form.color.toHexString==='function')?form.color.toHexString():String(form.color||plugin.outlineColor);
         plugin.outlineThickness=Math.max(0.01,Math.min(0.5,Number(form.thickness)||0.08));
         updateOutlines();
         try{if(typeof Preview!=='undefined'&&Preview.all)Preview.all.forEach(p=>{try{p&&p.render&&p.render()}catch(e){}})}catch(e){}
         try{Blockbench.showQuickMessage(plugin.outlineEnabled?'BRFX: Silhouette outlines enabled':'BRFX: Silhouette outlines disabled',1800)}catch(e){}
       }
     });
     plugin.outlineDialog.show();
   }catch(e){console.error(e);try{Blockbench.showQuickMessage('BRFX: outline settings failed',2500)}catch(x){}}
 };
 const addOutlineAction=()=>{
   try{
     const action=new Action('brfx_outline_settings',{name:'BRFX — Silhouette Outlines',icon:'border_outer',click:openOutlineSettings});
     if(typeof MenuBar!=='undefined'&&MenuBar.menus&&MenuBar.menus.tools)MenuBar.menus.tools.addAction(action);
   }catch(e){}
 };
 const run=src=>{
   try{
     const m=src.match(/Plugin\.register\(['"]brfx['"]\s*,\s*(\{[\s\S]*\})\s*\);?\s*$/);
     if(!m)throw Error('BRFX core parse failed');
     const core=new Function('return '+m[1])();
     if(core.onload)core.onload.call(core);
     plugin.brfxEnabled=true;
     plugin._core=core;
     const originalUnload=core.onunload;
     core.onunload=function(fromRestore=false){
       removeOutlines();
       if(typeof originalUnload==='function')return originalUnload.call(core,fromRestore);
     };
     const originalApply=core.applyAll;
     if(typeof originalApply==='function')core.applyAll=function(showMessage=true){
       if(plugin.brfxEnabled===false){removeOutlines();return null}
       const r=originalApply.call(core,showMessage);
       if(plugin.outlineEnabled)updateOutlines();
       return r;
     };
     addOutlineAction();
     removeOutlines();
   }catch(e){console.error('BRFX 1.3.0 core load failed',e);try{Blockbench.showQuickMessage('BRFX: core load failed',3000)}catch(x){}}
 };
 const url='https://raw.githubusercontent.com/yamasung7-dot/BRFX/691d0aaeebe6729f1d575d8eef50d79a73d66167/brfx.js';
 if(typeof fetch==='function')fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()}).then(run).catch(e=>{console.error(e);try{Blockbench.showQuickMessage('BRFX: could not reload core',3000)}catch(x){}});
 else if(typeof $!=='undefined'&&typeof $.ajax==='function')$.ajax({url:url+'?v=1.3.0',cache:false,success:run,error:()=>{try{Blockbench.showQuickMessage('BRFX: could not reload core',3000)}catch(e){}}});
},onunload(){
 try{this.outlineEnabled=false;this.outlineSyncTimer&&clearInterval(this.outlineSyncTimer);if(this.outlineGroup&&this.outlineGroup.parent)this.outlineGroup.parent.remove(this.outlineGroup);this.outlineMaterials.forEach(m=>m.dispose&&m.dispose());this.outlineMaterials=[];this._core&&this._core.onunload&&this._core.onunload.call(this._core,false)}catch(e){}
}});
