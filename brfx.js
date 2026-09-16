/* BRFX — Blockbench Render FX — Billboard Light Controller Fix v1.7.1 */
Plugin.register('brfx', {
  title:'BRFX — Render FX', author:'Yama Sung', icon:'auto_awesome',
  description:'Lighting, skybox, atmosphere, mobile optimization and internal glow effects.',
  version:'1.7.1', variant:'both', min_version:'4.10.0', tags:['Rendering','Tools'],
  onload(){
    const p=this;
    p.enabled=true; p.mobile=false; p.light=null; p.hemi=null; p.billboard=null; p.sky=null;
    p.glowGroup=null; p.glowEntries=[];
    p.settings={lightType:'environment',lightColor:'#ffad52',lightIntensity:1,lightSide:0,environmentIntensity:4,environmentDistance:40,skyEnabled:true,skyTop:'#4f82c4',skyHorizon:'#ffd6a0',skyBottom:'#6f5748',skyTopWeight:70,skyHorizonWeight:20,skyBottomWeight:10,fogEnabled:false,fogColor:'#b8a58f',fogNear:20,fogFar:180,quality:'medium',indirect:true,glowMode:'default',glowColor:'#ffb35c',glowIntensity:3,glowRange:20,glowHoleSize:.22};
    const msg=(t,ms=1800)=>{try{Blockbench.showQuickMessage(t,ms);}catch(e){}};
    const getScene=()=>{try{if(typeof Preview!=='undefined'&&Array.isArray(Preview.all)){if(Preview.selected?.scene)return Preview.selected.scene;const a=Preview.all.find(v=>v?.scene);if(a)return a.scene;}}catch(e){}try{return typeof window!=='undefined'?window.scene||null:null;}catch(e){return null;}};
    const getScenes=()=>{const a=[];try{Preview?.all?.forEach(v=>{if(v?.scene&&!a.includes(v.scene))a.push(v.scene);});}catch(e){}const s=getScene();if(s&&!a.includes(s))a.push(s);return a;};
    const col=(v,f)=>{try{if(v?.toHexString)return v.toHexString();if(v?.isColor&&v.getHexString)return '#'+v.getHexString();if(typeof v==='string'&&/^#?[0-9a-f]{3,8}$/i.test(v))return v[0]==='#'?v:'#'+v;}catch(e){}return f;};
    const center=()=>{const c=new THREE.Vector3(),b=new THREE.Box3();let found=false;try{Outliner?.elements?.forEach(e=>{if(e?.mesh&&e.visibility!==false){e.mesh.updateMatrixWorld(true);const x=new THREE.Box3().setFromObject(e.mesh);if(!x.isEmpty()){b.union(x);found=true;}}});}catch(e){}if(found)b.getCenter(c);return c;};
    const meshes=()=>{const a=[];try{Preview?.all?.forEach(v=>v?.scene?.traverse?.(o=>{if(o?.isMesh&&!String(o.name||'').startsWith('BRFX_'))a.push(o);}));}catch(e){}return a;};

    const removeBillboard=()=>{try{p.billboard?.remove?.();}catch(e){}p.billboard=null;};
    const clearLighting=()=>{try{p.light?.parent?.remove(p.light);}catch(e){}try{p.hemi?.parent?.remove(p.hemi);}catch(e){}removeBillboard();p.light=p.hemi=null;};
    const createBillboard=(l)=>{
      removeBillboard();
      if(typeof Billboard==='undefined')return false;
      try{
        if(Billboard.isTypePermitted && !Billboard.isTypePermitted('billboard'))return false;
      }catch(e){}
      try{
        const b=new Billboard({name:'BRFX Light Source',position:[l.position.x,l.position.y,l.position.z],size:[4,4],visibility:true,export:false});
        b.init();
        b.addTo();
        b.select();
        p.billboard=b;
        return true;
      }catch(e){console.error('BRFX billboard',e);p.billboard=null;return false;}
    };
    const createLight=()=>{
      if(!p.enabled||p.settings.lightType!=='environment'||typeof THREE==='undefined')return;
      const s=getScene();if(!s)return;
      clearLighting();
      const q=p.settings.quality==='low'?0.75:p.settings.quality==='high'?1.25:1,c=center();
      const l=new THREE.PointLight(new THREE.Color(col(p.settings.lightColor,'#ffad52')),Math.max(0,Number(p.settings.environmentIntensity)||4)*q,Math.max(1,Number(p.settings.environmentDistance)||40),2);
      l.name='BRFX_Environment_Point_Light';l.position.copy(c).add(new THREE.Vector3(0,8,6));s.add(l);p.light=l;
      if(p.settings.indirect){const h=new THREE.HemisphereLight(new THREE.Color(col(p.settings.skyTop,'#4f82c4')),new THREE.Color(col(p.settings.skyBottom,'#6f5748')),0.45*q);h.name='BRFX_Indirect_Ambient_Light';s.add(h);p.hemi=h;}
      try{if(typeof Sun!=='undefined'&&Sun)Sun.intensity=0;}catch(e){}
      createBillboard(l);
    };
    const syncLight=()=>{if(!p.light||!p.billboard)return;try{const x=p.billboard.position||[0,0,0],z=p.billboard.size||[4,4],scale=Math.max(.1,(Math.abs(Number(z[0])||4)+Math.abs(Number(z[1])||4))/8);p.light.position.set(Number(x[0])||0,Number(x[1])||0,Number(x[2])||0);p.light.distance=Math.max(1,Number(p.settings.environmentDistance)||40)*scale;}catch(e){}};
    p._lightTimer=setInterval(syncLight,80);

    const removeSky=()=>{try{p.sky?.parent?.remove(p.sky);p.sky?.geometry?.dispose?.();p.sky?.material?.dispose?.();}catch(e){}p.sky=null;};
    const createSky=()=>{if(!p.enabled||!p.settings.skyEnabled||typeof THREE==='undefined')return;const ss=getScenes();if(!ss.length)return;removeSky();const tw=Math.max(0,Number(p.settings.skyTopWeight)||70),hw=Math.max(0,Number(p.settings.skyHorizonWeight)||20),bw=Math.max(0,Number(p.settings.skyBottomWeight)||10),t=Math.max(.001,tw+hw+bw),hz=bw/t,tp=(bw+tw)/t;
      const m=new THREE.ShaderMaterial({uniforms:{t:{value:new THREE.Color(col(p.settings.skyTop,'#4f82c4'))},h:{value:new THREE.Color(col(p.settings.skyHorizon,'#ffd6a0'))},b:{value:new THREE.Color(col(p.settings.skyBottom,'#6f5748'))},top:{value:tp},horizon:{value:hz}},vertexShader:'varying vec3 v;void main(){v=position;mat4 m=viewMatrix;m[3][0]=0.;m[3][1]=0.;m[3][2]=0.;gl_Position=projectionMatrix*m*vec4(position,1.);gl_Position.z=gl_Position.w;}',fragmentShader:'uniform vec3 t;uniform vec3 h;uniform vec3 b;uniform float top;uniform float horizon;varying vec3 v;void main(){float y=clamp(v.y*.5+.5,0.,1.);vec3 c;if(y<horizon)c=mix(b,h,smoothstep(0.,max(.001,horizon),y));else c=mix(h,t,smoothstep(horizon,max(horizon+.001,top),y));gl_FragColor=vec4(c,1.);}',side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
      const g=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),m);g.name='BRFX_Procedural_Sky_Dome';g.frustumCulled=false;g.renderOrder=-100000;ss[0].add(g);p.sky=g;};
    const fog=()=>{if(typeof THREE==='undefined')return;getScenes().forEach(s=>{try{s.fog=p.enabled&&p.settings.fogEnabled?new THREE.Fog(new THREE.Color(col(p.settings.fogColor,'#b8a58f')),Number(p.settings.fogNear)||20,Number(p.settings.fogFar)||180):null;}catch(e){}});};

    const removeGlow=()=>{try{p.glowGroup?.parent?.remove(p.glowGroup);}catch(e){}p.glowEntries.forEach(x=>{try{x.material.dispose();}catch(e){}});p.glowEntries=[];p.glowGroup=null;};
    const glowMaterial=()=>{const str=p.settings.glowMode==='strainer',hole=Math.max(.02,Math.min(.8,Number(p.settings.glowHoleSize)||.22));return new THREE.ShaderMaterial({uniforms:{glowColor:{value:new THREE.Color(col(p.settings.glowColor,'#ffb35c'))},intensity:{value:Math.max(0,Number(p.settings.glowIntensity)||3)},range:{value:Math.max(1,Number(p.settings.glowRange)||20)},lightPos:{value:new THREE.Vector3()},hole:{value:hole}},vertexShader:'varying vec3 wp;varying vec3 wn;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;wn=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:'uniform vec3 glowColor;uniform float intensity;uniform float range;uniform vec3 lightPos;uniform float hole;varying vec3 wp;varying vec3 wn;void main(){vec3 d=lightPos-wp;float dist=length(d);float fall=1.-smoothstep(0.,range,dist);float wrap=.3+.7*max(0.,dot(wn,normalize(d+vec3(.0001))));float a=fall*wrap*intensity;'+(str?'float n=fract(sin(dot(wp*7.,vec3(12.9898,78.233,37.719)))*43758.5453);if(n<hole)discard;':'')+'gl_FragColor=vec4(glowColor,a);}',transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});};
    const applyGlow=()=>{removeGlow();if(!p.enabled||typeof THREE==='undefined')return;const s=getScene();if(!s)return;const group=new THREE.Group();group.name='BRFX_Internal_Glow';s.add(group);p.glowGroup=group;const lp=p.light?.position||center();meshes().forEach(src=>{if(!src.geometry?.attributes?.position||!src.geometry?.attributes?.normal)return;const m=glowMaterial(),g=new THREE.Mesh(src.geometry,m);g.name='BRFX_Internal_Glow_Surface';g.matrixAutoUpdate=false;g.renderOrder=50;group.add(g);p.glowEntries.push({mesh:g,source:src,material:m});m.uniforms.lightPos.value.copy(lp);});};
    const syncGlow=()=>{p.glowEntries.forEach(x=>{try{x.mesh.matrixWorld.copy(x.source.matrixWorld);x.mesh.visible=x.source.visible;x.material.uniforms.lightPos.value.copy(p.light?.position||center());}catch(e){}});};
    p._glowTimer=setInterval(syncGlow,80);

    const applyAll=()=>{if(!p.enabled)return;try{if(p.settings.lightType==='environment')createLight();else{clearLighting();if(typeof Canvas!=='undefined'&&Canvas.global_light_color?.set)Canvas.global_light_color.set(p.settings.lightColor);if(typeof Canvas!=='undefined')Canvas.global_light_side=p.settings.lightSide;if(typeof Sun!=='undefined'&&Sun)Sun.intensity=Number(p.settings.lightIntensity)||1;}p.settings.skyEnabled?createSky():removeSky();fog();applyGlow();Preview?.all?.forEach(v=>v.render?.());}catch(e){console.error('BRFX',e);}};

    const lightDialog=()=>{if(!p.enabled)return;new Dialog({id:'brfx_light',title:'BRFX-Costom Light Settings',form:{lightType:{label:'Light Type',type:'select',options:{environment:'Environmental',default:'Default'},value:p.settings.lightType},lightColor:{label:'Light Color',type:'color',value:p.settings.lightColor},lightIntensity:{label:'Default Intensity',type:'number',value:p.settings.lightIntensity,min:0,max:5,step:.05},environmentIntensity:{label:'Environment Intensity',type:'number',value:p.settings.environmentIntensity,min:0,max:20,step:.1},environmentDistance:{label:'Environment Range',type:'number',value:p.settings.environmentDistance,min:1,max:200,step:1},skyEnabled:{label:'Custom Sky',type:'checkbox',value:p.settings.skyEnabled},skyTop:{label:'Sky Top',type:'color',value:p.settings.skyTop},skyHorizon:{label:'Sky Horizon',type:'color',value:p.settings.skyHorizon},skyBottom:{label:'Sky Bottom',type:'color',value:p.settings.skyBottom},indirect:{label:'Indirect Ambient',type:'checkbox',value:p.settings.indirect}},onConfirm:f=>{Object.assign(p.settings,f);p.settings.lightColor=col(f.lightColor,'#ffad52');p.settings.skyTop=col(f.skyTop,'#4f82c4');p.settings.skyHorizon=col(f.skyHorizon,'#ffd6a0');p.settings.skyBottom=col(f.skyBottom,'#6f5748');applyAll();}}).show();};
    const atmosphere=()=>new Dialog({id:'brfx_atmos',title:'BRFX — Atmosphere Settings',form:{fogEnabled:{label:'Fog / Haze',type:'checkbox',value:p.settings.fogEnabled},fogColor:{label:'Fog Color',type:'color',value:p.settings.fogColor},fogNear:{label:'Fog Near',type:'number',value:p.settings.fogNear,min:0,max:500,step:1},fogFar:{label:'Fog Far',type:'number',value:p.settings.fogFar,min:1,max:1000,step:1},quality:{label:'Quality',type:'select',options:{low:'Low',medium:'Medium',high:'High'},value:p.settings.quality}},onConfirm:f=>{Object.assign(p.settings,f);applyAll();}}).show();
    const internalLight=()=>new Dialog({id:'brfx_internal',title:'BRFX — Internal Light',form:{glowMode:{label:'Light Through Mode',type:'select',options:{default:'Default — full glow',strainer:'Strainer — tiny holes'},value:p.settings.glowMode},glowColor:{label:'Glow Color',type:'color',value:p.settings.glowColor},glowIntensity:{label:'Glow Intensity',type:'number',value:p.settings.glowIntensity,min:0,max:10,step:.1},glowRange:{label:'Glow Range',type:'number',value:p.settings.glowRange,min:1,max:100,step:1},glowHoleSize:{label:'Strainer Hole Size',type:'number',value:p.settings.glowHoleSize,min:.02,max:.8,step:.01}},onConfirm:f=>{Object.assign(p.settings,f);p.settings.glowColor=col(f.glowColor,'#ffb35c');applyGlow();Preview?.all?.forEach(v=>v.render?.());}}).show();
    const toggle=()=>new Dialog({id:'brfx_toggle',title:'BRFX — On / Off',form:{enabled:{label:'BRFX Enabled',type:'checkbox',value:p.enabled},mobile:{label:'Mobile Optimization',type:'checkbox',value:p.mobile}},onConfirm:f=>{p.enabled=!!f.enabled;p.mobile=!!f.mobile;if(p.enabled)applyAll();else{clearLighting();removeSky();fog();removeGlow();}msg(p.enabled?'BRFX enabled':'BRFX disabled');}}).show();
    const restore=()=>{clearLighting();removeSky();removeGlow();getScenes().forEach(s=>{try{s.fog=null;}catch(e){}});msg('BRFX effects restored');};
    const A={toggle:new Action('brfx_toggle',{name:'BRFX — On / Off',icon:'power_settings_new',click:toggle}),light:new Action('brfx_light',{name:'BRFX-Costom Light Settings',icon:'lightbulb',click:lightDialog}),internal:new Action('brfx_internal',{name:'BRFX — Internal Light',icon:'flare',click:internalLight}),atmos:new Action('brfx_atmos',{name:'BRFX — Atmosphere Settings',icon:'cloud',click:atmosphere}),fog:new Action('brfx_fog',{name:'BRFX — Remove Fog',icon:'cloud_off',click:()=>{p.settings.fogEnabled=false;fog();msg('BRFX fog removed');}}),restore:new Action('brfx_restore',{name:'BRFX — Restore Lighting',icon:'undo',click:restore})};
    const menu=()=>{try{const t=MenuBar?.menus?.tools;if(!t)return;t.structure=(t.structure||[]).filter(x=>x?.id!=='brfx_menu'&&!String(x?.id||'').startsWith('brfx_'));t.structure.push({id:'brfx_menu',name:'BRFX',icon:'auto_awesome',children:Object.values(A)});t.update?.(true);}catch(e){console.error('BRFX menu',e);}};
    menu();setTimeout(menu,300);applyAll();msg('BRFX 1.7.1 ready');
    this.onunload=()=>{try{clearInterval(p._lightTimer);clearInterval(p._glowTimer);}catch(e){}clearLighting();removeSky();removeGlow();getScenes().forEach(s=>{try{s.fog=null;}catch(e){}});};
  }
});
