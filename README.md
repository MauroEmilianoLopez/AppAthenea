# Athenea

Athenea is a **Jezero Delta EVA planning prototype**. It helps explore a science walk from a base to selected stops and back, using Mars imagery, terrain elevation, rover observations, and explicit planning assumptions. The current interface focuses on Jezero; the mission-profile structure remains available for future sites.

**This is not an operational or safety-certified route planner.** Its routes are preliminary estimates and must not be used to decide whether terrain is traversable.

## Run the desktop app

On Windows, install Node.js 20.19+ or 22.12+, then run:

```powershell
npm install
npm start
```

Athenea opens directly in the Jezero EVA planner. The first installation needs an Internet connection. See [DESKTOP.md](DESKTOP.md) for packaging and offline behavior.

## Deploy the web version

The Vercel configuration builds an allowlisted static site with `npm run build:web`. Its root page is the Jezero EVA planner; `/map.html` is the secondary Jezero map. Only the files in `web-dist/` are served, so the Electron runtime, build tools, and local diagnostics are not published as website assets.

Connect this repository to a Vercel project with the **Other** framework preset. The checked-in `vercel.json` sets the install command, build command, and output directory. NASA Mars Trek imagery/elevation and weather feeds still require Internet access; the web deployment is not an offline copy.

## Use the planner

1. Select one or more science stops on the Jezero mission screen.
2. Review the calculated route, return time, distance, slope, and planning alerts.
3. Compare the fastest and gentler route profiles, adjust suit/walking limits, or mark obstacles and recalculate.
4. Review the source and quality notes before copying the plan as GeoJSON.

The secondary Jezero map is available in a browser. Prepare local Leaflet assets with `npm run prepare:desktop`, run `powershell -ExecutionPolicy Bypass -File serve.ps1`, then open `http://localhost:8765/mission.html?m=jezero` for the planner or `http://localhost:8765/` for the Jezero map.

## Data and limits

- The route algorithm uses the Mars Trek HRSC + MOLA elevation model, selected stops, user-marked obstacles, and walking/slope settings. Rover observations and geology add context; weather, radiation, and consumables contribute to the EVA assessment rather than determining the route path.
- The Jezero elevation source has approximately **200 m native resolution**. The 10 m calculation grid interpolates it; it does **not** reveal rocks, steps, or local slopes. Treat the result as a preliminary planning route, not a validated walking path.
- Mars Trek map and terrain services, plus NASA weather and space-weather feeds, require Internet access. Missing or rate-limited feeds are shown as unavailable; they are not evidence of safe conditions.
- Science objectives, suit parameters, and consumable rates include prototype assumptions. Check the on-screen evidence and [BLOCKERS.md](BLOCKERS.md) for known limitations.

Future missions can be configured in [`missions.js`](missions.js); the shared planner lives in [`mission.js`](mission.js). The current product focus remains Jezero until its end-to-end planning flow is validated.
