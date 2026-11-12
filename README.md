# 2027 CAD Studio — Drawing-scaled 3D preview

A GitHub Pages-ready React + Three.js viewer for the eight supplied 2027 mechanical drawings.

## What's new in v1.3

- The eight parametric preview models now use **millimetres as world units** (`1 Three.js unit = 1 mm`).
- Major visible dimensions from the drawings are used to set the overall proportions; the camera automatically frames each model from its real bounding box.
- The main 3D viewport is taller, and the toolbar includes a full-screen viewer toggle (Esc exits).
- XYZ orientation gizmo continues to track the camera.
- The C-part elbow now uses a dimensioned R200 quarter-bend path; the E-part is an open-bottom half-cylinder cover; G/H use hollow housings and circular flanges; A/B/D/F use scaled cast-ring, bearing, web and bracket geometry.
- The details panel displays the drawing dimensions and identifies inferred/unclear casting details.

## Drawing reference dimensions used

| Part | Principal drawing dimensions used in the preview |
|---|---|
| A — Worktable support | Ø1640 mm overall; approx. 265 mm axial height; stepped concentric seats and radial webs |
| B — Spindle housing | 375 × 430 × 415 mm overall envelope; approx. Ø260 bearing boss and Ø190 bore |
| C — Inspection pipe | 600 × 440 mm end-centre offset; R200 elbow; Ø315 end flanges; 8 × Ø18 holes |
| D — Lifting-beam support | approx. 1155 × 610 × 738 mm; main Ø630 boss with Ø100 bore and secondary bearing boss |
| E — Rear bearing cover | 1160 mm long; R410 half-arch; open bottom and base mounting rails |
| F — Support bracket | 440 × 360 × 117 mm; two Ø40 upper eye bores |
| G — Enclosure | 606 × 945 × 990 mm; Ø566 main flange; 12 × Ø18 holes; three upper ports |
| H — Housing | 680 × 650 × 890 mm; Ø530 shell; Ø540 end flanges; 12 × Ø18 holes |

Some dimensions are difficult to read in the supplied scans, and some casting surfaces are not dimensioned in the drawings. Those local areas are reconstructed from orthographic proportions and are marked as approximate in the UI. **This is not manufacturing-grade CAD and must not be used for CNC, tooling, inspection, pressure certification, or fit-up without rebuilding and validating the part from the original CAD/drawing data.**

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run check
npm run test:api
npm run build
```

## Deploy

See [部署教程.md](./部署教程.md). GitHub Pages hosts the static viewer. The optional DeepSeek AI path uses a user-entered API key and a Cloudflare Worker proxy; the key is not stored in the app's browser storage or committed to the repository.

## Controls

- Left drag: orbit; wheel: zoom; right drag: pan.
- Front / side / top / isometric views.
- Full-screen viewport; press Esc to exit.
- Material color, metalness, roughness, opacity, lighting, background, shadows and grid.
- Original drawing preview and PNG / illustrative STL export.
- Import STL / OBJ / GLB. Imported units depend on the source file.
