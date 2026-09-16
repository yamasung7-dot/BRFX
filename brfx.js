/*
 * BRFX — Blockbench Render FX
 *
 * MIT License — see LICENSE
 */

Plugin.register('brfx', {
    title: 'BRFX — Blockbench Render FX',
    author: 'Yama Sung',
    icon: 'auto_awesome',
    description: 'Environment-focused viewport rendering effects for Blockbench: ambient lighting, a procedural sky dome, and optional stylized edge outlines.',
    version: '0.1.0',
    variant: 'both',
    min_version: '4.10.0',
    tags: ['Rendering', 'Tools'],

    onload() {
        const state = {
            ambient: 0.65,
            light_color: '#fff1dc',
            light_side: 0,
            sky_enabled: true,
            sky_top: '#7292bd',
            sky_horizon: '#f4d4a1',
            sky_bottom: '#c58f68',
            outlines: false,
            outline_color: '#29232a',
            outline_threshold: 35,
        };

        const defaults = {...state};
        let dialog = null;
        let sky_dome = null;
        let outline_material = null;
        let outline_meshes = [];
        let original = null;
        let applying = false;

        function sceneReady() {
            return typeof Canvas !== 'undefined' && Canvas && Canvas.scene && typeof THREE !== 'undefined';
        }

        function captureOriginal() {
            if (!sceneReady() || original) return;
            const sun = window.Sun;
            original = {
                sun_intensity: sun ? sun.intensity : null,
                light_color: Canvas.global_light_color ? Canvas.global_light_color.clone() : new THREE.Color(0xffffff),
                light_side: Canvas.global_light_side,
                background: Canvas.scene.background,
            };
        }

        function updateMaterialLighting() {
            if (!sceneReady()) return;

            const color = new THREE.Color(state.light_color);
            Canvas.global_light_color.copy(color);
            Canvas.global_light_side = Number(state.light_side) || 0;

            if (window.Sun) {
                window.Sun.intensity = Number(state.ambient);
                window.Sun.color.copy(color);
            }

            if (Array.isArray(Canvas.emptyMaterials)) {
                Canvas.emptyMaterials.forEach(material => {
                    if (!material || !material.uniforms) return;
                    if (material.uniforms.LIGHTCOLOR) material.uniforms.LIGHTCOLOR.value.copy(color);
                    if (material.uniforms.LIGHTSIDE) material.uniforms.LIGHTSIDE.value = Number(state.light_side) || 0;
                });
            }

            if (Array.isArray(Canvas.coloredSolidMaterials)) {
                Canvas.coloredSolidMaterials.forEach(material => {
                    if (!material || !material.uniforms) return;
                    if (material.uniforms.LIGHTCOLOR) material.uniforms.LIGHTCOLOR.value.copy(color);
                    if (material.uniforms.LIGHTSIDE) material.uniforms.LIGHTSIDE.value = Number(state.light_side) || 0;
                });
            }

            if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
                Texture.all.forEach(texture => {
                    try {
                        const material = texture.getMaterial && texture.getMaterial();
                        if (!material || !material.uniforms) return;
                        if (material.uniforms.LIGHTCOLOR) material.uniforms.LIGHTCOLOR.value.copy(color);
                        if (material.uniforms.LIGHTSIDE) material.uniforms.LIGHTSIDE.value = Number(state.light_side) || 0;
                    } catch (error) {
                        // A texture may not have a render material yet.
                    }
                });
            }

            if (Canvas.monochromaticSolidMaterial && Canvas.monochromaticSolidMaterial.uniforms) {
                const uniforms = Canvas.monochromaticSolidMaterial.uniforms;
                if (uniforms.base) uniforms.base.value = color;
            }

            if (Canvas.updateView) {
                try { Canvas.updateView({}); } catch (error) {}
            }
        }

        function disposeObject(object) {
            if (!object) return;
            object.traverse(child => {
                if (child.geometry && child.geometry.dispose) child.geometry.dispose();
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => {
                        if (material && material.dispose) material.dispose();
                    });
                }
            });
        }

        function createSkyDome() {
            if (!sceneReady()) return;
            if (sky_dome) return;

            const vertexShader = `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `;

            const fragmentShader = `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 bottomColor;
                varying vec3 vWorldPosition;

                void main() {
                    float height = normalize(vWorldPosition - cameraPosition).y;
                    float upper = smoothstep(0.0, 0.75, max(height, 0.0));
                    float lower = smoothstep(0.0, 0.65, max(-height, 0.0));
                    vec3 color = mix(horizonColor, topColor, upper);
                    color = mix(color, bottomColor, lower * 0.75);
                    gl_FragColor = vec4(color, 1.0);
                }
            `;

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    topColor: {value: new THREE.Color(state.sky_top)},
                    horizonColor: {value: new THREE.Color(state.sky_horizon)},
                    bottomColor: {value: new THREE.Color(state.sky_bottom)},
                },
                vertexShader,
                fragmentShader,
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: true,
            });

            sky_dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), material);
            sky_dome.name = 'BRFX_SkyDome';
            sky_dome.frustumCulled = false;
            sky_dome.renderOrder = -1000;
            sky_dome.onBeforeRender = function(renderer, scene, camera) {
                if (camera && camera.position) this.position.copy(camera.position);
            };
            Canvas.scene.add(sky_dome);
            updateSkyDome();
        }

        function updateSkyDome() {
            if (!sceneReady()) return;
            if (!sky_dome) createSkyDome();
            if (!sky_dome) return;

            sky_dome.visible = !!state.sky_enabled;
            const uniforms = sky_dome.material.uniforms;
            uniforms.topColor.value.set(state.sky_top);
            uniforms.horizonColor.value.set(state.sky_horizon);
            uniforms.bottomColor.value.set(state.sky_bottom);
        }

        function clearOutlines() {
            outline_meshes.forEach(line => {
                if (line.parent) line.parent.remove(line);
                if (line.geometry && line.geometry.dispose) line.geometry.dispose();
            });
            outline_meshes = [];
            if (outline_material) {
                outline_material.dispose();
                outline_material = null;
            }
        }

        function refreshOutlines() {
            if (!sceneReady()) return;
            clearOutlines();
            if (!state.outlines) return;

            outline_material = new THREE.LineBasicMaterial({
                color: new THREE.Color(state.outline_color),
                transparent: true,
                opacity: 0.95,
                depthTest: true,
                depthWrite: false,
            });

            const skip = new Set();
            if (sky_dome) skip.add(sky_dome);
            if (Canvas.ground_plane) skip.add(Canvas.ground_plane);
            if (Array.isArray(Canvas.gizmos)) Canvas.gizmos.forEach(object => skip.add(object));

            Canvas.scene.traverse(object => {
                if (!object.isMesh || skip.has(object)) return;
                if (object.userData && object.userData.brfx_outline) return;
                if (!object.geometry || !object.visible) return;
                if (object.name && object.name.indexOf('BRFX_') === 0) return;

                try {
                    const geometry = new THREE.EdgesGeometry(object.geometry, Number(state.outline_threshold) || 1);
                    const line = new THREE.LineSegments(geometry, outline_material);
                    line.name = 'BRFX_Outline';
                    line.userData.brfx_outline = true;
                    object.add(line);
                    outline_meshes.push(line);
                } catch (error) {
                    // Some special meshes may not expose a compatible geometry.
                }
            });
        }

        function applyAll() {
            if (applying) return;
            applying = true;
            try {
                captureOriginal();
                updateMaterialLighting();
                updateSkyDome();
                refreshOutlines();
            } finally {
                applying = false;
            }
        }

        function restoreOriginal() {
            if (!sceneReady() || !original) return;
            if (window.Sun && original.sun_intensity !== null) {
                window.Sun.intensity = original.sun_intensity;
            }
            Canvas.global_light_color.copy(original.light_color);
            Canvas.global_light_side = original.light_side;
            Canvas.scene.background = original.background;
            updateMaterialLighting();
        }

        function openDialog() {
            captureOriginal();
            if (dialog) {
                dialog.show();
                return;
            }

            dialog = new Dialog({
                id: 'brfx_settings',
                title: 'BRFX — Render FX',
                width: 460,
                resizable: 'y',
                form: {
                    ambient: {
                        label: 'Ambient intensity',
                        type: 'number',
                        value: state.ambient,
                        min: 0,
                        max: 2,
                        step: 0.01,
                    },
                    light_color: {
                        label: 'Environment light color',
                        type: 'color',
                        value: state.light_color,
                    },
                    light_side: {
                        label: 'Light direction',
                        type: 'select',
                        options: {
                            'Top / front': 0,
                            'Bottom / back': 1,
                            'Left': 2,
                            'Right': 3,
                        },
                        value: state.light_side,
                    },
                    sky_enabled: {
                        label: 'Procedural sky dome',
                        type: 'checkbox',
                        value: state.sky_enabled,
                    },
                    sky_top: {
                        label: 'Sky top',
                        type: 'color',
                        value: state.sky_top,
                    },
                    sky_horizon: {
                        label: 'Sky horizon',
                        type: 'color',
                        value: state.sky_horizon,
                    },
                    sky_bottom: {
                        label: 'Sky bottom',
                        type: 'color',
                        value: state.sky_bottom,
                    },
                    outlines: {
                        label: 'Stylized edge outlines',
                        type: 'checkbox',
                        value: state.outlines,
                    },
                    outline_color: {
                        label: 'Outline color',
                        type: 'color',
                        value: state.outline_color,
                    },
                    outline_threshold: {
                        label: 'Outline edge threshold',
                        type: 'number',
                        value: state.outline_threshold,
                        min: 1,
                        max: 180,
                        step: 1,
                    },
                },
                buttons: ['Apply', 'Reset', 'Cancel'],
                confirmIndex: 0,
                cancelIndex: 2,
                onFormChange(result) {
                    Object.assign(state, result);
                    applyAll();
                },
                onConfirm(result) {
                    Object.assign(state, result);
                    applyAll();
                    return true;
                },
                onButton(index) {
                    if (index === 1) {
                        Object.assign(state, defaults);
                        dialog.setFormValues(defaults, true);
                        applyAll();
                        return false;
                    }
                },
                onCancel() {
                    Object.assign(state, defaults);
                    if (original) {
                        // Rebuild the state from the values that existed before this dialog was opened.
                        // The next opening captures the current BRFX state again.
                        updateMaterialLighting();
                        updateSkyDome();
                        refreshOutlines();
                    }
                    return true;
                },
            });

            dialog.show();
        }

        this.action = new Action('brfx_open_settings', {
            name: 'BRFX — Render FX Settings',
            description: 'Tune BRFX environment lighting, sky and outlines',
            icon: 'auto_awesome',
            category: 'tools',
            click: openDialog,
        });

        if (MenuBar && MenuBar.menus && MenuBar.menus.tools) {
            MenuBar.menus.tools.addAction(this.action);
        }

        captureOriginal();
        applyAll();

        this.updateCameraHandler = () => {
            if (sky_dome && Canvas && Canvas.scene) {
                sky_dome.visible = !!state.sky_enabled;
            }
        };
        this.renderHandler = () => {
            // Rebuild outlines after model edits/animation updates only when enabled.
            if (state.outlines && !applying && !outline_meshes.length) refreshOutlines();
        };
        this.viewHandler = () => {
            if (state.outlines) refreshOutlines();
        };

        Blockbench.on('update_camera_position', this.updateCameraHandler);
        Blockbench.on('render_frame', this.renderHandler);
        Blockbench.on('update_view', this.viewHandler);
        Blockbench.on('new_project', this.viewHandler);
        Blockbench.on('load_project', this.viewHandler);
    },

    onunload() {
        if (this.action) this.action.delete();
        if (this.updateCameraHandler) Blockbench.removeListener('update_camera_position', this.updateCameraHandler);
        if (this.renderHandler) Blockbench.removeListener('render_frame', this.renderHandler);
        if (this.viewHandler) {
            Blockbench.removeListener('update_view', this.viewHandler);
            Blockbench.removeListener('new_project', this.viewHandler);
            Blockbench.removeListener('load_project', this.viewHandler);
        }

        if (typeof Canvas !== 'undefined' && Canvas && Canvas.scene) {
            const sky = Canvas.scene.getObjectByName('BRFX_SkyDome');
            if (sky) {
                Canvas.scene.remove(sky);
                if (sky.geometry) sky.geometry.dispose();
                if (sky.material && sky.material.dispose) sky.material.dispose();
            }

            Canvas.scene.traverse(object => {
                if (object.userData && object.userData.brfx_outline && object.parent) {
                    object.parent.remove(object);
                    if (object.geometry) object.geometry.dispose();
                }
            });
        }

        if (window.BRFX && window.BRFX.restore) {
            try { window.BRFX.restore(); } catch (error) {}
        }
    },
});
