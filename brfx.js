/*
 * BRFX — Blockbench Render FX
 * Scene Lighting Pass v0.8.0
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Scene Lighting',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Scene-aware lighting with a movable and resizable Blockbench billboard light-source control.',
    version: '0.8.0',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;
        plugin.sceneLights = [];
        plugin.lightBillboard = null;
        plugin.lightSyncTimer = null;
        plugin.originalLightColor = Canvas.global_light_color.clone();
        plugin.originalLightSide = Canvas.global_light_side;
        plugin.originalSunIntensity = (typeof Sun !== 'undefined' && Sun) ? Sun.intensity : null;
        plugin.baseLightDistance = 40;
        plugin.baseBillboardSize = 4;

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
            plugin.lightSyncTimer = setInterval(() => {
                plugin.syncLightToBillboard();
            }, 50);
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
            plugin.addPointLight({
                color: '#ffd7ad',
                intensity: 4.0,
                distance: 40,
                position: center.clone().add(new THREE.Vector3(0, 8, 6)),
            });
            if (typeof Sun !== 'undefined' && Sun) {
                Sun.color.set('#fff1df');
                if (typeof Sun.intensity === 'number') Sun.intensity = 0.65;
            }
            Blockbench.showQuickMessage('BRFX: Light Source billboard created — move or scale it to control the light', 3500);
        };

        plugin.addCoolEnvironment = function() {
            const center = plugin.getModelCenter();
            plugin.addPointLight({
                color: '#9ec5ff',
                intensity: 4.0,
                distance: 40,
                position: center.clone().add(new THREE.Vector3(0, 8, -6)),
            });
            if (typeof Sun !== 'undefined' && Sun) {
                Sun.color.set('#dbe9ff');
                if (typeof Sun.intensity === 'number') Sun.intensity = 0.45;
            }
            Blockbench.showQuickMessage('BRFX: Cool Light Source billboard created — move or scale it to control the light', 3500);
        };

        plugin.restoreLight = function(showMessage = true) {
            plugin.removeSceneLights();
            Canvas.global_light_color.copy(plugin.originalLightColor);
            Canvas.global_light_side = plugin.originalLightSide;
            if (typeof Sun !== 'undefined' && Sun) {
                if (Sun.color) Sun.color.copy(Canvas.global_light_color);
                if (plugin.originalSunIntensity !== null && typeof Sun.intensity === 'number') {
                    Sun.intensity = plugin.originalSunIntensity;
                }
            }
            plugin.refresh();
            if (showMessage) Blockbench.showQuickMessage('BRFX: Blockbench lighting restored', 2500);
        };

        plugin.warmAction = new Action('brfx_warm_light', {
            name: 'BRFX — Warm Sun',
            description: 'Strong golden ambient light for a warm, sunny look.',
            icon: 'wb_sunny',
            click() {
                plugin.removeSceneLights();
                Canvas.global_light_color.set('#ffad52');
                Canvas.global_light_side = 0;
                plugin.refresh();
                Blockbench.showQuickMessage('BRFX: Warm Sun lighting enabled', 2500);
            },
        });

        plugin.neutralAction = new Action('brfx_neutral_light', {
            name: 'BRFX — Neutral Daylight',
            description: 'Restore a clean neutral daylight tint.',
            icon: 'light_mode',
            click() {
                plugin.removeSceneLights();
                Canvas.global_light_color.set('#ffffff');
                Canvas.global_light_side = 0;
                plugin.refresh();
                Blockbench.showQuickMessage('BRFX: Neutral Daylight enabled', 2500);
            },
        });

        plugin.coolAction = new Action('brfx_cool_light', {
            name: 'BRFX — Moonlight',
            description: 'Strong blue ambient light for a cool nighttime look.',
            icon: 'ac_unit',
            click() {
                plugin.removeSceneLights();
                Canvas.global_light_color.set('#6ea8ff');
                Canvas.global_light_side = 1;
                plugin.refresh();
                Blockbench.showQuickMessage('BRFX: Moonlight lighting enabled', 2500);
            },
        });

        plugin.cinematicAction = new Action('brfx_cinematic_light', {
            name: 'BRFX — Cinematic Purple',
            description: 'A vivid purple-blue ambient tint for stylized scenes.',
            icon: 'movie',
            click() {
                plugin.removeSceneLights();
                Canvas.global_light_color.set('#a878ff');
                Canvas.global_light_side = 1;
                plugin.refresh();
                Blockbench.showQuickMessage('BRFX: Cinematic Purple lighting enabled', 2500);
            },
        });

        plugin.environmentAction = new Action('brfx_real_environment', {
            name: 'BRFX — Real Environment Light',
            description: 'Create a real point light with a movable and resizable BRFX Light Source billboard.',
            icon: 'wb_sunny',
            click() { plugin.addSoftEnvironment(); },
        });

        plugin.coolEnvironmentAction = new Action('brfx_real_cool_environment', {
            name: 'BRFX — Real Cool Environment',
            description: 'Create a cool point light with a movable and resizable BRFX Light Source billboard.',
            icon: 'nightlight',
            click() { plugin.addCoolEnvironment(); },
        });

        plugin.restoreAction = new Action('brfx_restore_light', {
            name: 'BRFX — Restore Lighting',
            description: 'Remove BRFX scene lights and their control billboard.',
            icon: 'restart_alt',
            click() { plugin.restoreLight(); },
        });

        if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.tools) {
            MenuBar.menus.tools.addAction(plugin.warmAction);
            MenuBar.menus.tools.addAction(plugin.neutralAction);
            MenuBar.menus.tools.addAction(plugin.coolAction);
            MenuBar.menus.tools.addAction(plugin.cinematicAction);
            MenuBar.menus.tools.addAction(plugin.environmentAction);
            MenuBar.menus.tools.addAction(plugin.coolEnvironmentAction);
            MenuBar.menus.tools.addAction(plugin.restoreAction);
        }

        Canvas.global_light_color.set('#ffad52');
        Canvas.global_light_side = 0;
        plugin.refresh();
    },

    onunload() {
        if (this.lightSyncTimer) clearInterval(this.lightSyncTimer);
        this.lightSyncTimer = null;
        if (this.restoreLight) this.restoreLight(false);
        if (this.warmAction) this.warmAction.delete();
        if (this.neutralAction) this.neutralAction.delete();
        if (this.coolAction) this.coolAction.delete();
        if (this.cinematicAction) this.cinematicAction.delete();
        if (this.environmentAction) this.environmentAction.delete();
        if (this.coolEnvironmentAction) this.coolEnvironmentAction.delete();
        if (this.restoreAction) this.restoreAction.delete();
        this.warmAction = null;
        this.neutralAction = null;
        this.coolAction = null;
        this.cinematicAction = null;
        this.environmentAction = null;
        this.coolEnvironmentAction = null;
        this.restoreAction = null;
        this.sceneLights = null;
        this.lightBillboard = null;
        this.refresh = null;
        this.getScene = null;
        this.getModelCenter = null;
        this.getBillboardPosition = null;
        this.getBillboardScale = null;
        this.removeLightBillboard = null;
        this.syncLightToBillboard = null;
        this.startLightSync = null;
        this.createLightBillboard = null;
        this.removeSceneLights = null;
        this.addPointLight = null;
        this.addSoftEnvironment = null;
        this.addCoolEnvironment = null;
        this.restoreLight = null;
        this.originalLightColor = null;
        this.originalSunIntensity = null;
        this.baseLightDistance = null;
        this.baseBillboardSize = null;
    },
});
