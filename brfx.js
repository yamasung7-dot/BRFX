/*
 * BRFX — Blockbench Render FX
 * Custom Sky Color Fix Pass v0.9.5
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Render FX',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Custom light types, colors, intensity, and a fully customizable 3-color skybox.',
    version: '0.9.5',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;
        plugin.sceneLights = [];
        plugin.lightBillboard = null;
        plugin.lightSyncTimer = null;
        plugin.skyDome = null;
        plugin.customDialog = null;
        plugin.originalLightColor = Canvas.global_light_color.clone();
        plugin.originalLightSide = Canvas.global_light_side;
        plugin.originalSunIntensity = (typeof Sun !== 'undefined' && Sun) ? Sun.intensity : null;
        plugin.baseLightDistance = 40;
        plugin.baseBillboardSize = 4;
        plugin.customSettings = {
            lightType: 'default', lightColor: '#ffad52', lightIntensity: 1,
            lightSide: 0, environmentIntensity: 4, environmentDistance: 40,
            skyEnabled: true, skyTop: '#4f82c4', skyHorizon: '#ffd6a0', skyBottom: '#6f5748'
        };

        // Blockbench's color form returns a tinycolor.Instance.
        // Normalize every common color representation to a CSS color string.
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
                if (typeof value.toRgb === 'function') {
                    try { return plugin.normalizeColor(value.toRgb(), fallback); } catch (error) {}
                }
                if (Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) {
                    const r = value.r <= 1 ? value.r * 255 : value.r;
                    const g = value.g <= 1 ? value.g * 255 : value.g;
                    const b = value.b <= 1 ? value.b * 255 : value.b;
                    return '#' + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
                }
            }
            return fallback;
        };

        plugin.refresh = function() {
            if (typeof Canvas.updateAllFaces === 'function') Canvas.updateAllFaces();
            if (typeof Preview !== 'undefined' && Preview.selected && Preview.selected.render) {
                try { Preview.selected.render(); } catch (error) {}
            }
        };
        plugin.getScene = function() { return typeof scene !== 'undefined' ? scene : (window.scene || null); };
        plugin.getModelCenter = function() {
            const center = new THREE.Vector3(), box = new THREE.Box3(); let found = false;
            if (typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)) Outliner.elements.forEach(element => {
                if (!element || !element.mesh || element.visibility === false) return;
                element.mesh.updateMatrixWorld(true);
                const b = new THREE.Box3().setFromObject(element.mesh);
                if (!b.isEmpty()) { box.union(b); found = true; }
            });
            if (found) box.getCenter(center);
            return center;
        };
        plugin.removeLightBillboard = function() {
            if (plugin.lightBillboard) { try { plugin.lightBillboard.remove(); } catch (error) {} plugin.lightBillboard = null; }
        };
        plugin.getBillboardPosition = function(b) {
            if (!b) return null;
            if (Array.isArray(b.position) && b.position.length >= 3) return new THREE.Vector3(Number(b.position[0]) || 0, Number(b.position[1]) || 0, Number(b.position[2]) || 0);
            if (typeof b.getWorldCenter === 'function') { const p = b.getWorldCenter(); if (p) return p.clone(); }
            return null;
        };
        plugin.getBillboardScale = function(b) {
            if (!b || !Array.isArray(b.size) || b.size.length < 2) return 1;
            return Math.max(.1, ((Math.abs(Number(b.size[0]) || 0) + Math.abs(Number(b.size[1]) || 0)) / 2) / plugin.baseBillboardSize);
        };
        plugin.syncLightToBillboard = function() {
            if (!plugin.lightBillboard || !plugin.sceneLights.length) return;
            const light = plugin.sceneLights[0], position = plugin.getBillboardPosition(plugin.lightBillboard);
            if (!light || !position) return;
            light.position.copy(position);
            light.distance = plugin.baseLightDistance * plugin.getBillboardScale(plugin.lightBillboard);
            light.updateMatrixWorld(true);
            plugin.refresh();
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
            const billboard = new Billboard({name:'BRFX Light Source', position:[v.x,v.y,v.z], size:[4,4], visibility:true, export:false}).init();
            billboard.addTo(); billboard.select(); plugin.lightBillboard = billboard; plugin.startLightSync();
            return billboard;
        };
        plugin.removeSceneLights = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = null;
            plugin.sceneLights.forEach(light => { if (light && light.parent) light.parent.remove(light); });
            plugin.sceneLights.length = 0; plugin.removeLightBillboard(); plugin.refresh();
        };
        plugin.addPointLight = function(options = {}) {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined' || !THREE.PointLight) return null;
            plugin.removeSceneLights();
            const color = new THREE.Color(plugin.normalizeColor(options.color, '#ffe0b2'));
            const intensity = Number.isFinite(options.intensity) ? options.intensity : 3;
            const distance = Number.isFinite(options.distance) ? options.distance : 32;
            plugin.baseLightDistance = distance;
            const light = new THREE.PointLight(color, intensity, distance, 2);
            light.name = 'BRFX_Environment_Point_Light'; light.castShadow = false;
            light.position.copy(options.position || plugin.getModelCenter().clone().add(new THREE.Vector3(0,8,6)));
            targetScene.add(light); plugin.sceneLights.push(light); plugin.createLightBillboard(light.position, distance); plugin.refresh();
            return light;
        };
        plugin.addSoftEnvironment = function() {
            const c = plugin.getModelCenter(); plugin.addPointLight({color:'#ffd7ad',intensity:4,distance:40,position:c.clone().add(new THREE.Vector3(0,8,6))});
            if (typeof Sun !== 'undefined' && Sun) { Sun.color.set('#fff1df'); Sun.intensity = .65; }
            Blockbench.showQuickMessage('BRFX: Light Source billboard created — move or scale it to control the light', 3500);
        };
        plugin.addCoolEnvironment = function() {
            const c = plugin.getModelCenter(); plugin.addPointLight({color:'#9ec5ff',intensity:4,distance:40,position:c.clone().add(new THREE.Vector3(0,8,-6))});
            if (typeof Sun !== 'undefined' && Sun) { Sun.color.set('#dbe9ff'); Sun.intensity = .45; }
            Blockbench.showQuickMessage('BRFX: Cool Light Source billboard created — move or scale it to control the light', 3500);
        };

        plugin.removeSkyDome = function() {
            if (plugin.skyDome) { const sky=plugin.skyDome; if(sky.parent)sky.parent.remove(sky); if(sky.geometry)sky.geometry.dispose(); if(sky.material)sky.material.dispose(); plugin.skyDome=null; }
            plugin.refresh();
        };
        plugin.createSkyDome = function(colors = {}) {
            const targetScene=plugin.getScene(); if(!targetScene || typeof THREE==='undefined') return null;
            plugin.removeSkyDome();
            const top=plugin.normalizeColor(colors.top || plugin.customSettings.skyTop,'#4f82c4');
            const horizon=plugin.normalizeColor(colors.horizon || plugin.customSettings.skyHorizon,'#ffd6a0');
            const bottom=plugin.normalizeColor(colors.bottom || plugin.customSettings.skyBottom,'#6f5748');
            const geometry=new THREE.BoxGeometry(2,2,2);
            const vertexShader=`varying vec3 vDirection; void main(){ vDirection=position; mat4 v=viewMatrix; v[3][0]=0.0; v[3][1]=0.0; v[3][2]=0.0; gl_Position=projectionMatrix*v*vec4(position,1.0); gl_Position.z=gl_Position.w; }`;
            const fragmentShader=`uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vDirection; void main(){ float h=clamp(vDirection.y*0.5+0.5,0.0,1.0); vec3 c=h<0.5?mix(bottomColor,horizonColor,smoothstep(0.0,0.5,h)):mix(horizonColor,topColor,smoothstep(0.5,1.0,h)); gl_FragColor=vec4(c,1.0); }`;
            const material=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(top)},horizonColor:{value:new THREE.Color(horizon)},bottomColor:{value:new THREE.Color(bottom)}},vertexShader,fragmentShader,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
            const skybox=new THREE.Mesh(geometry,material); skybox.name='BRFX_Procedural_Sky_Dome'; skybox.frustumCulled=false; skybox.renderOrder=-100000; targetScene.add(skybox); plugin.skyDome=skybox; plugin.refresh(); return skybox;
        };
        plugin.updateSkyColors=function(top,horizon,bottom){
            top=plugin.normalizeColor(top,plugin.customSettings.skyTop); horizon=plugin.normalizeColor(horizon,plugin.customSettings.skyHorizon); bottom=plugin.normalizeColor(bottom,plugin.customSettings.skyBottom);
            plugin.customSettings.skyTop=top; plugin.customSettings.skyHorizon=horizon; plugin.customSettings.skyBottom=bottom;
            if(plugin.skyDome && plugin.skyDome.material && plugin.skyDome.material.uniforms){
                plugin.skyDome.material.uniforms.topColor.value.set(top); plugin.skyDome.material.uniforms.horizonColor.value.set(horizon); plugin.skyDome.material.uniforms.bottomColor.value.set(bottom); plugin.refresh();
            }
        };
        plugin.applyCustomLight=function(settings,showMessage=true){
            plugin.customSettings=Object.assign(plugin.customSettings,settings);
            plugin.customSettings.lightColor=plugin.normalizeColor(plugin.customSettings.lightColor,'#ffffff');
            plugin.customSettings.skyTop=plugin.normalizeColor(plugin.customSettings.skyTop,'#4f82c4');
            plugin.customSettings.skyHorizon=plugin.normalizeColor(plugin.customSettings.skyHorizon,'#ffd6a0');
            plugin.customSettings.skyBottom=plugin.normalizeColor(plugin.customSettings.skyBottom,'#6f5748');
            if(plugin.customSettings.lightType==='environment'){
                const c=plugin.getModelCenter(); plugin.addPointLight({color:plugin.customSettings.lightColor,intensity:Math.max(0,Number(plugin.customSettings.environmentIntensity)||0),distance:Math.max(1,Number(plugin.customSettings.environmentDistance)||1),position:c.clone().add(new THREE.Vector3(0,8,6))});
                if(typeof Sun!=='undefined'&&Sun){Sun.color.set('#ffffff');Sun.intensity=0;}
            } else {
                plugin.removeSceneLights(); Canvas.global_light_color.set(plugin.customSettings.lightColor); Canvas.global_light_side=Number(plugin.customSettings.lightSide)||0;
                if(typeof Sun!=='undefined'&&Sun){Sun.color.set(plugin.customSettings.lightColor);Sun.intensity=Math.max(0,Number(plugin.customSettings.lightIntensity)||0);} plugin.refresh();
            }
            if(plugin.customSettings.skyEnabled) plugin.skyDome ? plugin.updateSkyColors(plugin.customSettings.skyTop,plugin.customSettings.skyHorizon,plugin.customSettings.skyBottom) : plugin.createSkyDome({top:plugin.customSettings.skyTop,horizon:plugin.customSettings.skyHorizon,bottom:plugin.customSettings.skyBottom}); else plugin.removeSkyDome();
            if(showMessage)Blockbench.showQuickMessage('BRFX: Custom Light settings applied',2500);
        };
        plugin.openCustomLight=function(){
            if(plugin.customDialog)try{plugin.customDialog.hide();}catch(e){}
            plugin.customDialog=new Dialog({id:'brfx_custom_light_dialog',title:'BRFX-Costom Light',width:520,form:{
                lightType:{label:'Light Type',type:'select',options:{default:'Default Light (Sunlight)',environment:'Environmental Light (Real Point Light)'},value:plugin.customSettings.lightType},
                lightColor:{label:'Light Color',type:'color',value:plugin.customSettings.lightColor},
                lightSide:{label:'Light Direction',type:'select',options:{'0':'Sun / Front','1':'Moon / Back'},value:String(plugin.customSettings.lightSide),condition:f=>f.lightType==='default'},
                lightIntensity:{label:'Default Light Intensity',type:'number',value:plugin.customSettings.lightIntensity,min:0,max:5,step:.05,condition:f=>f.lightType==='default'},
                environmentIntensity:{label:'Environment Intensity',type:'number',value:plugin.customSettings.environmentIntensity,min:0,max:20,step:.1,condition:f=>f.lightType==='environment'},
                environmentDistance:{label:'Environment Range',type:'number',value:plugin.customSettings.environmentDistance,min:1,max:500,step:1,condition:f=>f.lightType==='environment'},
                skyEnabled:{label:'Enable Custom Skybox',type:'checkbox',value:plugin.customSettings.skyEnabled},
                skyTop:{label:'Sky Top Color',type:'color',value:plugin.customSettings.skyTop,condition:f=>f.skyEnabled},
                skyHorizon:{label:'Sky Horizon Color',type:'color',value:plugin.customSettings.skyHorizon,condition:f=>f.skyEnabled},
                skyBottom:{label:'Sky Bottom Color',type:'color',value:plugin.customSettings.skyBottom,condition:f=>f.skyEnabled}
            },onConfirm(form){plugin.applyCustomLight({lightType:form.lightType,lightColor:form.lightColor,lightSide:Number(form.lightSide)||0,lightIntensity:Number(form.lightIntensity)||0,environmentIntensity:Number(form.environmentIntensity)||0,environmentDistance:Number(form.environmentDistance)||1,skyEnabled:!!form.skyEnabled,skyTop:form.skyTop,skyHorizon:form.skyHorizon,skyBottom:form.skyBottom});}}).show();
        };
        plugin.addAction=function(id,name,icon,click){const a=new Action(id,{name,icon,click});if(MenuBar&&MenuBar.menus&&MenuBar.menus.tools)MenuBar.menus.tools.addAction(a);plugin.actionIds=plugin.actionIds||[];plugin.actionIds.push(id);};
        plugin.addAction('brfx_warm_sun','BRFX — Warm Sun','wb_sunny',()=>{plugin.removeSceneLights();Canvas.global_light_color.set('#ffad52');Canvas.global_light_side=0;if(typeof Sun!=='undefined'&&Sun){Sun.color.set('#ffad52');Sun.intensity=1;}plugin.refresh();});
        plugin.addAction('brfx_neutral_daylight','BRFX — Neutral Daylight','light_mode',()=>{plugin.removeSceneLights();Canvas.global_light_color.set('#ffffff');Canvas.global_light_side=0;if(typeof Sun!=='undefined'&&Sun){Sun.color.set('#ffffff');Sun.intensity=1;}plugin.refresh();});
        plugin.addAction('brfx_moonlight','BRFX — Moonlight','nightlight',()=>{plugin.removeSceneLights();Canvas.global_light_color.set('#6ea8ff');Canvas.global_light_side=1;if(typeof Sun!=='undefined'&&Sun){Sun.color.set('#6ea8ff');Sun.intensity=.8;}plugin.refresh();});
        plugin.addAction('brfx_cinematic_purple','BRFX — Cinematic Purple','palette',()=>{plugin.removeSceneLights();Canvas.global_light_color.set('#a878ff');Canvas.global_light_side=1;if(typeof Sun!=='undefined'&&Sun){Sun.color.set('#a878ff');Sun.intensity=.9;}plugin.refresh();});
        plugin.addAction('brfx_environment_light','BRFX — Real Environment Light','lightbulb',()=>plugin.addSoftEnvironment());
        plugin.addAction('brfx_cool_environment','BRFX — Real Cool Environment','lightbulb_outline',()=>plugin.addCoolEnvironment());
        plugin.addAction('brfx_custom_light','BRFX-Costom Light','tune',()=>plugin.openCustomLight());
        plugin.addAction('brfx_sky_dome','BRFX — Procedural Sky Dome','cloud',()=>plugin.createSkyDome());
        plugin.addAction('brfx_remove_sky','BRFX — Remove Sky Dome','cloud_off',()=>plugin.removeSkyDome());
        plugin.addAction('brfx_restore_lighting','BRFX — Restore Lighting','restore',()=>{plugin.removeSceneLights();Canvas.global_light_color.copy(plugin.originalLightColor);Canvas.global_light_side=plugin.originalLightSide;if(typeof Sun!=='undefined'&&Sun){Sun.color.copy(plugin.originalLightColor);if(plugin.originalSunIntensity!==null)Sun.intensity=plugin.originalSunIntensity;}plugin.refresh();});
        plugin.createSkyDome();
    },
    onunload(){
        if(this.customDialog)try{this.customDialog.hide();}catch(e){}
        if(this.lightSyncTimer)clearInterval(this.lightSyncTimer); this.lightSyncTimer=null; this.removeLightBillboard();
        if(this.skyDome){const s=this.skyDome;if(s.parent)s.parent.remove(s);if(s.geometry)s.geometry.dispose();if(s.material)s.material.dispose();this.skyDome=null;}
        if(this.sceneLights)this.sceneLights.forEach(l=>{if(l&&l.parent)l.parent.remove(l);});
        if(this.sceneLights)this.sceneLights.length=0;
        Canvas.global_light_color.copy(this.originalLightColor);Canvas.global_light_side=this.originalLightSide;
        if(typeof Sun!=='undefined'&&Sun){Sun.color.copy(this.originalLightColor);if(this.originalSunIntensity!==null)Sun.intensity=this.originalSunIntensity;}
        if(this.actionIds)this.actionIds.forEach(id=>{try{BarItems[id]?.delete();}catch(e){}});
        if(typeof Canvas.updateAllFaces==='function')Canvas.updateAllFaces();
    }
});
