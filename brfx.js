/*
 * BRFX — Blockbench Render FX
 * Custom Light Settings Pass v0.9.2
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Render FX',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Custom light types, colors, intensity, and a fully customizable 3-color skybox.',
    version: '0.9.2',
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
            lightType: 'default',
            lightColor: '#ffad52',
            lightIntensity: 1.0,
            lightSide: 0,
            environmentIntensity: 4.0,
            environmentDistance: 40,
            skyEnabled: true,
            skyTop: '#4f82c4',
            skyHorizon: '#ffd6a0',
            skyBottom: '#6f5748',
        };

        plugin.refresh = function() {
            if (typeof Canvas.updateAllFaces === 'function') Canvas.updateAllFaces();
            if (typeof Preview !== 'undefined' && Preview.selected && Preview.selected.render) {
                try { Preview.selected.render(); } catch (error) { /* viewport may be between renders */ }
            }
        };

        plugin.getScene = function() {
            return typeof scene !== 'undefined' ? scene : (window.scene || null);
        };

        plugin.getModelCenter = function() {
            const center = new THREE.Vector3(0, 0, 0);
            const box = new THREE.Box3();
            let found = false;
            if (typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)) {
                Outliner.elements.forEach(element => {
                    if (!element || !element.mesh || element.visibility === false) return;
                    element.mesh.updateMatrixWorld(true);
                    const elementBox = new THREE.Box3().setFromObject(element.mesh);
                    if (!elementBox.isEmpty()) {
                        box.union(elementBox);
                        found = true;
                    }
                });
            }
            if (found) box.getCenter(center);
            return center;
        };

        plugin.removeLightBillboard = function() {
            if (plugin.lightBillboard) {
                try { plugin.lightBillboard.remove(); } catch (error) { /* already removed */ }
                plugin.lightBillboard = null;
            }
        };

        plugin.getBillboardPosition = function(billboard) {
            if (!billboard) return null;
            if (Array.isArray(billboard.position) && billboard.position.length >= 3) {
                return new THREE.Vector3(
                    Number(billboard.position[0]) || 0,
                    Number(billboard.position[1]) || 0,
                    Number(billboard.position[2]) || 0
                );
            }
            if (typeof billboard.getWorldCenter === 'function') {
                const position = billboard.getWorldCenter();
                if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
                    return position.clone();
                }
            }
            return null;
        };

        plugin.getBillboardScale = function(billboard) {
            if (!billboard || !Array.isArray(billboard.size) || billboard.size.length < 2) return 1;
            const width = Math.abs(Number(billboard.size[0]) || 0);
            const height = Math.abs(Number(billboard.size[1]) || 0);
            const average = (width + height) / 2;
            return Math.max(0.1, average / plugin.baseBillboardSize);
        };

        plugin.syncLightToBillboard = function() {
            if (!plugin.lightBillboard || !plugin.sceneLights.length) return;
            const light = plugin.sceneLights[0];
            if (!light) return;
            const position = plugin.getBillboardPosition(plugin.lightBillboard);
            if (!position) return;
            const scale = plugin.getBillboardScale(plugin.lightBillboard);
            light.position.copy(position);
            light.distance = plugin.baseLightDistance * scale;
            light.updateMatrixWorld(true);
            plugin.refresh();
        };

        plugin.startLightSync = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = setInterval(() => plugin.syncLightToBillboard(), 50);
        };

        plugin.createLightBillboard = function(position, distance) {
            plugin.removeLightBillboard();
            if (typeof Billboard === 'undefined') {
                Blockbench.showQuickMessage('BRFX: Blockbench billboards are unavailable in this model format', 3500);
                return null;
            }
            if (typeof Billboard.isTypePermitted === 'function' && !Billboard.isTypePermitted('billboard')) {
                Blockbench.showQuickMessage('BRFX: this model format does not permit billboard elements', 3500);
                return null;
            }
            const vector = position || plugin.getModelCenter().clone().add(new THREE.Vector3(0, 8, 6));
            plugin.baseLightDistance = Number.isFinite(distance) ? distance : 40;
            plugin.baseBillboardSize = 4;
            const billboard = new Billboard({
                name: 'BRFX Light Source',
                position: [vector.x, vector.y, vector.z],
                size: [plugin.baseBillboardSize, plugin.baseBillboardSize],
                visibility: true,
                export: false,
            }).init();
            billboard.addTo();
            billboard.select();
            plugin.lightBillboard = billboard;
            plugin.startLightSync();
            return billboard;
        };

        plugin.removeSceneLights = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = null;
            plugin.sceneLights.forEach(light => {
                if (light && light.parent) light.parent.remove(light);
                if (light && light.target && light.target.parent) light.target.parent.remove(light.target);
            });
            plugin.sceneLights.length = 0;
            plugin.removeLightBillboard();
            plugin.refresh();
        };

        plugin.addPointLight = function(options = {}) {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined' || !THREE.PointLight) {
                Blockbench.showQuickMessage('BRFX: viewport scene is not available', 3000);
                return null;
            }
            plugin.removeSceneLights();
            const color = new THREE.Color(options.color || '#ffe0b2');
            const intensity = Number.isFinite(options.intensity) ? options.intensity : 3.0;
            const distance = Number.isFinite(options.distance) ? options.distance : 32;
            plugin.baseLightDistance = distance;
            const light = new THREE.PointLight(color, intensity, distance, 2);
            light.name = 'BRFX_Environment_Point_Light';
            light.castShadow = false;
            const position = options.position || plugin.getModelCenter().clone().add(new THREE.Vector3(0, 8, 6));
            light.position.copy(position);
            targetScene.add(light);
            plugin.sceneLights.push(light);
            plugin.createLightBillboard(position, distance);
            plugin.refresh();
            return light;
        };

        plugin.addSoftEnvironment = function() {
            const center = plugin.getModelCenter();
            plugin.addPointLight({ color: '#ffd7ad', intensity: 4.0, distance: 40, position: center.clone().add(new THREE.Vector3(0, 8, 6)) });
            if (typeof Sun !== 'undefined' && Sun) {
                Sun.color.set('#fff1df');
                if (typeof Sun.intensity === 'number') Sun.intensity = 0.65;
            }
            Blockbench.showQuickMessage('BRFX: Light Source billboard created — move or scale it to control the light', 3500);
        };

        plugin.addCoolEnvironment = function() {
            const center = plugin.getModelCenter();
            plugin.addPointLight({ color: '#9ec5ff', intensity: 4.0, distance: 40, position: center.clone().add(new THREE.Vector3(0, 8, -6)) });
            if (typeof Sun !== 'undefined' && Sun) {
                Sun.color.set('#dbe9ff');
                if (typeof Sun.intensity === 'number') Sun.intensity = 0.45;
            }
            Blockbench.showQuickMessage('BRFX: Cool Light Source billboard created — move or scale it to control the light', 3500);
        };

        plugin.removeSkyDome = function() {
            if (plugin.skyDome) {
                const sky = plugin.skyDome;
                if (sky.parent) sky.parent.remove(sky);
                if (sky.geometry && typeof sky.geometry.dispose === 'function') sky.geometry.dispose();
                if (sky.material && typeof sky.material.dispose === 'function') sky.material.dispose();
                plugin.skyDome = null;
            }
            plugin.refresh();
        };

        plugin.createSkyDome = function(colors = {}) {
            const targetScene = plugin.getScene();
            if (!targetScene || typeof THREE === 'undefined') {
                Blockbench.showQuickMessage('BRFX: viewport scene is not available for the skybox', 3000);
                return null;
            }
            plugin.removeSkyDome();

            const topColor = colors.top || plugin.customSettings.skyTop;
            const horizonColor = colors.horizon || plugin.customSettings.skyHorizon;
            const bottomColor = colors.bottom || plugin.customSettings.skyBottom;

            const geometry = new THREE.BoxGeometry(2, 2, 2);
            const vertexShader = `
                varying vec3 vDirection;
                void main() {
                    vec3 direction = position;
                    vDirection = normalize(direction);
                    mat4 viewNoTranslation = viewMatrix;
                    viewNoTranslation[3][0] = 0.0;
                    viewNoTranslation[3][1] = 0.0;
                    viewNoTranslation[3][2] = 0.0;
                    gl_Position = projectionMatrix * viewNoTranslation * vec4(position, 1.0);
                    gl_Position.z = gl_Position.w;
                }
            `;
            const fragmentShader = `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 bottomColor;
                varying vec3 vDirection;
                void main() {
                    float h = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
                    vec3 color;
                    if (h < 0.5) {
                        float t = smoothstep(0.0, 0.5, h);
                        color = mix(bottomColor, horizonColor, t);
                    } else {
                        float t = smoothstep(0.5, 1.0, h);
                        color = mix(horizonColor, topColor, t);
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `;
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    topColor: { value: new THREE.Color(topColor) },
                    horizonColor: { value: new THREE.Color(horizonColor) },
                    bottomColor: { value: new THREE.Color(bottomColor) },
                },
                vertexShader,
                fragmentShader,
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: false,
                fog: false,
            });
            const skybox = new THREE.Mesh(geometry, material);
            skybox.name = 'BRFX_Procedural_Sky_Dome';
            skybox.frustumCulled = false;
            skybox.renderOrder = -100000;
            targetScene.add(skybox);
            plugin.skyDome = skybox;
            plugin.refresh();
            return skybox;
        };

        plugin.updateSkyColors = function(top, horizon, bottom) {
            plugin.customSettings.skyTop = top;
            plugin.customSettings.skyHorizon = horizon;
            plugin.customSettings.skyBottom = bottom;
            if (plugin.skyDome && plugin.skyDome.material && plugin.skyDome.material.uniforms) {
                plugin.skyDome.material.uniforms.topColor.value.set(top);
                plugin.skyDome.material.uniforms.horizonColor.value.set(horizon);
                plugin.skyDome.material.uniforms.bottomColor.value.set(bottom);
                plugin.skyDome.material.needsUpdate = true;
                plugin.refresh();
            }
        };

        plugin.applyCustomLight = function(settings, showMessage = true) {
            plugin.customSettings = Object.assign(plugin.customSettings, settings);

            if (plugin.customSettings.lightType === 'environment') {
                const center = plugin.getModelCenter();
                plugin.addPointLight({
                    color: plugin.customSettings.lightColor,
                    intensity: Math.max(0, Number(plugin.customSettings.environmentIntensity) || 0),
                    distance: Math.max(1, Number(plugin.customSettings.environmentDistance) || 1),
                    position: center.clone().add(new THREE.Vector3(0, 8, 6)),
                });
                if (typeof Sun !== 'undefined' && Sun) {
                    Sun.color.set(plugin.customSettings.lightColor);
                    if (typeof Sun.intensity === 'number') Sun.intensity = 0.65;
                }
            } else {
                plugin.removeSceneLights();
                Canvas.global_light_color.set(plugin.customSettings.lightColor);
                Canvas.global_light_side = Number(plugin.customSettings.lightSide) || 0;
                if (typeof Sun !== 'undefined' && Sun) {
                    if (Sun.color) Sun.color.set(plugin.customSettings.lightColor);
                    if (typeof Sun.intensity === 'number') Sun.intensity = Math.max(0, Number(plugin.customSettings.lightIntensity) || 0);
                }
                plugin.refresh();
            }

            if (plugin.customSettings.skyEnabled) {
                if (plugin.skyDome) {
                    plugin.updateSkyColors(plugin.customSettings.skyTop, plugin.customSettings.skyHorizon, plugin.customSettings.skyBottom);
                } else {
                    plugin.createSkyDome({
                        top: plugin.customSettings.skyTop,
                        horizon: plugin.customSettings.skyHorizon,
                        bottom: plugin.customSettings.skyBottom,
                    });
                }
            } else {
                plugin.removeSkyDome();
            }

            if (showMessage) Blockbench.showQuickMessage('BRFX: Custom Light settings applied', 2500);
        };

        plugin.openCustomLight = function() {
            if (plugin.customDialog) {
                try { plugin.customDialog.hide(); } catch (error) { /* dialog may already be closed */ }
            }
            plugin.customDialog = new Dialog({
                id: 'brfx_custom_light_dialog',
                title: 'BRFX-Costom Light',
                width: 520,
                form: {
                    lightType: {
                        label: 'Light Type',
                        description: 'Choose between Blockbench-style default lighting and a real movable environment light.',
                        type: 'select',
                        options: {
                            default: 'Default Light (Sunlight)',
                            environment: 'Environmental Light (Real Point Light)',
                        },
                        value: plugin.customSettings.lightType,
                    },
                    lightColor: {
                        label: 'Light Color',
                        type: 'color',
                        value: plugin.customSettings.lightColor,
                    },
                    lightSide: {
                        label: 'Light Direction',
                        type: 'select',
                        options: {
                            '0': 'Sun / Front',
                            '1': 'Moon / Back',
                        },
                        value: String(plugin.customSettings.lightSide),
                        condition: form => form.lightType === 'default',
                    },
                    lightIntensity: {
                        label: 'Default Light Intensity',
                        type: 'number',
                        value: plugin.customSettings.lightIntensity,
                        min: 0,
                        max: 5,
                        step: 0.05,
                        condition: form => form.lightType === 'default',
                    },
                    environmentIntensity: {
                        label: 'Environment Intensity',
                        type: 'number',
                        value: plugin.customSettings.environmentIntensity,
                        min: 0,
                        max: 20,
                        step: 0.1,
                        condition: form => form.lightType === 'environment',
                    },
                    environmentDistance: {
                        label: 'Environment Range',
                        type: 'number',
                        value: plugin.customSettings.environmentDistance,
                        min: 1,
                        max: 500,
                        step: 1,
                        condition: form => form.lightType === 'environment',
                    },
                    skyEnabled: {
                        label: 'Enable Custom Skybox',
                        type: 'checkbox',
                        value: plugin.customSettings.skyEnabled,
                    },
                    skyTop: {
                        label: 'Sky Top Color',
                        type: 'color',
                        value: plugin.customSettings.skyTop,
                        condition: form => form.skyEnabled,
                    },
                    skyHorizon: {
                        label: 'Sky Horizon Color',
                        type: 'color',
                        value: plugin.customSettings.skyHorizon,
                        condition: form => form.skyEnabled,
                    },
                    skyBottom: {
                        label: 'Sky Bottom Color',
                        type: 'color',
                        value: plugin.customSettings.skyBottom,
                        condition: form => form.skyEnabled,
                    },
                },
                onConfirm(result) {
                    plugin.applyCustomLight({
                        lightType: result.lightType,
                        lightColor: result.lightColor,
                        lightSide: Number(result.lightSide) || 0,
                        lightIntensity: Number(result.lightIntensity) || 0,
                        environmentIntensity: Number(result.environmentIntensity) || 0,
                        environmentDistance: Number(result.environmentDistance) || 40,
                        skyEnabled: !!result.skyEnabled,
                        skyTop: result.skyTop,
                        skyHorizon: result.skyHorizon,
                        skyBottom: result.skyBottom,
                    });
                },
            });
            plugin.customDialog.show();
        };

        plugin.restoreLight = function(showMessage = true) {
            plugin.removeSceneLights();
            Canvas.global_light_color.copy(plugin.originalLightColor);
            Canvas.global_light_side = plugin.originalLightSide;
            if (typeof Sun !== 'undefined' && Sun) {
                if (Sun.color) Sun.color.copy(Canvas.global_light_color);
                if (plugin.originalSunIntensity !== null && typeof Sun.intensity === 'number') Sun.intensity = plugin.originalSunIntensity;
            }
            plugin.refresh();
            if (showMessage) Blockbench.showQuickMessage('BRFX: Blockbench lighting restored', 2500);
        };

        plugin.warmAction = new Action('brfx_warm_light', {
            name: 'BRFX — Warm Sun', description: 'Strong golden ambient light for a warm, sunny look.', icon: 'wb_sunny',
            click() { plugin.removeSceneLights(); Canvas.global_light_color.set('#ffad52'); Canvas.global_light_side = 0; plugin.refresh(); Blockbench.showQuickMessage('BRFX: Warm Sun lighting enabled', 2500); },
        });
        plugin.neutralAction = new Action('brfx_neutral_light', {
            name: 'BRFX — Neutral Daylight', description: 'Restore a clean neutral daylight tint.', icon: 'light_mode',
            click() { plugin.removeSceneLights(); Canvas.global_light_color.set('#ffffff'); Canvas.global_light_side = 0; plugin.refresh(); Blockbench.showQuickMessage('BRFX: Neutral Daylight enabled', 2500); },
        });
        plugin.coolAction = new Action('brfx_cool_light', {
            name: 'BRFX — Moonlight', description: 'Strong blue ambient light for a cool nighttime look.', icon: 'ac_unit',
            click() { plugin.removeSceneLights(); Canvas.global_light_color.set('#6ea8ff'); Canvas.global_light_side = 1; plugin.refresh(); Blockbench.showQuickMessage('BRFX: Moonlight lighting enabled', 2500); },
        });
        plugin.cinematicAction = new Action('brfx_cinematic_light', {
            name: 'BRFX — Cinematic Purple', description: 'A vivid purple-blue ambient tint for stylized scenes.', icon: 'movie',
            click() { plugin.removeSceneLights(); Canvas.global_light_color.set('#a878ff'); Canvas.global_light_side = 1; plugin.refresh(); Blockbench.showQuickMessage('BRFX: Cinematic Purple lighting enabled', 2500); },
        });
        plugin.environmentAction = new Action('brfx_real_environment', {
            name: 'BRFX — Real Environment Light', description: 'Create a real point light with a movable and resizable BRFX Light Source billboard.', icon: 'wb_sunny',
            click() { plugin.addSoftEnvironment(); },
        });
        plugin.coolEnvironmentAction = new Action('brfx_real_cool_environment', {
            name: 'BRFX — Real Cool Environment', description: 'Create a cool point light with a movable and resizable BRFX Light Source billboard.', icon: 'nightlight',
            click() { plugin.addCoolEnvironment(); },
        });
        plugin.customLightAction = new Action('brfx_custom_light', {
            name: 'BRFX-Costom Light',
            description: 'Customize the light type, light color, intensity, and 3-color skybox gradient.',
            icon: 'tune',
            click() { plugin.openCustomLight(); },
        });
        plugin.skyAction = new Action('brfx_sky_dome', {
            name: 'BRFX — Procedural Sky Dome',
            description: 'Create a stable 3-color procedural skybox that follows camera rotation and is not limited by preview zoom distance.',
            icon: 'cloud',
            click() { plugin.createSkyDome(); Blockbench.showQuickMessage('BRFX: Stable 3-color Skybox enabled', 2500); },
        });
        plugin.restoreSkyAction = new Action('brfx_remove_sky_dome', {
            name: 'BRFX — Remove Sky Dome',
            description: 'Remove the BRFX procedural skybox.',
            icon: 'hide_source',
            click() { plugin.removeSkyDome(); Blockbench.showQuickMessage('BRFX: Skybox removed', 2500); },
        });
        plugin.restoreAction = new Action('brfx_restore_light', {
            name: 'BRFX — Restore Lighting', description: 'Remove BRFX scene lights and their control billboard.', icon: 'restart_alt',
            click() { plugin.restoreLight(); },
        });

        if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.tools) {
            MenuBar.menus.tools.addAction(plugin.warmAction);
            MenuBar.menus.tools.addAction(plugin.neutralAction);
            MenuBar.menus.tools.addAction(plugin.coolAction);
            MenuBar.menus.tools.addAction(plugin.cinematicAction);
            MenuBar.menus.tools.addAction(plugin.environmentAction);
            MenuBar.menus.tools.addAction(plugin.coolEnvironmentAction);
            MenuBar.menus.tools.addAction(plugin.customLightAction);
            MenuBar.menus.tools.addAction(plugin.skyAction);
            MenuBar.menus.tools.addAction(plugin.restoreSkyAction);
            MenuBar.menus.tools.addAction(plugin.restoreAction);
        }

        Canvas.global_light_color.set('#ffad52');
        Canvas.global_light_side = 0;
        plugin.refresh();
    },

    onunload() {
        const plugin = this;
        if (plugin.customDialog) {
            try { plugin.customDialog.hide(); } catch (error) { /* already closed */ }
            plugin.customDialog = null;
        }
        if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
        plugin.lightSyncTimer = null;
        if (plugin.removeSceneLights) plugin.removeSceneLights();
        if (plugin.removeSkyDome) plugin.removeSkyDome();
        if (plugin.originalLightColor && typeof Canvas !== 'undefined') {
            Canvas.global_light_color.copy(plugin.originalLightColor);
            Canvas.global_light_side = plugin.originalLightSide;
            if (typeof Sun !== 'undefined' && Sun) {
                if (Sun.color) Sun.color.copy(plugin.originalLightColor);
                if (plugin.originalSunIntensity !== null && typeof Sun.intensity === 'number') Sun.intensity = plugin.originalSunIntensity;
            }
        }
        [
            plugin.warmAction,
            plugin.neutralAction,
            plugin.coolAction,
            plugin.cinematicAction,
            plugin.environmentAction,
            plugin.coolEnvironmentAction,
            plugin.customLightAction,
            plugin.skyAction,
            plugin.restoreSkyAction,
            plugin.restoreAction,
        ].forEach(action => {
            if (action && typeof action.delete === 'function') action.delete();
        });
        if (plugin.refresh) plugin.refresh();
    },

    oninstall() {
        Blockbench.showQuickMessage('BRFX 0.9.2 installed — Custom Light is ready', 3000);
    },
});
