/*
 * BRFX — Blockbench Render FX
 * Loader Test v0.1.2
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Loader Test',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'BRFX installation and plugin-loader test.',
    version: '0.1.2',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const plugin = this;

        plugin.action = new Action('brfx_test_action', {
            name: 'BRFX 0.1.2 — Test',
            description: 'Confirm that BRFX loaded correctly.',
            icon: 'auto_awesome',
            category: 'tools',
            click() {
                Blockbench.showQuickMessage('BRFX 0.1.2 loaded successfully', 3000);
            },
        });

        if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.tools) {
            MenuBar.menus.tools.addAction(plugin.action);
        }

        Blockbench.showQuickMessage('BRFX 0.1.2 loaded successfully', 3000);
    },

    onunload() {
        if (this.action) {
            this.action.delete();
            this.action = null;
        }
    },
});
