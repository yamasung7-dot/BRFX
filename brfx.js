/*
 * BRFX — Blockbench Render FX
 * Self-Contained Runtime Fix v1.6.1
 * MIT License — see LICENSE
 */
Plugin.register('brfx', {
  title: 'BRFX — Render FX',
  author: 'Yama Sung',
  icon: 'auto_awesome',
  description: 'Lighting, skybox, atmosphere, mobile optimization, silhouette outlines and stylized rendering effects.',
  version: '1.6.1',
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
    p.outlines = [];
    p.outlineEnabled = false;
    p.outlineColor = '#17131b';
    p.outlineThickness = 0.08;
    p.toonEnabled = false;
    p.toonBands = 4;
    p.toonStrength = 0.85;
    p.toonMaterials = [];
    p.fogStates = new Map();
    p.visibility = {lighting:true, skybox:true, atmosphere:true, rendering:true};
    try {
      const saved = JSON.parse(localStorage.getItem('brfx_feature_visibility') || 'null');
      if (saved) Object.assign(p.visibility, saved);
    } catch (e) {}
    p.settings = {
      lightType:'environment', lightColor:'#ffad52', lightIntensity:1,
      lightSide:0, environmentIntensity:4, environmentDistance:40,
      skyEnabled:true, skyTop:'#4f82c4', skyHorizon:'#ffd6a0', skyBottom:'#6f5748',
      skyTopWeight:70, skyHorizonWeight:20, skyBottomWeight:10, skyRotation:0,
      fogEnabled:false, fogColor:'#b8a58f', fogNear:20, fogFar:180,
      exposure:1, contrast:1, quality:'medium', indirect:true
    };
    p.original = {
      lightColor: typeof Canvas !== 'undefined' && Canvas.global_light_color ? Canvas.global_light_color.clone() : null,
      lightSide: typeof Canvas !== 'undefined' ? Canvas.global_light_side : 0,
      sunIntensity: typeof Sun !== 'undefined' && Sun ? Sun.intensity : null
    };

    const msg = (text, time=1800) => { try { Blockbench.showQuickMessage(text, time); } catch(e) {} };
    const getScene = () => {
      try {
        if (typeof Preview !== 'undefined' && Array.isArray(Preview.all)) {
          const selected = Preview.selected;
          if (selected?.scene) return selected.scene;
          const active = Preview.all.find(v => v?.scene);
          if (active?.scene) return active.scene;
        }
      } catch(e) {}
      try { if (typeof window !== 'undefined' && window.scene) return window.scene; } catch(e) {}
      return null;
    };
    const getScenes = () => {
      const out = [];
      try {
        if (typeof Preview !== 'undefined' && Array.isArray(Preview.all)) {
          Preview.all.forEach(v => { if (v?.scene && !out.includes(v.scene)) out.push(v.scene); });
        }
      } catch(e) {}
      const s = getScene();
      if (s && !out.includes(s)) out.push(s);
      return out;
    };
    const color = (v, fallback) => {
      try {
        if (v?.toHexString) return v.toHexString();
        if (v?.isColor && v.getHexString) return '#' + v.getHexString();
        if (typeof v === 'string') {
          if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
          if (/^[0-9a-f]{6,8}$/i.test(v)) return '#' + v;
        }
        if (v && Number.isFinite(v.r) && Number.isFinite(v.g) && Number.isFinite(v.b)) {
          const q = x => Math.round((x <= 1 ? x * 255 : x)).toString(16).padStart(2,'0');
          return '#' + q(v.r) + q(v.g) + q(v.b);
        }
      } catch(e) {}
      return fallback;
    };
    const modelCenter = () => {
      const c = new THREE.Vector3();
      const box = new THREE.Box3();
      let found = false;
      try {
        Outliner?.elements?.forEach(e => {
          if (e?.mesh && e.visibility !== false) {
            e.mesh.updateMatrixWorld(true);
            const b = new THREE.Box3().setFromObject(e.mesh);
            if (!b.isEmpty()) { box.union(b); found = true; }
          }
        });
      } catch(e) {}
      if (found) box.getCenter(c);
      return c;
    };
    const meshes = () => {
      const out = [];
      try {
        if (typeof Preview !== 'undefined' && Array.isArray(Preview.all)) {
          Preview.all.forEach(v => v?.scene?.traverse?.(o => {
            if (o?.isMesh && !String(o.name || '').startsWith('BRFX_')) out.push(o);
          }));
        }
      } catch(e) {}
      return out;
    };
    const clearSceneEffects = () => {
      try { p.light?.parent?.remove(p.light); } catch(e) {}
      try { p.hemi?.parent?.remove(p.hemi); } catch(e) {}
      try { p.billboard?.remove?.(); } catch(e) {}
      try { p.sky?.parent?.remove(p.sky); } catch(e) {}
      try { p.sky?.geometry?.dispose?.(); p.sky?.material?.dispose?.(); } catch(e) {}
      p.light = null; p.hemi = null; p.billboard = null; p.sky = null;
    };
    const createEnvironmentLight = () => {
      if (!p.enabled || p.settings.lightType !== 'environment' || typeof THREE === 'undefined') return;
      const s = getScene();
      if (!s) return;
      try { p.light?.parent?.remove(p.light); } catch(e) {}
      try { p.hemi?.parent?.remove(p.hemi); } catch(e) {}
      try { p.billboard?.remove?.(); } catch(e) {}
      p.light = null; p.hemi = null; p.billboard = null;
      const q = p.settings.quality === 'low' ? 0.75 : p.settings.quality === 'high' ? 1.25 : 1;
      const c = modelCenter();
      const light = new THREE.PointLight(new THREE.Color(color(p.settings.lightColor,'#ffad52')), Math.max(0,Number(p.settings.environmentIntensity)||4)*q, Math.max(1,Number(p.settings.environmentDistance)||40), 2);
      light.name = 'BRFX_Environment_Point_Light';
      light.position.copy(c).add(new THREE.Vector3(0,8,6));
      s.add(light);
      p.light = light;
      if (p.settings.indirect) {
        const hemi = new THREE.HemisphereLight(new THREE.Color(color(p.settings.skyTop,'#4f82c4')), new THREE.Color(color(p.settings.skyBottom,'#6f5748')), 0.45*q);
        hemi.name = 'BRFX_Indirect_Ambient_Light';
        s.add(hemi);
        p.hemi = hemi;
      }
      if (typeof Sun !== 'undefined' && Sun) try { Sun.intensity = 0; } catch(e) {}
      if (typeof Billboard !== 'undefined' && (!Billboard.isTypePermitted || Billboard.isTypePermitted('billboard'))) {
        try {
          p.billboard = new Billboard({name:'BRFX Light Source', position:[light.position.x,light.position.y,light.position.z], size:[4,4], visibility:true, export:false}).init();
          p.billboard.addTo();
          p.billboard.select();
        } catch(e) {}
      }
    };
    const syncLight = () => {
      if (!p.light || !p.billboard) return;
      try {
        const pos = p.billboard.position || [0,0,0];
        p.light.position.set(Number(pos[0])||0, Number(pos[1])||0, Number(pos[2])||0);
        const size = p.billboard.size || [4,4];
        const scale = Math.max(0.1, (Math.abs(Number(size[0])||4)+Math.abs(Number(size[1])||4))/8);
        p.light.distance = Math.max(1,Number(p.settings.environmentDistance)||40) * scale;
      } catch(e) {}
    };
    p._lightTimer = setInterval(syncLight, 80);

    const createSky = () => {
      if (typeof THREE === 'undefined' || !p.enabled || !p.settings.skyEnabled) return;
      const scenes = getScenes();
      if (!scenes.length) return;
      try { p.sky?.parent?.remove(p.sky); p.sky?.geometry?.dispose?.(); p.sky?.material?.dispose?.(); } catch(e) {}
      const tw = Math.max(0, Number(p.settings.skyTopWeight)||70);
      const hw = Math.max(0, Number(p.settings.skyHorizonWeight)||20);
      const bw = Math.max(0, Number(p.settings.skyBottomWeight)||10);
      const total = Math.max(0.001, tw+hw+bw);
      const horizon = bw/total;
      const top = (bw+tw)/total;
      const geometry = new THREE.BoxGeometry(2,2,2);
      const vertexShader = 'varying vec3 v; void main(){ v=position; mat4 m=viewMatrix; m[3][0]=0.; m[3][1]=0.; m[3][2]=0.; gl_Position=projectionMatrix*m*vec4(position,1.); gl_Position.z=gl_Position.w; }';
      const fragmentShader = 'uniform vec3 t; uniform vec3 h; uniform vec3 b; uniform float top; uniform float horizon; varying vec3 v; void main(){ float y=clamp(v.y*.5+.5,0.,1.); vec3 c; if(y<horizon)c=mix(b,h,smoothstep(0.,max(.001,horizon),y)); else c=mix(h,t,smoothstep(horizon,max(horizon+.001,top),y)); gl_FragColor=vec4(c,1.); }';
      const material = new THREE.ShaderMaterial({
        uniforms:{t:{value:new THREE.Color(color(p.settings.skyTop,'#4f82c4'))},h:{value:new THREE.Color(color(p.settings.skyHorizon,'#ffd6a0'))},b:{value:new THREE.Color(color(p.settings.skyBottom,'#6f5748'))},top:{value:top},horizon:{value:horizon}},
        vertexShader, fragmentShader, side:THREE.BackSide, depthWrite:false, depthTest:false, fog:false, toneMapped:false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'BRFX_Procedural_Sky_Dome';
      mesh.frustumCulled = false;
      mesh.renderOrder = -100000;
      scenes[0].add(mesh);
      p.sky = mesh;
    };
    const removeSky = () => {
      try { p.sky?.parent?.remove(p.sky); p.sky?.geometry?.dispose?.(); p.sky?.material?.dispose?.(); } catch(e) {}
      p.sky = null;
    };
    const applyFog = () => {
      if (typeof THREE === 'undefined') return;
      getScenes().forEach(s => {
        try {
          if (!p.fogStates.has(s)) p.fogStates.set(s, s.fog || null);
          s.fog = p.enabled && p.settings.fogEnabled ? new THREE.Fog(new THREE.Color(color(p.settings.fogColor,'#b8a58f')), Number(p.settings.fogNear)||20, Number(p.settings.fogFar)||180) : null;
        } catch(e) {}
      });
    };
    const removeOutlines = () => {
      p.outlines.forEach(o => { try { o.mesh?.parent?.remove(o.mesh); o.mat?.dispose?.(); } catch(e) {} });
      p.outlines = [];
    };
    const applyOutlines = () => {
      removeOutlines();
      if (!p.enabled || !p.outlineEnabled || typeof THREE === 'undefined') return;
      try {
        getScenes().forEach(s => s.traverse?.(src => {
          if (!src?.isMesh || String(src.name||'').startsWith('BRFX_')) return;
          const mat = new THREE.MeshBasicMaterial({color:p.outlineColor, side:THREE.BackSide, depthWrite:false, depthTest:true});
          mat.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += objectNormal * '+Number(p.outlineThickness||0.08).toFixed(4)+';');
          };
          const mesh = new THREE.Mesh(src.geometry, mat);
          mesh.name = 'BRFX_Outline_' + src.uuid;
          mesh.matrixAutoUpdate = false;
          mesh.renderOrder = -10;
          s.add(mesh);
          p.outlines.push({mesh,src,mat});
        }));
      } catch(e) { console.error('BRFX outlines', e); }
    };
    p._outlineTimer = setInterval(() => p.outlines.forEach(o => { try { o.mesh.matrixWorld.copy(o.src.matrixWorld); o.mesh.visible = o.src.visible; } catch(e) {} }), 80);

    const removeToon = () => {
      p.toonMaterials.forEach(m => { try { const d=m.userData||{}; if(d.brfxToonWrapper && m.onBeforeCompile===d.brfxToonWrapper) m.onBeforeCompile=d.brfxToonOriginal||function(){}; m.customProgramCacheKey=d.brfxToonKey; m.needsUpdate=true; } catch(e) {} });
      p.toonMaterials=[];
    };
    const applyToon = () => {
      removeToon();
      if (!p.enabled || !p.toonEnabled) return;
      const bands = Math.max(2,Math.min(8,Math.round(p.toonBands)));
      const strength = Math.max(0,Math.min(1,Number(p.toonStrength)||0));
      meshes().forEach(obj => {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(mat => {
          if (!mat?.isMaterial) return;
          const original = mat.onBeforeCompile;
          const key = mat.customProgramCacheKey;
          const wrapper = shader => {
            original?.call(mat, shader);
            shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', 'float brfx_l=dot(outgoingLight,vec3(.2126,.7152,.0722)); float brfx_s=floor(brfx_l*'+bands+'.0)/'+bands+'.0; float brfx_m=mix(brfx_l,brfx_s,'+strength.toFixed(3)+'); outgoingLight*=brfx_l>.0001?brfx_m/brfx_l:1.; #include <output_fragment>');
          };
          mat.userData = mat.userData || {};
          mat.userData.brfxToonWrapper=wrapper;
          mat.userData.brfxToonOriginal=original;
          mat.userData.brfxToonKey=key;
          mat.onBeforeCompile=wrapper;
          mat.needsUpdate=true;
          p.toonMaterials.push(mat);
        });
      });
    };

    const applyAll = () => {
      if (!p.enabled) return;
      try {
        p.settings.lightColor=color(p.settings.lightColor,'#ffad52');
        p.settings.skyTop=color(p.settings.skyTop,'#4f82c4');
        p.settings.skyHorizon=color(p.settings.skyHorizon,'#ffd6a0');
        p.settings.skyBottom=color(p.settings.skyBottom,'#6f5748');
        if (p.settings.lightType === 'environment') createEnvironmentLight();
        else {
          clearSceneEffects();
          if (typeof Canvas !== 'undefined' && Canvas.global_light_color?.set) Canvas.global_light_color.set(p.settings.lightColor);
          if (typeof Canvas !== 'undefined') Canvas.global_light_side=p.settings.lightSide;
          if (typeof Sun !== 'undefined' && Sun) Sun.intensity=Number(p.settings.lightIntensity)||1;
        }
        if (p.settings.skyEnabled) createSky(); else removeSky();
        applyFog();
        applyOutlines();
        applyToon();
        if (typeof Preview !== 'undefined') Preview.all?.forEach(v=>v.render?.());
      } catch(e) { console.error('BRFX applyAll',e); }
    };
    const restore = () => {
      p.enabled=false;
      clearSceneEffects();
      removeOutlines();
      removeToon();
      try {
        getScenes().forEach(s => { s.fog = p.fogStates.get(s) || null; });
        Preview?.all?.forEach(v=>{ if(v.renderer) v.renderer.toneMappingExposure=1; if(v.canvas) v.canvas.style.filter=''; });
        if (typeof Canvas !== 'undefined' && Canvas.global_light_color?.copy && p.original.lightColor) Canvas.global_light_color.copy(p.original.lightColor);
        if (typeof Canvas !== 'undefined') Canvas.global_light_side=p.original.lightSide;
        if (typeof Sun !== 'undefined' && Sun && p.original.sunIntensity!=null) Sun.intensity=p.original.sunIntensity;
      } catch(e) {}
    };
    const mobile = on => {
      p.mobile=!!on;
      try {
        Preview?.all?.forEach(v=>{
          const r=v.renderer; if(!r)return;
          if(p.mobile){ v._brfxOldPixelRatio=r.getPixelRatio?.(); r.setPixelRatio?.(Math.min(1,v._brfxOldPixelRatio||1)); if(r.shadowMap)r.shadowMap.enabled=false; }
          else if(v._brfxOldPixelRatio){ r.setPixelRatio?.(v._brfxOldPixelRatio); delete v._brfxOldPixelRatio; }
        });
      } catch(e) {}
    };
    const dialog = (id,title,form,onConfirm) => { try { new Dialog({id,title,form,onConfirm}).show(); } catch(e) { console.error('BRFX dialog',e); } };
    const customSettings = () => dialog('brfx_custom','BRFX-Costom Light Settings',{
      type:{label:'Light Type',type:'select',options:{default:'Default',environment:'Environment'},value:p.settings.lightType},
      color:{label:'Light Color',type:'color',value:p.settings.lightColor},
      intensity:{label:'Default Intensity',type:'number',value:p.settings.lightIntensity,min:0,max:10,step:.1},
      envint:{label:'Environment Intensity',type:'number',value:p.settings.environmentIntensity,min:0,max:20,step:.1},
      range:{label:'Environment Range',type:'number',value:p.settings.environmentDistance,min:1,max:500,step:1},
      sky:{label:'Custom Sky',type:'checkbox',value:p.settings.skyEnabled},
      top:{label:'Sky Top',type:'color',value:p.settings.skyTop},horizon:{label:'Sky Horizon',type:'color',value:p.settings.skyHorizon},bottom:{label:'Sky Bottom',type:'color',value:p.settings.skyBottom},
      tw:{label:'Top Weight %',type:'number',value:p.settings.skyTopWeight,min:0,max:100},hw:{label:'Horizon Weight %',type:'number',value:p.settings.skyHorizonWeight,min:0,max:100},bw:{label:'Bottom Weight %',type:'number',value:p.settings.skyBottomWeight,min:0,max:100}
    }, f=>{
      p.settings.lightType=f.type;p.settings.lightColor=color(f.color,p.settings.lightColor);p.settings.lightIntensity=Number(f.intensity);p.settings.environmentIntensity=Number(f.envint);p.settings.environmentDistance=Number(f.range);p.settings.skyEnabled=!!f.sky;p.settings.skyTop=color(f.top,p.settings.skyTop);p.settings.skyHorizon=color(f.horizon,p.settings.skyHorizon);p.settings.skyBottom=color(f.bottom,p.settings.skyBottom);p.settings.skyTopWeight=Number(f.tw);p.settings.skyHorizonWeight=Number(f.hw);p.settings.skyBottomWeight=Number(f.bw);applyAll();msg('BRFX custom settings applied');
    });
    const atmosphere = () => dialog('brfx_atmosphere','BRFX — Atmosphere Settings',{
      fog:{label:'Enable Fog / Haze',type:'checkbox',value:p.settings.fogEnabled},fogc:{label:'Fog Color',type:'color',value:p.settings.fogColor},near:{label:'Fog Near',type:'number',value:p.settings.fogNear,min:0,max:500},far:{label:'Fog Far',type:'number',value:p.settings.fogFar,min:1,max:1000},exposure:{label:'Exposure',type:'number',value:p.settings.exposure,min:.1,max:4,step:.05},contrast:{label:'Contrast',type:'number',value:p.settings.contrast,min:.5,max:2,step:.05},quality:{label:'Quality',type:'select',options:{low:'Low',medium:'Medium',high:'High'},value:p.settings.quality}
    }, f=>{
      p.settings.fogEnabled=!!f.fog;p.settings.fogColor=color(f.fogc,p.settings.fogColor);p.settings.fogNear=Number(f.near);p.settings.fogFar=Number(f.far);p.settings.exposure=Number(f.exposure);p.settings.contrast=Number(f.contrast);p.settings.quality=f.quality;applyFog();Preview?.all?.forEach(v=>{if(v.renderer)v.renderer.toneMappingExposure=p.settings.exposure;if(v.canvas)v.canvas.style.filter='contrast('+p.settings.contrast+')'});applyAll();msg('BRFX atmosphere updated');
    });
    const featureManager = () => dialog('brfx_features','BRFX — Feature Settings',{
      lighting:{label:'Lighting Features',type:'checkbox',value:p.visibility.lighting},skybox:{label:'Skybox Features',type:'checkbox',value:p.visibility.skybox},atmosphere:{label:'Atmosphere Features',type:'checkbox',value:p.visibility.atmosphere},rendering:{label:'Rendering Features',type:'checkbox',value:p.visibility.rendering}
    }, f=>{Object.assign(p.visibility,{lighting:!!f.lighting,skybox:!!f.skybox,atmosphere:!!f.atmosphere,rendering:!!f.rendering});try{localStorage.setItem('brfx_feature_visibility',JSON.stringify(p.visibility));}catch(e){};buildMenu();msg('BRFX feature visibility updated');});
    const toonSettings = () => dialog('brfx_toon','BRFX — Toon Shading',{enabled:{label:'Enable Toon Shading',type:'checkbox',value:p.toonEnabled},bands:{label:'Shading Bands',type:'number',value:p.toonBands,min:2,max:8,step:1},strength:{label:'Toon Strength',type:'number',value:p.toonStrength,min:0,max:1,step:.05}}, f=>{p.toonEnabled=!!f.enabled;p.toonBands=Number(f.bands)||4;p.toonStrength=Number(f.strength)||0;applyToon();Preview?.all?.forEach(v=>v.render?.());msg(p.toonEnabled?'BRFX Toon Shading enabled':'BRFX Toon Shading disabled');});
    const master = () => dialog('brfx_master','BRFX — On / Off',{enabled:{label:'BRFX Enabled',type:'checkbox',value:p.enabled},mobile:{label:'Mobile Optimization',type:'checkbox',value:p.mobile}}, f=>{if(!f.enabled)restore();else{p.enabled=true;mobile(!!f.mobile);}if(f.enabled)mobile(!!f.mobile);buildMenu();msg(p.enabled?'BRFX enabled':'BRFX disabled');});
    const outlineSettings = () => dialog('brfx_outline','BRFX — Silhouette Outlines',{enabled:{label:'Enable Silhouette Outlines',type:'checkbox',value:p.outlineEnabled},color:{label:'Outline Color',type:'color',value:p.outlineColor},thickness:{label:'Outline Thickness',type:'number',value:p.outlineThickness,min:.01,max:.5,step:.01}}, f=>{p.outlineEnabled=!!f.enabled;p.outlineColor=color(f.color,p.outlineColor);p.outlineThickness=Number(f.thickness)||.08;applyOutlines();Preview?.all?.forEach(v=>v.render?.());msg(p.outlineEnabled?'BRFX outlines enabled':'BRFX outlines disabled');});
    const makeAction = (id,name,icon,click) => { try { BarItems?.[id]?.delete?.(); return new Action(id,{name,icon,click}); } catch(e) { return null; } };
    p.actions = [
      makeAction('brfx_master','BRFX — On / Off','power_settings_new',master),
      makeAction('brfx_custom','BRFX-Costom Light Settings','tune',customSettings),
      makeAction('brfx_environment','BRFX — Real Environment Light','light_mode',()=>{p.settings.lightType='environment';p.enabled=true;createEnvironmentLight();msg('BRFX environment light enabled');}),
      makeAction('brfx_sky','BRFX — Procedural Sky Dome','cloud',()=>{p.settings.skyEnabled=true;createSky();msg('BRFX procedural sky enabled');}),
      makeAction('brfx_remove_sky','BRFX — Remove Sky','clear',()=>{p.settings.skyEnabled=false;removeSky();}),
      makeAction('brfx_atmosphere','BRFX — Atmosphere Settings','cloud_queue',atmosphere),
      makeAction('brfx_remove_fog','BRFX — Remove Fog','filter_alt_off',()=>{p.settings.fogEnabled=false;applyFog();msg('BRFX fog removed');}),
      makeAction('brfx_outline','BRFX — Silhouette Outlines','border_outer',outlineSettings),
      makeAction('brfx_toon_settings','BRFX — Toon Shading','gradient',toonSettings),
      makeAction('brfx_restore','BRFX — Restore Lighting','restore',()=>{restore();p.enabled=true;msg('BRFX effects restored');})
    ];
    const category = id => /sky/.test(id) ? 'skybox' : /fog|atmosphere|exposure|contrast|rotation/.test(id) ? 'atmosphere' : /outline|toon|bloom|ao/.test(id) ? 'rendering' : 'lighting';
    const buildMenu = () => {
      try {
        const tools = MenuBar?.menus?.tools;
        if(!tools || !Array.isArray(tools.structure)) return;
        tools.structure = tools.structure.filter(x => !String(x?.id || x?.action?.id || '').startsWith('brfx_') && x?.id !== 'brfx_menu');
        const groups={lighting:[],skybox:[],atmosphere:[],rendering:[]};
        p.actions.filter(Boolean).forEach(a=>{if(a.id==='brfx_master'||a.id==='brfx_restore'||p.visibility[category(a.id)]!==false)groups[category(a.id)].push(a);});
        const items=[];
        if(BarItems?.brfx_master) items.push(BarItems.brfx_master);
        if(BarItems?.brfx_custom) items.push(BarItems.brfx_custom);
        items.push({id:'brfx_feature_settings',name:'⚙ Feature Settings',icon:'settings',click:featureManager});
        Object.keys(groups).forEach(k=>{if(groups[k].length)items.push({id:'brfx_category_'+k,name:k[0].toUpperCase()+k.slice(1),icon:k==='lighting'?'light_mode':k==='skybox'?'cloud':k==='atmosphere'?'cloud_queue':'auto_awesome',children:groups[k]});});
        tools.structure.push({id:'brfx_menu',name:'BRFX',icon:'auto_awesome',children:items});
        tools.update?.(true);
      } catch(e) { console.error('BRFX menu',e); }
    };
    buildMenu();
    setTimeout(buildMenu,300);
    setTimeout(buildMenu,1000);
    msg('BRFX 1.6.1 ready');
  },
  onunload() {
    try {
      clearInterval(this._lightTimer); clearInterval(this._outlineTimer);
      this.enabled=false;
      this.light?.parent?.remove(this.light); this.hemi?.parent?.remove(this.hemi); this.billboard?.remove?.(); this.sky?.parent?.remove(this.sky);
      this.outlines?.forEach(o=>{o.mesh?.parent?.remove(o.mesh);o.mat?.dispose?.();});
      this.toonMaterials?.forEach(m=>{const d=m.userData||{};if(d.brfxToonWrapper&&m.onBeforeCompile===d.brfxToonWrapper)m.onBeforeCompile=d.brfxToonOriginal||function(){};m.needsUpdate=true;});
      const tools=MenuBar?.menus?.tools;if(tools?.structure)tools.structure=tools.structure.filter(x=>x?.id!=='brfx_menu'&&!String(x?.id||'').startsWith('brfx_'));tools?.update?.(true);
      this.actions?.forEach(a=>a?.delete?.());
    } catch(e) {}
  }
});
