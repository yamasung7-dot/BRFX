/*
 * BRFX — Blockbench Render FX
 * Duplicate Action Cleanup Pass v1.0.1
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Render FX',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Lighting, procedural and image skyboxes, atmosphere, environment controls, and lightweight indirect lighting.',
    version: '1.0.1',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;

        // Remove actions left behind by an older BRFX instance/version.
        // Blockbench keeps BarItems globally, so a newly loaded remote version
        // can otherwise sit beside the previous version and create duplicates.
        if (typeof BarItems !== 'undefined') {
            Object.keys(BarItems).forEach(id => {
                if (typeof id === 'string' && id.indexOf('brfx_') === 0) {
                    try {
                        const oldAction = BarItems[id];
                        if (oldAction && typeof oldAction.delete === 'function') oldAction.delete();
                    } catch (error) {}
                }
            });
        }

        plugin.sceneLights = [];
        plugin.ambientLight = null;
        plugin.lightBillboard = null;
        plugin.lightSyncTimer = null;
        plugin.skyDome = null;
        plugin.skyTexture = null;
        plugin.customDialog = null;
        plugin._actions = [];
        plugin.baseLightDistance = 40;
        plugin.baseBillboardSize = 4;
        plugin.originalLightColor = (typeof Canvas !== 'undefined' && Canvas.global_light_color) ? Canvas.global_light_color.clone() : null;
        plugin.originalLightSide = (typeof Canvas !== 'undefined') ? Canvas.global_light_side : 0;
        plugin.originalSunIntensity = (typeof Sun !== 'undefined' && Sun) ? Sun.intensity : null;
        plugin.originalSceneFog = null;
        plugin.settings = {
            lightType: 'default', lightColor: '#ffad52', lightIntensity: 1, lightSide: 0,
            environmentIntensity: 4, environmentDistance: 40,
            skyMode: 'procedural', skyEnabled: true,
            skyTop: '#4f82c4', skyHorizon: '#ffd6a0', skyBottom: '#6f5748',
            skyTopWeight: 70, skyHorizonWeight: 20, skyBottomWeight: 10,
            skyImageUrl: '', skyRotation: 0,
            fogEnabled: false, fogColor: '#b8a58f', fogNear: 20, fogFar: 180,
            exposure: 1, contrast: 1, quality: 'medium', indirect: true
        };

        plugin.normalizeColor = function(value, fallback) {
            if (value == null) return fallback;
            try {
                if (typeof value.toHexString === 'function') return value.toHexString();
                if (typeof value.toHex8String === 'function') return value.toHex8String();
            } catch (error) {}
            if (value && value.isColor && typeof value.getHexString === 'function') return '#' + value.getHexString();
            if (typeof value === 'string') {
                const text = value.trim();
                if (/^#[0-9a-f]{3,8}$/i.test(text) || /^(rgb|hsl)a?\(/i.test(text) || /^[a-z]+$/i.test(text)) return text;
                if (/^[0-9a-f]{6,8}$/i.test(text)) return '#' + text;
            }
            if (value && typeof value === 'object') {
                if (typeof value.hex === 'string') return plugin.normalizeColor(value.hex, fallback);
                if (typeof value.toRgb === 'function') { try { return plugin.normalizeColor(value.toRgb(), fallback); } catch (error) {} }
                if (Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) {
                    const r = value.r <= 1 ? value.r * 255 : value.r;
                    const g = value.g <= 1 ? value.g * 255 : value.g;
                    const b = value.b <= 1 ? value.b * 255 : value.b;
                    return '#' + [r,g,b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
                }
            }
            return fallback;
        };

        plugin.refresh = function() {
            if (typeof Canvas !== 'undefined' && typeof Canvas.updateAllFaces === 'function') Canvas.updateAllFaces();
            if (typeof Preview !== 'undefined' && Preview.selected && typeof Preview.selected.render === 'function') {
                try { Preview.selected.render(); } catch (error) {}
            }
        };
        plugin.getScene = function() { return typeof scene !== 'undefined' ? scene : (window.scene || null); };
        plugin.getModelCenter = function() {
            const center = new THREE.Vector3(), box = new THREE.Box3();
            let found = false;
            if (typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)) {
                Outliner.elements.forEach(element => {
                    if (!element || !element.mesh || element.visibility === false) return;
                    try {
                        element.mesh.updateMatrixWorld(true);
                        const b = new THREE.Box3().setFromObject(element.mesh);
                        if (!b.isEmpty()) { box.union(b); found = true; }
                    } catch (error) {}
                });
            }
            if (found) box.getCenter(center);
            return center;
        };

        plugin.removeLightBillboard = function() {
            if (plugin.lightBillboard) {
                try { plugin.lightBillboard.remove(); } catch (error) {}
                plugin.lightBillboard = null;
            }
        };
        plugin.getBillboardPosition = function(b) {
            if (!b) return null;
            if (Array.isArray(b.position)) return new THREE.Vector3(Number(b.position[0]) || 0, Number(b.position[1]) || 0, Number(b.position[2]) || 0);
            if (typeof b.getWorldCenter === 'function') {
                try { const p = b.getWorldCenter(); if (p) return p.clone(); } catch (error) {}
            }
            return null;
        };
        plugin.getBillboardScale = function(b) {
            if (!b || !Array.isArray(b.size)) return 1;
            return Math.max(.1, ((Math.abs(Number(b.size[0]) || 0) + Math.abs(Number(b.size[1]) || 0)) / 2) / plugin.baseBillboardSize);
        };
        plugin.syncLightToBillboard = function() {
            if (!plugin.lightBillboard || !plugin.sceneLights.length) return;
            const light = plugin.sceneLights[0], position = plugin.getBillboardPosition(plugin.lightBillboard);
            if (!light || !position) return;
            light.position.copy(position);
            light.distance = plugin.baseLightDistance * plugin.getBillboardScale(plugin.lightBillboard);
            light.updateMatrixWorld(true);
        };
        plugin.startLightSync = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = setInterval(() => plugin.syncLightToBillboard(), 50);
        };
        plugin.createLightBillboard = function(position, distance) {
            plugin.removeLightBillboard();
            if (typeof Billboard === 'undefined' || (typeof Billboard.isTypePermitted === 'function' && !Billboard.isTypePermitted('billboard'))) return null;
            const v = position || plugin.getModelCenter().clone().add(new THREE.Vector3(0, 8, 6));
            plugin.baseLightDistance = Number.isFinite(distance) ? distance : 40;
            plugin.baseBillboardSize = 4;
            try {
                const billboard = new Billboard({name:'BRFX Light Source', position:[v.x,v.y,v.z], size:[4,4], visibility:true, export:false}).init();
                billboard.addTo();
                billboard.select();
                plugin.lightBillboard = billboard;
                plugin.startLightSync();
                return billboard;
            } catch (error) { return null; }
        };
        plugin.removeSceneLights = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = null;
            plugin.sceneLights.forEach(light => { try { if (light && light.parent) light.parent.remove(light); } catch (error) {} });
            plugin.sceneLights.length = 0;
            plugin.removeLightBillboard();
            if (plugin.ambientLight && plugin.ambientLight.parent) { try { plugin.ambientLight.parent.remove(plugin.ambientLight); } catch (error) {} }
            plugin.ambientLight = null;
        };
        plugin.addEnvironmentLights = function() {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined') return null;
            plugin.removeSceneLights();
            const c = plugin.getModelCenter();
            const quality = plugin.settings.quality === 'low' ? .75 : plugin.settings.quality === 'high' ? 1.25 : 1;
            const main = new THREE.PointLight(new THREE.Color(plugin.normalizeColor(plugin.settings.lightColor, '#ffad52')), Math.max(0, Number(plugin.settings.environmentIntensity) || 4) * quality, Math.max(1, Number(plugin.settings.environmentDistance) || 40), 2);
            main.name = 'BRFX_Environment_Point_Light';
            main.castShadow = false;
            main.position.copy(c.clone().add(new THREE.Vector3(0,8,6)));
            targetScene.add(main);
            plugin.sceneLights.push(main);
            plugin.createLightBillboard(main.position, main.distance);
            if (plugin.settings.indirect) {
                const hemi = new THREE.HemisphereLight(new THREE.Color(plugin.normalizeColor(plugin.settings.skyTop, '#4f82c4')), new THREE.Color(plugin.normalizeColor(plugin.settings.skyBottom, '#6f5748')), .45 * quality);
                hemi.name = 'BRFX_Indirect_Ambient_Light';
                hemi.position.copy(c);
                targetScene.add(hemi);
                plugin.ambientLight = hemi;
            }
            if (typeof Sun !== 'undefined' && Sun) { try { Sun.color.set('#ffffff'); Sun.intensity = 0; } catch (error) {} }
            plugin.refresh();
            return main;
        };

        plugin.removeSky = function() {
            if (!plugin.skyDome) return;
            const sky = plugin.skyDome;
            try { if (sky.parent) sky.parent.remove(sky); } catch (error) {}
            try {
                if (sky.geometry) sky.geometry.dispose();
                if (sky.material) {
                    if (sky.material.map) sky.material.map.dispose();
                    sky.material.dispose();
                }
            } catch (error) {}
            plugin.skyDome = null;
            plugin.skyTexture = null;
        };
        plugin.createProceduralSky = function() {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined') return null;
            plugin.removeSky();
            const top = plugin.normalizeColor(plugin.settings.skyTop, '#4f82c4');
            const horizon = plugin.normalizeColor(plugin.settings.skyHorizon, '#ffd6a0');
            const bottom = plugin.normalizeColor(plugin.settings.skyBottom, '#6f5748');
            const tw = Math.max(0, Math.min(100, Number(plugin.settings.skyTopWeight) || 0));
            const hw = Math.max(0, Math.min(100, Number(plugin.settings.skyHorizonWeight) || 0));
            const bw = Math.max(0, Math.min(100, Number(plugin.settings.skyBottomWeight) || 0));
            const total = Math.max(.001, tw + hw + bw);
            const topStop = (bw + tw) / total;
            const horizonStop = bw / total;
            const geometry = new THREE.BoxGeometry(2,2,2);
            const vertexShader = 'varying vec3 vDirection; void main(){vDirection=position;mat4 v=viewMatrix;v[3][0]=0.0;v[3][1]=0.0;v[3][2]=0.0;gl_Position=projectionMatrix*v*vec4(position,1.0);gl_Position.z=gl_Position.w;}';
            const fragmentShader = 'uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;uniform float topStop;uniform float horizonStop;varying vec3 vDirection;void main(){float h=clamp(vDirection.y*.5+.5,0.,1.);vec3 c;if(h<horizonStop){float t=smoothstep(0.,max(.0001,horizonStop),h);c=mix(bottomColor,horizonColor,t);}else{float t=smoothstep(horizonStop,max(horizonStop+.0001,topStop),h);c=mix(horizonColor,topColor,t);}gl_FragColor=vec4(c,1.);}';
            const material = new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(top)},horizonColor:{value:new THREE.Color(horizon)},bottomColor:{value:new THREE.Color(bottom)},topStop:{value:topStop},horizonStop:{value:horizonStop}},vertexShader,fragmentShader,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
            const sky = new THREE.Mesh(geometry, material);
            sky.name = 'BRFX_Procedural_Sky_Dome';
            sky.frustumCulled = false;
            sky.renderOrder = -100000;
            sky.rotation.y = THREE.MathUtils.degToRad(Number(plugin.settings.skyRotation) || 0);
            targetScene.add(sky);
            plugin.skyDome = sky;
            return sky;
        };
        plugin.loadImageSky = function(url) {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined' || !url) return null;
            plugin.removeSky();
            try {
                const loader = new THREE.TextureLoader();
                loader.setCrossOrigin('anonymous');
                loader.load(url, texture => {
                    texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    const geometry = new THREE.SphereGeometry(500, 48, 32);
                    const material = new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
                    const sky = new THREE.Mesh(geometry, material);
                    sky.name = 'BRFX_Image_Skybox';
                    sky.frustumCulled = false;
                    sky.renderOrder = -100000;
                    sky.rotation.y = THREE.MathUtils.degToRad(Number(plugin.settings.skyRotation) || 0);
                    targetScene.add(sky);
                    plugin.skyDome = sky;
                    plugin.skyTexture = texture;
                    plugin.refresh();
                }, undefined, () => Blockbench.showQuickMessage('BRFX: Could not load image skybox URL',3000));
                return true;
            } catch (error) { return null; }
        };
        plugin.applyAtmosphere = function() {
            const targetScene = plugin.getScene();
            if (!targetScene) return;
            if (plugin.originalSceneFog === null) plugin.originalSceneFog = targetScene.fog || null;
            if (plugin.settings.fogEnabled && typeof THREE !== 'undefined') {
                targetScene.fog = new THREE.Fog(new THREE.Color(plugin.normalizeColor(plugin.settings.fogColor, '#b8a58f')), Math.max(0, Number(plugin.settings.fogNear)||20), Math.max(1, Number(plugin.settings.fogFar)||180));
            } else targetScene.fog = plugin.originalSceneFog;
        };
        plugin.applySky = function() {
            if (!plugin.settings.skyEnabled) { plugin.removeSky(); return; }
            if (plugin.settings.skyMode === 'image' && plugin.settings.skyImageUrl) plugin.loadImageSky(plugin.settings.skyImageUrl);
            else plugin.createProceduralSky();
        };
        plugin.applyAll = function(showMessage=true) {
            plugin.settings.lightColor = plugin.normalizeColor(plugin.settings.lightColor, '#ffad52');
            plugin.settings.skyTop = plugin.normalizeColor(plugin.settings.skyTop, '#4f82c4');
            plugin.settings.skyHorizon = plugin.normalizeColor(plugin.settings.skyHorizon, '#ffd6a0');
            plugin.settings.skyBottom = plugin.normalizeColor(plugin.settings.skyBottom, '#6f5748');
            plugin.settings.fogColor = plugin.normalizeColor(plugin.settings.fogColor, '#b8a58f');
            if (plugin.settings.lightType === 'environment') {
                plugin.addEnvironmentLights();
            } else {
                plugin.removeSceneLights();
                if (typeof Canvas !== 'undefined' && Canvas.global_light_color) Canvas.global_light_color.set(plugin.settings.lightColor);
                if (typeof Canvas !== 'undefined') Canvas.global_light_side = Number(plugin.settings.lightSide) || 0;
                if (typeof Sun !== 'undefined' && Sun) {
                    try { Sun.color.set(plugin.settings.lightColor); Sun.intensity = Math.max(0, Number(plugin.settings.lightIntensity) || 0); } catch (error) {}
                }
            }
            plugin.applySky();
            plugin.applyAtmosphere();
            plugin.refresh();
            if (showMessage) Blockbench.showQuickMessage('BRFX 1.0: Environment applied',2500);
        };
        plugin.openSettings = function() {
            if (plugin.customDialog) try { plugin.customDialog.hide(); } catch (error) {}
            plugin.customDialog = new Dialog({id:'brfx_v1_settings',title:'BRFX 1.0 — Environment Settings',width:560,form:{
                lightType:{label:'Light Type',type:'select',options:{default:'Default Light (Sunlight)',environment:'Environmental Light (Real Point Light)'},value:plugin.settings.lightType},
                lightColor:{label:'Light Color',type:'color',value:plugin.settings.lightColor},
                lightSide:{label:'Light Direction',type:'select',options:{'0':'Sun / Front','1':'Moon / Back'},value:String(plugin.settings.lightSide),condition:f=>f.lightType==='default'},
                lightIntensity:{label:'Sunlight Intensity',type:'number',value:plugin.settings.lightIntensity,min:0,max:5,step:.05,condition:f=>f.lightType==='default'},
                environmentIntensity:{label:'Environment Intensity',type:'number',value:plugin.settings.environmentIntensity,min:0,max:20,step:.1,condition:f=>f.lightType==='environment'},
                environmentDistance:{label:'Environment Range',type:'number',value:plugin.settings.environmentDistance,min:1,max:500,step:1,condition:f=>f.lightType==='environment'},
                indirect:{label:'Indirect Ambient Light Approximation',type:'checkbox',value:plugin.settings.indirect,condition:f=>f.lightType==='environment'},
                quality:{label:'Quality Preset',type:'select',options:{low:'Low / Mobile',medium:'Medium',high:'High'},value:plugin.settings.quality},
                skyEnabled:{label:'Enable Skybox',type:'checkbox',value:plugin.settings.skyEnabled},
                skyMode:{label:'Skybox Type',type:'select',options:{procedural:'Procedural 3-Color',image:'Image Skybox'},value:plugin.settings.skyMode,condition:f=>f.skyEnabled},
                skyImageUrl:{label:'Skybox Image URL',type:'text',value:plugin.settings.skyImageUrl,condition:f=>f.skyEnabled&&f.skyMode==='image'},
                skyRotation:{label:'Sky Rotation (degrees)',type:'number',value:plugin.settings.skyRotation,min:-360,max:360,step:1,condition:f=>f.skyEnabled},
                skyTop:{label:'Main Color (Sky Top)',type:'color',value:plugin.settings.skyTop,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                skyTopWeight:{label:'Main Color Amount (%)',type:'number',value:plugin.settings.skyTopWeight,min:0,max:100,step:1,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                skyHorizon:{label:'Connection Color (Sky Horizon)',type:'color',value:plugin.settings.skyHorizon,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                skyHorizonWeight:{label:'Connection Color Amount (%)',type:'number',value:plugin.settings.skyHorizonWeight,min:0,max:100,step:1,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                skyBottom:{label:'Sky Bottom Color',type:'color',value:plugin.settings.skyBottom,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                skyBottomWeight:{label:'Bottom Color Amount (%)',type:'number',value:plugin.settings.skyBottomWeight,min:0,max:100,step:1,condition:f=>f.skyEnabled&&f.skyMode==='procedural'},
                fogEnabled:{label:'Enable Fog / Haze',type:'checkbox',value:plugin.settings.fogEnabled},
                fogColor:{label:'Fog Color',type:'color',value:plugin.settings.fogColor,condition:f=>f.fogEnabled},
                fogNear:{label:'Fog Near',type:'number',value:plugin.settings.fogNear,min:0,max:500,step:1,condition:f=>f.fogEnabled},
                fogFar:{label:'Fog Far',type:'number',value:plugin.settings.fogFar,min:1,max:1000,step:1,condition:f=>f.fogEnabled},
                exposure:{label:'Exposure',type:'number',value:plugin.settings.exposure,min:0.25,max:4,step:.05},
                contrast:{label:'Contrast',type:'number',value:plugin.settings.contrast,min:0,max:2,step:.05}
            },onConfirm(form){
                Object.assign(plugin.settings,form);
                plugin.settings.lightSide = Number(form.lightSide)||0;
                plugin.settings.skyRotation = Number(form.skyRotation)||0;
                plugin.settings.exposure = Number(form.exposure)||1;
                plugin.settings.contrast = Number(form.contrast)||1;
                plugin.applyAll();
            }});
            plugin.customDialog.show();
        };

        plugin.addAction = function(id,name,icon,click) {
            const action = new Action(id,{name,icon,click});
            if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.tools) MenuBar.menus.tools.addAction(action);
            plugin._actions.push(action);
            return action;
        };
        plugin.addAction('brfx_custom_light_settings','BRFX-Costom Light Settings','settings',()=>plugin.openSettings());
        plugin.addAction('brfx_warm_sun','BRFX — Warm Sun','wb_sunny',()=>{plugin.settings.lightType='default';plugin.settings.lightColor='#ffad52';plugin.settings.lightIntensity=1;plugin.settings.lightSide=0;plugin.applyAll();});
        plugin.addAction('brfx_neutral_daylight','BRFX — Neutral Daylight','light_mode',()=>{plugin.settings.lightType='default';plugin.settings.lightColor='#ffffff';plugin.settings.lightIntensity=1;plugin.settings.lightSide=0;plugin.applyAll();});
        plugin.addAction('brfx_moonlight','BRFX — Moonlight','nights_stay',()=>{plugin.settings.lightType='default';plugin.settings.lightColor='#6ea8ff';plugin.settings.lightIntensity=1;plugin.settings.lightSide=1;plugin.applyAll();});
        plugin.addAction('brfx_environment','BRFX — Real Environment Light','lightbulb',()=>{plugin.settings.lightType='environment';plugin.settings.lightColor='#ffd7ad';plugin.settings.environmentIntensity=4;plugin.settings.environmentDistance=40;plugin.applyAll();});
        plugin.addAction('brfx_procedural_sky','BRFX — Procedural Skybox','cloud',()=>{plugin.settings.skyEnabled=true;plugin.settings.skyMode='procedural';plugin.applySky();plugin.refresh();});
        plugin.addAction('brfx_remove_sky','BRFX — Remove Skybox','clear',()=>{plugin.settings.skyEnabled=false;plugin.removeSky();plugin.refresh();});
        plugin.addAction('brfx_restore','BRFX — Restore Lighting','restore',()=>plugin.onunload(true));
        plugin.applyAll(false);
    },

    onunload(fromRestore=false) {
        const plugin = this;
        if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
        plugin.lightSyncTimer = null;
        if (plugin.sceneLights) plugin.sceneLights.forEach(light=>{try{if(light&&light.parent)light.parent.remove(light);}catch(error){}});
        plugin.sceneLights = [];
        if (plugin.ambientLight&&plugin.ambientLight.parent){try{plugin.ambientLight.parent.remove(plugin.ambientLight);}catch(error){}}
        plugin.ambientLight = null;
        if (plugin.lightBillboard){try{plugin.lightBillboard.remove();}catch(error){}}
        plugin.lightBillboard = null;
        if (plugin.skyDome){try{if(plugin.skyDome.parent)plugin.skyDome.parent.remove(plugin.skyDome);if(plugin.skyDome.geometry)plugin.skyDome.geometry.dispose();if(plugin.skyDome.material){if(plugin.skyDome.material.map)plugin.skyDome.material.map.dispose();plugin.skyDome.material.dispose();}}catch(error){}}
        plugin.skyDome = null;
        const targetScene = plugin.getScene ? plugin.getScene() : null;
        if (targetScene && plugin.originalSceneFog !== null) targetScene.fog = plugin.originalSceneFog;
        if (typeof Canvas !== 'undefined'&&Canvas&&plugin.originalLightColor){Canvas.global_light_color.copy(plugin.originalLightColor);Canvas.global_light_side=plugin.originalLightSide;}
        if (typeof Sun !== 'undefined'&&Sun){try{if(plugin.originalLightColor)Sun.color.copy(plugin.originalLightColor);if(plugin.originalSunIntensity!==null)Sun.intensity=plugin.originalSunIntensity;}catch(error){}}
        if (plugin.customDialog) try { plugin.customDialog.hide(); } catch (error) {}
        if (plugin._actions) plugin._actions.forEach(action=>{try{if(action&&typeof action.delete==='function')action.delete();}catch(error){}});
        plugin._actions = [];
        if (!fromRestore&&typeof Canvas!=='undefined'&&typeof Canvas.updateAllFaces==='function') Canvas.updateAllFaces();
    }
});
