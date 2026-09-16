/*
 * BRFX — Blockbench Render FX
 * Ambient Light Pass v0.2.0
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Ambient Light',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'A safe first Render FX pass: warm, neutral, and cool ambient viewport lighting.',
    version: '0.2.0',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;

        plugin.originalLightColor = Canvas.global_light_color.clone();
        plugin.originalLightSide = Canvas.global_light_side;
        plugin.enabled = false;

        plugin.applyLight = function(color, side, label) {
            Canvas.global_light_color.set(color);
            Canvas.global_light_side = side;

            if (typeof Canvas.updateAllFaces === 'function') {
                Canvas.updateAllFaces();
            }

            plugin.enabled = true;
            Blockbench.showQuickMessage(`BRFX: ${label}`, 2500);
        };

        plugin.restoreLight = function(showMessage = true) {
            Canvas.global_light_color.copy(plugin.originalLightColor);
            Canvas.global_light_side = plugin.originalLightSide;

            if (typeof Canvas.updateAllFaces === 'function') {
                Canvas.updateAllFaces();
            }

            plugin.enabled = false;
            if (showMessage) {
                Blockbench.showQuickMessage('BRFX: Blockbench lighting restored', 2500);
            }
        };

        plugin.warmAction = new Action('brfx_warm_light', {
            name: 'BRFX — Warm Ambient',
            description: 'Apply a subtle warm ambient light tint.',
            icon: 'wb_sunny',
            click() {
                plugin.applyLight('#fff1dc', 0, 'Warm ambient lighting enabled');
            },
        });

        plugin.neutralAction = new Action('brfx_neutral_light', {
            name: 'BRFX — Neutral Ambient',
            description: 'Apply a neutral daylight ambient light.',
            icon: 'light_mode',
            click() {
                plugin.applyLight('#ffffff', 0, 'Neutral ambient lighting enabled');
            },
        });

        plugin.coolAction = new Action('brfx_cool_light', {
            name: 'BRFX — Cool Ambient',
            description: 'Apply a subtle cool ambient light tint.',
            icon: 'ac_unit',
            click() {
                plugin.applyLight('#dbe9ff', 1, 'Cool ambient lighting enabled');
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
            MenuBar.menus.tools.addAction(plugin.restoreAction);
        }

        // Start with the warm preset so the first real Render FX pass is visible.
        plugin.applyLight('#fff1dc', 0, 'Warm ambient lighting enabled');
    },

    onunload() {
        if (this.restoreLight) {
            this.restoreLight(false);
        }

        if (this.warmAction) this.warmAction.delete();
        if (this.neutralAction) this.neutralAction.delete();
        if (this.coolAction) this.coolAction.delete();
        if (this.restoreAction) this.restoreAction.delete();

        this.warmAction = null;
        this.neutralAction = null;
        this.coolAction = null;
        this.restoreAction = null;
        this.applyLight = null;
        this.restoreLight = null;
        this.originalLightColor = null;
    },
});
