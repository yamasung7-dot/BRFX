/*
 * BRFX — Blockbench Render FX
 * Scene Lighting Pass v0.6.0
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Scene Lighting',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Scene-aware lighting with movable Blockbench light-source controls.',
    version: '0.6.0',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;
        plugin.sceneLights = [];
        plugin.lightLocator = null;
        plugin.lightSyncTimer = null;
        plugin.originalLightColor = Canvas.global_light_color.clone();
        plugin.originalLightSide = Canvas.global_light_side;
        plugin.originalSunIntensity = (typeof Sun !== 'undefined' && Sun) ? Sun.intensity : null;

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

        plugin.removeLightLocator = function() {
            if (plugin.lightLocator) {
                try { plugin.lightLocator.remove(); } catch (error) { /* already removed */ }
                plugin.lightLocator = null;
            }
        };

        plugin.syncLightToLocator = function() {
            if (!plugin.lightLocator || !plugin.sceneLights.length) return;
            const light = plugin.sceneLights[0];
            if (!light) return;

            const position = plugin.lightLocator.getWorldCenter();
            if (!position) return;

            light.position.copy(position);
            light.updateMatrixWorld(true);
            plugin.refresh();
        };

        plugin.startLightSync = function() {
            if (plugin.lightSyncTimer) clearInterval(plugin.lightSyncTimer);
            plugin.lightSyncTimer = setInterval(() => {
                plugin.syncLightToLocator();
            }, 50);
        };

        plugin.createLightLocator = function(position) {
            plugin.removeLightLocator();
            if (typeof Locator === 'undefined') {
                Blockbench.showQuickMessage('BRFX: Blockbench locators are unavailable', 3000);
                return null;
            }

            const vector = position || plugin.getModelCenter().clone().add(new THREE.Vector3(0, 8, 6));
            const locator = new Locator({
                name: 'BRFX Light Source',
                from: [vector.x, vector.y, vector.z],
            }).init();

            locator.addTo();
            locator.select();
            plugin.lightLocator = locator;
            plugin.startLightSync();
            return locator;
        };

        plugin.removeSceneLights = function() {
            plugin.sceneLights.forEach(light => {
                if (light && light.parent) light.parent.remove(light);
                if (light && light.target && light.target.parent) light.target.parent.remove(light.target);
            });
            plugin.sceneLights.length = 0;
            plugin.removeLightLocator();
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
            const light = new THREE.PointLight(color, intensity, distance, 2);
            light.name = 'BRFX_Environment_Point_Light';
            light.castShadow = false;
            const position = options.position || plugin.getModelCenter().clone().add(new THREE.Vector3(0, 8, 6));
            light.position.copy(position);
            targetScene.add(light);
            plugin.sceneLights.push(light);
            plugin.createLightLocator(position);
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
            Blockbench.showQuickMessage('BRFX: Light Source created — move the locator to position it', 3500);
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
            Blockbench.showQuickMessage('BRFX: Cool Light Source created — move the locator to position it', 3500);
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
            description: 'Create a real point light and a movable BRFX Light Source locator.',
            icon: 'wb_sunny',
            click() { plugin.addSoftEnvironment(); },
        });

        plugin.coolEnvironmentAction = new Action('brfx_real_cool_environment', {
            name: 'BRFX — Real Cool Environment',
            description: 'Create a cool point light with a movable BRFX Light Source locator.',
            icon: 'nightlight',
            click() { plugin.addCoolEnvironment(); },
        });

        plugin.restoreAction = new Action('brfx_restore_light', {
            name: 'BRFX — Restore Lighting',
            description: 'Remove BRFX scene lights and their control locator.',
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
        this.lightLocator = null;
        this.refresh = null;
        this.getScene = null;
        this.getModelCenter = null;
        this.removeLightLocator = null;
        this.syncLightToLocator = null;
        this.startLightSync = null;
        this.createLightLocator = null;
        this.removeSceneLights = null;
        this.addPointLight = null;
        this.addSoftEnvironment = null;
        this.addCoolEnvironment = null;
        this.restoreLight = null;
        this.originalLightColor = null;
        this.originalSunIntensity = null;
    },
});
