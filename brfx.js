/*
 * BRFX — Blockbench Render FX
 * Ambient Light Pass v0.4.0
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Ambient Light',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Visible ambient and environment-lighting presets for the Blockbench viewport.',
    version: '0.4.0',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;

        plugin.originalLightColor = Canvas.global_light_color.clone();
        plugin.originalLightSide = Canvas.global_light_side;
        plugin.originalSunIntensity = (typeof Sun !== 'undefined' && Sun) ? Sun.intensity : null;
        plugin.enabled = false;

        plugin.refresh = function() {
            if (typeof Canvas.updateAllFaces === 'function') {
                Canvas.updateAllFaces();
            }
        };

        plugin.applyLight = function(color, side, label, intensity = null) {
            Canvas.global_light_color.set(color);
            Canvas.global_light_side = side;

            if (typeof Sun !== 'undefined' && Sun) {
                if (Sun.color) Sun.color.copy(Canvas.global_light_color);
                if (intensity !== null && typeof Sun.intensity === 'number') {
                    Sun.intensity = intensity;
                }
            }

            plugin.refresh();
            plugin.enabled = true;
            Blockbench.showQuickMessage(`BRFX: ${label}`, 2500);
        };

        plugin.restoreLight = function(showMessage = true) {
            Canvas.global_light_color.copy(plugin.originalLightColor);
            Canvas.global_light_side = plugin.originalLightSide;

            if (typeof Sun !== 'undefined' && Sun) {
                if (Sun.color) Sun.color.copy(Canvas.global_light_color);
                if (plugin.originalSunIntensity !== null && typeof Sun.intensity === 'number') {
                    Sun.intensity = plugin.originalSunIntensity;
                }
            }

            plugin.refresh();
            plugin.enabled = false;
            if (showMessage) {
                Blockbench.showQuickMessage('BRFX: Blockbench lighting restored', 2500);
            }
        };

        plugin.warmAction = new Action('brfx_warm_light', {
            name: 'BRFX — Warm Sun',
            description: 'Strong golden ambient light for a warm, sunny look.',
            icon: 'wb_sunny',
            click() {
                plugin.applyLight('#ffad52', 0, 'Warm Sun lighting enabled');
            },
        });

        plugin.neutralAction = new Action('brfx_neutral_light', {
            name: 'BRFX — Neutral Daylight',
            description: 'Restore a clean neutral daylight tint.',
            icon: 'light_mode',
            click() {
                plugin.applyLight('#ffffff', 0, 'Neutral Daylight enabled');
            },
        });

        plugin.coolAction = new Action('brfx_cool_light', {
            name: 'BRFX — Moonlight',
            description: 'Strong blue ambient light for a cool nighttime look.',
            icon: 'ac_unit',
            click() {
                plugin.applyLight('#6ea8ff', 1, 'Moonlight lighting enabled');
            },
        });

        plugin.cinematicAction = new Action('brfx_cinematic_light', {
            name: 'BRFX — Cinematic Purple',
            description: 'A vivid purple-blue ambient tint for stylized scenes.',
            icon: 'movie',
            click() {
                plugin.applyLight('#a878ff', 1, 'Cinematic Purple lighting enabled');
            },
        });

        plugin.immersiveAction = new Action('brfx_immersive_ambient', {
            name: 'BRFX — Immersive Ambient',
            description: 'Blend incoming objects into the scene with soft environment-style illumination.',
            icon: 'blur_on',
            click() {
                plugin.applyLight('#ffe3c2', 0, 'Immersive Ambient enabled', 1.15);
            },
        });

        plugin.restoreAction = new Action('brfx_restore_light', {
            name: 'BRFX — Restore Lighting',
            description: 'Restore Blockbench lighting to its previous state.',
            icon: 'restart_alt',
            click() {
                plugin.restoreLight();
            },
        });

        if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.tools) {
            MenuBar.menus.tools.addAction(plugin.warmAction);
            MenuBar.menus.tools.addAction(plugin.neutralAction);
            MenuBar.menus.tools.addAction(plugin.coolAction);
            MenuBar.menus.tools.addAction(plugin.cinematicAction);
            MenuBar.menus.tools.addAction(plugin.immersiveAction);
            MenuBar.menus.tools.addAction(plugin.restoreAction);
        }

        plugin.applyLight('#ffad52', 0, 'Warm Sun lighting enabled');
    },

    onunload() {
        if (this.restoreLight) {
            this.restoreLight(false);
        }

        if (this.warmAction) this.warmAction.delete();
        if (this.neutralAction) this.neutralAction.delete();
        if (this.coolAction) this.coolAction.delete();
        if (this.cinematicAction) this.cinematicAction.delete();
        if (this.immersiveAction) this.immersiveAction.delete();
        if (this.restoreAction) this.restoreAction.delete();

        this.warmAction = null;
        this.neutralAction = null;
        this.coolAction = null;
        this.cinematicAction = null;
        this.immersiveAction = null;
        this.restoreAction = null;
        this.applyLight = null;
        this.restoreLight = null;
        this.refresh = null;
        this.originalLightColor = null;
        this.originalSunIntensity = null;
    },
});
