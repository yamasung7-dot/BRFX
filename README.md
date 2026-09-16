# BRFX — Blockbench Render FX

BRFX is a Blockbench plugin focused on **viewport atmosphere and rendering effects** rather than model generation.

The first build is intentionally small and mobile-friendly. It targets rendering controls already present in Blockbench's preview renderer and adds an environment layer on top.

## 0.1.x foundation

- **Ambient environment lighting** — warm/cool tint, intensity, and light-side control.
- **Procedural sky dome** — a lightweight three-color environment dome that follows the active preview camera.
- **Stylized edge outlines** — optional geometry-edge outlines for a toon/illustration look.
- **Live controls** — changes apply while the settings dialog is open.
- **Safe unload** — BRFX removes its sky/outlines and restores the lighting state it found when loaded.
- **Desktop + Web + Mobile** — the plugin uses Blockbench's JavaScript API and avoids desktop-only file APIs.

## Implementation note

BRFX is designed around Blockbench's existing preview lighting system. Current Blockbench source exposes a global ambient `Sun` light and `Canvas.global_light_color` / `Canvas.global_light_side`; BRFX uses those controls instead of creating a separate renderer.

The procedural sky is a lightweight shader dome, not a ray-traced environment. The outline pass in 0.1.x is geometry-edge based; a true screen-space silhouette pass is planned for a later version if it can be implemented without hurting mobile performance.

## Plugin file

The installable plugin file is:

`brfx.js`

The plugin ID and filename intentionally match (`brfx`), following Blockbench's plugin requirements.

## Development roadmap

### Phase 1 — Environment foundation
- Ambient/environment lighting
- Procedural sky
- Stable mobile controls
- Clean install/reload/uninstall lifecycle

### Phase 2 — Presentation
- Better sky presets
- Environment rotation
- Exposure / contrast controls
- Optional fog/haze

### Phase 3 — Stylization
- Improved silhouette outlines
- Toon shading options
- Soft ambient occlusion approximation
- Bloom where supported without excessive mobile cost

### Phase 4 — Advanced environments
- Image-based skyboxes
- Environment maps
- More accurate indirect-light approximation
- Render-quality presets

## License

MIT License. See [`LICENSE`](LICENSE).
