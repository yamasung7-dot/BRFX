/*
 * BRFX — Blockbench Render FX
 * Focused Rendering Foundation v1.7.0
 * MIT License — see LICENSE
 */
Plugin.register('brfx', {
  title: 'BRFX — Render FX',
  author: 'Yama Sung',
  icon: 'auto_awesome',
  description: 'Lighting, skybox, atmosphere, mobile optimization and internal glow effects.',
  version: '1.7.0',
  variant: 'both',
  min_version: '4.10.0',
  tags: ['Rendering', 'Tools'],
  onload() {
    const p = this;
    p.enabled = true;
    p.mobile = false;
    p.light = null;
    p.hemi = null;
    p.billboard = null;
    p.sky = null;
    p.glowGroup = null;
    p.glowEntries = [];
    p.fogStates = new Map();
    p.settings = {
      lightType: 'environment', lightColor: '#ffad52', lightIntensity: 1,
      lightSide: 0, environmentIntensity: 4, environmentDistance: 40,
      skyEnabled: true, skyTop: '#4f82c4', skyHorizon: '#ffd6a0', skyBottom: '#6f5748',
      skyTopWeight: 70, skyHorizonWeight: 20, skyBottomWeight: 10,
      fogEnabled: false, fogColor: '#b8a58f', fogNear: 20, fogFar: 180,
      exposure: 1, contrast: 1, quality: 'medium', indirect: true,
      glowMode: 'default', glowColor: '#ffb35c', glowIntensity: 3,
      glowRange: 20, glowHoleSize: 0.22
    };

    const msg = (t, ms=1800) => { try { Blockbench.showQuickMessage(t, ms); } catch(e) {} };
    const getScene = () => {
      try {
        if (typeof Preview !== 'undefined' && Array.isArray(Preview.all)) {
          if (Preview.selected?.scene) return Preview.selected.scene;
          const active = Preview.all.find(v => v?.scene);
          if (active?.scene) return active.scene;
        }
      } catch(e) {}
      try { return typeof window !== 'undefined' ? window.scene || null : null; } catch(e) { return null; }
    };
    const getScenes = () => {
      const out=[];
      try { Preview?.all?.forEach(v => { if(v?.scene && !out.includes(v.scene)) out.push(v.scene); }); } catch(e) {}
      const s=getScene(); if(s && !out.includes(s)) out.push(s);
      return out;
    };
    const color = (v, fallback) => {
      try {
        if(v?.toHexString) return v.toHexString();
        if(v?.isColor && v.getHexString) return '#'+v.getHexString();
        if(typeof v==='string' && (/^#[0-9a-f]{3,8}$/i.test(v) || /^[0-9a-f]{6,8}$/i.test(v))) return v[0]==='#'?v:'#'+v;
      } catch(e) {}
      return fallback;
    };
    const modelCenter = () => {
      const c=new THREE.Vector3(), box=new THREE.Box3(); let found=false;
      try { Outliner?.elements?.forEach(e=>{ if(e?.mesh && e.visibility!==false){ e.mesh.updateMatrixWorld(true); const b=new THREE.Box3().setFromObject(e.mesh); if(!b.isEmpty()){box.union(b);found=true;} } }); } catch(e) {}
      if(found) box.getCenter(c);
      return c;
    };
    const modelMeshes = () => {
      const out=[];
      try { Preview?.all?.forEach(v=>v?.scene?.traverse?.(o=>{ if(o?.isMesh && !String(o.name||'').startsWith('BRFX_')) out.push(o); })); } catch(e) {}
      return out;
    };

    const clearLighting = () => {
      try { p.light?.parent?.remove(p.light); } catch(e) {}
      try { p.hemi?.parent?.remove(p.hemi); } catch(e) {}
      try { p.billboard?.remove?.(); } catch(e) {}
      p.light=p.hemi=p.billboard=null;
    };
    const createEnvironmentLight = () => {
      if(!p.enabled || p.settings.lightType!=='environment' || typeof THREE==='undefined') return;
      const s=getScene(); if(!s) return;
      clearLighting();
      const q=p.settings.quality==='low'?.75:p.settings.quality==='high'?1.25:1;
      const c=modelCenter();
      const light=new THREE.PointLight(new THREE.Color(color(p.settings.lightColor,'#ffad52')),Math.max(0,Number(p.settings.environmentIntensity)||4)*q,Math.max(1,Number(p.settings.environmentDistance)||40),2);
      light.name='BRFX_Environment_Point_Light'; light.position.copy(c).add(new THREE.Vector3(0,8,6)); s.add(light); p.light=light;
      if(p.settings.indirect){
        const hemi=new THREE.HemisphereLight(new THREE.Color(color(p.settings.skyTop,'#4f82c4')),new THREE.Color(color(p.settings.skyBottom,'#6f5748')),0.45*q);
        hemi.name='BRFX_Indirect_Ambient_Light'; s.add(hemi); p.hemi=hemi;
      }
      try { if(typeof Sun!=='undefined'&&Sun) Sun.intensity=0; } catch(e) {}
      try {
        if(typeof Billboard!=='undefined' && (!Billboard.isTypePermitted || Billboard.isTypePermitted('billboard'))){
          p.billboard=new Billboard({name:'BRFX Light Source',position:[light.position.x,light.position.y,light.position.z],size:[4,4],visibility:true,export:false}).init();
          p.billboard.addTo(); p.billboard.select();
        }
      } catch(e) {}
    };
    const syncLight = () => {
      if(!p.light||!p.billboard) return;
      try {
        const pos=p.billboard.position||[0,0,0];
        p.light.position.set(Number(pos[0])||0,Number(pos[1])||0,Number(pos[2])||0);
        const size=p.billboard.size||[4,4];
        const scale=Math.max(.1,(Math.abs(Number(size[0])||4)+Math.abs(Number(size[1])||4))/8);
        p.light.distance=Math.max(1,Number(p.settings.environmentDistance)||40)*scale;
      } catch(e) {}
    };
    p._lightTimer=setInterval(syncLight,80);

    const removeSky=()=>{ try{p.sky?.parent?.remove(p.sky);p.sky?.geometry?.dispose?.();p.sky?.material?.dispose?.();}catch(e){} p.sky=null; };
    const createSky=()=>{
      if(!p.enabled||!p.settings.skyEnabled||typeof THREE==='undefined') return;
      const scenes=getScenes(); if(!scenes.length) return; removeSky();
      const tw=Math.max(0,Number(p.settings.skyTopWeight)||70), hw=Math.max(0,Number(p.settings.skyHorizonWeight)||20), bw=Math.max(0,Number(p.settings.skyBottomWeight)||10), total=Math.max(.001,tw+hw+bw);
      const horizon=bw/total, top=(bw+tw)/total;
      const geometry=new THREE.BoxGeometry(2,2,2);
      const material=new THREE.ShaderMaterial({
        uniforms:{t:{value:new THREE.Color(color(p.settings.skyTop,'#4f82c4'))},h:{value:new THREE.Color(color(p.settings.skyHorizon,'#ffd6a0'))},b:{value:new THREE.Color(color(p.settings.skyBottom,'#6f5748'))},top:{value:top},horizon:{value:horizon}},
        vertexShader:'varying vec3 v; void main(){v=position;mat4 m=viewMatrix;m[3][0]=0.;m[3][1]=0.;m[3][2]=0.;gl_Position=projectionMatrix*m*vec4(position,1.);gl_Position.z=gl_Position.w;}',
        fragmentShader:'uniform vec3 t;uniform vec3 h;uniform vec3 b;uniform float top;uniform float horizon;varying vec3 v;void main(){float y=clamp(v.y*.5+.5,0.,1.);vec3 c;if(y<horizon)c=mix(b,h,smoothstep(0.,max(.001,horizon),y));else c=mix(h,t,smoothstep(horizon,max(horizon+.001,top),y));gl_FragColor=vec4(c,1.);}',
        side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false
      });
      const mesh=new THREE.Mesh(geometry,material); mesh.name='BRFX_Procedural_Sky_Dome'; mesh.frustumCulled=false; mesh.renderOrder=-100000; scenes[0].add(mesh); p.sky=mesh;
    };
    const applyFog=()=>{
      if(typeof THREE==='undefined') return;
      getScenes().forEach(s=>{try{s.fog=p.enabled&&p.settings.fogEnabled?new THREE.Fog(new THREE.Color(color(p.settings.fogColor,'#b8a58f')),Number(p.settings.fogNear)||20,Number(p.settings.fogFar)||180):null;}catch(e){}});
    };

    const removeGlow=()=>{
      try { p.glowGroup?.parent?.remove(p.glowGroup); } catch(e) {}
      p.glowEntries.forEach(e=>{try{e.material?.dispose?.();e.geometry?.dispose?.();}catch(x){}});
      p.glowEntries=[]; p.glowGroup=null;
    };
    const makeGlowMaterial=(mode)=>{
      const hole=Number(p.settings.glowHoleSize)||.22;
      const colorHex=color(p.settings.glowColor,'#ffb35c');
      const isStrainer=mode==='strainer';
      return new THREE.ShaderMaterial({
        uniforms:{glowColor:{value:new THREE.Color(colorHex)},glowIntensity:{value:Math.max(0,Number(p.settings.glowIntensity)||3)},glowRange:{value:Math.max(1,Number(p.settings.glowRange)||20)},hole:{value:Math.max(.05,Math.min(.8,hole))},lightPos:{value:new THREE.Vector3()}},
        vertexShader:'varying vec3 vWorld;varying vec3 vNormal;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader:'uniform vec3 glowColor;uniform float glowIntensity;uniform float glowRange;uniform float hole;uniform vec3 lightPos;varying vec3 vWorld;varying vec3 vNormal;void main(){vec3 toL=lightPos-vWorld;float d=length(toL);float fall=1.-smoothstep(0.,glowRange,d);vec3 L=normalize(toL+vec3(.0001));float wrap=.35+.65*max(0.,dot(vNormal,L));float g=fall*wrap*glowIntensity;'+(isStrainer?'float n=fract(sin(dot(vWorld*7.0,vec3(12.9898,78.233,37.719)))*43758.5453);if(n<hole)discard;':'')+'gl_FragColor=vec4(glowColor,g);}',
        transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false
      });
    };
    const applyGlow=()=>{
      removeGlow();
      if(!p.enabled||typeof THREE==='undefined') return;
      const scene=getScene(); if(!scene) return;
      const source=p.light || (()=>{const c=modelCenter();const l=new THREE.PointLight(new THREE.Color(color(p.settings.glowColor,'#ffb35c')),1,Math.max(1,Number(p.settings.glowRange)||20),2);l.position.copy(c);return l;})();
      const group=new THREE.Group(); group.name='BRFX_Internal_Glow'; scene.add(group); p.glowGroup=group;
      modelMeshes().forEach(src=>{
        if(!src.geometry?.attributes?.position||!src.geometry?.attributes?.normal) return;
        const mat=makeGlowMaterial(p.settings.glowMode);
        const mesh=new THREE.Mesh(src.geometry,mat); mesh.name='BRFX_Internal_Glow_Surface'; mesh.matrixAutoUpdate=false; mesh.renderOrder=50; group.add(mesh);
        p.glowEntries.push({mesh,geometry:src.geometry,material:mat,source:src});
      });
      p._glowLight=source;
    };
    const syncGlow=()=>{
      if(!p.glowEntries.length) return;
      try{
        const lp=p._glowLight?.position||modelCenter();
        p.glowEntries.forEach(e=>{e.mesh.matrixWorld.copy(e.source.matrixWorld);e.mesh.visible=e.source.visible;e.material.uniforms.lightPos.value.copy(lp);});
      }catch(e){}
    };
    p._glowTimer=setInterval(syncGlow,80);

    const applyAll=()=>{
      if(!p.enabled) return;
      try{
        if(p.settings.lightType==='environment') createEnvironmentLight();
        else { clearLighting(); if(typeof Canvas!=='undefined'&&Canvas.global_light_color?.set) Canvas.global_light_color.set(p.settings.lightColor); if(typeof Canvas!=='undefined') Canvas.global_light_side=p.settings.lightSide; if(typeof Sun!=='undefined'&&Sun) Sun.intensity=Number(p.settings.lightIntensity)||1; }
        p.settings.skyEnabled?createSky():removeSky();
        applyFog();
        applyGlow();
        Preview?.all?.forEach(v=>v.render?.());
      }catch(e){console.error('BRFX applyAll',e);}
    };

    const customLight=()=>{
      if(!p.enabled) return;
      const d=new Dialog({id:'brfx_light_settings',title:'BRFX-Costom Light Settings',form:{
        lightType:{label:'Light Type',type:'select',options:{environment:'Environmental',default:'Default'},value:p.settings.lightType},
        lightColor:{label:'Light Color',type:'color',value:p.settings.lightColor},
        lightIntensity:{label:'Default Intensity',type:'number',value:p.settings.lightIntensity,min:0,max:5,step:.05},
        environmentIntensity:{label:'Environment Intensity',type:'number',value:p.settings.environmentIntensity,min:0,max:20,step:.1},
        environmentDistance:{label:'Environment Range',type:'number',value:p.settings.environmentDistance,min:1,max:200,step:1},
        skyEnabled:{label:'Custom Sky',type:'checkbox',value:p.settings.skyEnabled},
        skyTop:{label:'Sky Top',type:'color',value:p.settings.skyTop},skyHorizon:{label:'Sky Horizon',type:'color',value:p.settings.skyHorizon},skyBottom:{label:'Sky Bottom',type:'color',value:p.settings.skyBottom},
        skyTopWeight:{label:'Sky Top %',type:'number',value:p.settings.skyTopWeight,min:0,max:100,step:1},skyHorizonWeight:{label:'Sky Horizon %',type:'number',value:p.settings.skyHorizonWeight,min:0,max:100,step:1},skyBottomWeight:{label:'Sky Bottom %',type:'number',value:p.settings.skyBottomWeight,min:0,max:100,step:1},
        indirect:{label:'Indirect Ambient',type:'checkbox',value:p.settings.indirect}
      },onConfirm:f=>{Object.assign(p.settings,f);p.settings.lightColor=color(p.settings.lightColor,'#ffad52');p.settings.skyTop=color(p.settings.skyTop,'#4f82c4');p.settings.skyHorizon=color(p.settings.skyHorizon,'#ffd6a0');p.settings.skyBottom=color(p.settings.skyBottom,'#6f5748');applyAll();msg('BRFX light settings applied');}}}); d.show();
    };
    const atmosphere=()=>{
      const d=new Dialog({id:'brfx_atmosphere',title:'BRFX — Atmosphere Settings',form:{fogEnabled:{label:'Fog / Haze',type:'checkbox',value:p.settings.fogEnabled},fogColor:{label:'Fog Color',type:'color',value:p.settings.fogColor},fogNear:{label:'Fog Near',type:'number',value:p.settings.fogNear,min:0,max:500,step:1},fogFar:{label:'Fog Far',type:'number',value:p.settings.fogFar,min:1,max:1000,step:1},quality:{label:'Quality',type:'select',options:{low:'Low',medium:'Medium',high:'High'},value:p.settings.quality}},onConfirm:f=>{Object.assign(p.settings,f);applyAll();msg('BRFX atmosphere applied');}}}); d.show();
    };
    const internalGlow=()=>{
      const d=new Dialog({id:'brfx_internal_glow',title:'BRFX — Internal Light',form:{mode:{label:'Glow Type',type:'select',options:{default:'Default — full glow',strainer:'Strainer — perforated glow'},value:p.settings.glowMode},glowColor:{label:'Glow Color',type:'color',value:p.settings.glowColor},glowIntensity:{label:'Glow Intensity',type:'number',value:p.settings.glowIntensity,min:0,max:10,step:.1},glowRange:{label:'Glow Range',type:'number',value:p.settings.glowRange,min:1,max:100,step:1},glowHoleSize:{label:'Strainer Hole Size',type:'number',value:p.settings.glowHoleSize,min:.05,max:.8,step:.01}},onConfirm:f=>{p.settings.glowMode=f.mode;p.settings.glowColor=color(f.glowColor,'#ffb35c');p.settings.glowIntensity=Number(f.glowIntensity)||3;p.settings.glowRange=Number(f.glowRange)||20;p.settings.glowHoleSize=Number(f.glowHoleSize)||.22;applyGlow();msg('BRFX internal light applied');}}}); d.show();
    };
    const toggle=()=>{
      const d=new Dialog({id:'brfx_toggle',title:'BRFX — On / Off',form:{enabled:{label:'BRFX Enabled',type:'checkbox',value:p.enabled},mobile:{label:'Mobile Optimization',type:'checkbox',value:p.mobile}},onConfirm:f=>{p.enabled=!!f.enabled;p.mobile=!!f.mobile;if(!p.enabled){clearLighting();removeSky();applyFog();removeGlow();}else applyAll();msg(p.enabled?'BRFX enabled':'BRFX disabled');}}}); d.show();
    };
    const restore=()=>{p.enabled=false;clearLighting();removeSky();removeGlow();getScenes().forEach(s=>{try{s.fog=null;}catch(e){}});try{if(typeof Sun!=='undefined'&&Sun&&p.originalSun!==undefined)Sun.intensity=p.originalSun;}catch(e){}p.enabled=true;msg('BRFX lighting restored');};

    const actions={
      brfx_toggle:new Action('brfx_toggle',{name:'BRFX — On / Off',icon:'power_settings_new',click:toggle}),
      brfx_light:new Action('brfx_light',{name:'BRFX-Costom Light Settings',icon:'lightbulb',click:customLight}),
      brfx_internal_glow:new Action('brfx_internal_glow',{name:'BRFX — Internal Light',icon:'flare',click:internalGlow}),
      brfx_atmos:new Action('brfx_atmos',{name:'BRFX — Atmosphere Settings',icon:'cloud',click:atmosphere}),
      brfx_remove_fog:new Action('brfx_remove_fog',{name:'BRFX — Remove Fog',icon:'cloud_off',click:()=>{p.settings.fogEnabled=false;getScenes().forEach(s=>{try{s.fog=null;}catch(e){}});msg('BRFX fog removed');}}),
      brfx_restore:new Action('brfx_restore',{name:'BRFX — Restore Lighting',icon:'undo',click:restore})
    };
    const buildMenu=()=>{
      try{
        const tools=MenuBar?.menus?.tools; if(!tools) return;
        tools.structure=(tools.structure||[]).filter(x=>x?.id!=='brfx_menu'&&!String(x?.id||'').startsWith('brfx_'));
        const enabled=[actions.brfx_toggle,actions.brfx_light,actions.brfx_internal_glow,actions.brfx_atmos,actions.brfx_remove_fog,actions.brfx_restore];
        tools.structure.push({id:'brfx_menu',name:'BRFX',icon:'auto_awesome',children:enabled});
        tools.update?.(true);
      }catch(e){console.error('BRFX menu',e);}
    };
    buildMenu();
    setTimeout(buildMenu,300);
    applyAll();
    msg('BRFX 1.7.0 ready');

    this.onunload=()=>{
      try{clearInterval(p._lightTimer);clearInterval(p._glowTimer);}catch(e){}
      clearLighting();removeSky();removeGlow();
      try{getScenes().forEach(s=>{if(s) s.fog=null;});}catch(e){}
      try{tools=MenuBar?.menus?.tools;}catch(e){}
    };
  }
});
