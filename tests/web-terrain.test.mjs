import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fetchCoarseElevation } from '../web-terrain.mjs';

const options = { bbox: { w: 77, e: 77.004, s: 18, n: 18.004 }, nx: 8, ny: 8,
  cellDeg: 0.0005, endpoint: 'https://example.test/ImageServer', timeoutMs: 10 };

function reply(url, { values, maskBits } = {}) {
  const size = new URL(url).searchParams.get('size').split(',').map(Number);
  const count = size[0] * size[1];
  const bytes = new ArrayBuffer(count * 4 + Math.ceil(count / 8));
  const view = new DataView(bytes), mask = new Uint8Array(bytes, count * 4);
  for (let i = 0; i < count; i++) {
    view.setFloat32(i * 4, values?.[i] ?? -2500, true);
    if (maskBits?.[i] ?? true) mask[i >> 3] |= 0x80 >> (i & 7);
  }
  return { ok: true, arrayBuffer: async () => bytes };
}

test('web request uses near-native DEM size and returns interpolated elevations', async () => {
  let requested;
  const result = await fetchCoarseElevation({ ...options, fetchImpl: async url => {
    requested = new URL(url);
    const [w, h] = requested.searchParams.get('size').split(',').map(Number);
    return reply(url, { values: Array.from({ length: w * h }, (_, i) => -2500 + i) });
  } });
  assert.equal(requested.searchParams.get('format'), 'bsq');
  assert.equal(requested.searchParams.get('pixelType'), 'F32');
  assert.ok(Number(requested.searchParams.get('size').split(',')[0]) < options.nx);
  assert.equal(result.raw.length, 64);
  assert.ok(result.raw.every(Number.isFinite));
  assert.ok(result.raw[0] < result.raw.at(-1));
});

test('HTTP failure is reported rather than turned into a route', async () => {
  await assert.rejects(fetchCoarseElevation({ ...options, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('abort timeout is reported', async () => {
  await assert.rejects(fetchCoarseElevation({ ...options, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }) }), /timed out/);
});

test('masked pixels remain no-data and empty coverage fails', async () => {
  const partial = await fetchCoarseElevation({ ...options, fetchImpl: async url => {
    const [w, h] = new URL(url).searchParams.get('size').split(',').map(Number);
    const bits = Array(w * h).fill(true); bits[0] = false;
    return reply(url, { maskBits: bits });
  } });
  assert.ok(Number.isNaN(partial.raw[0]));
  await assert.rejects(fetchCoarseElevation({ ...options, fetchImpl: async url => {
    const [w, h] = new URL(url).searchParams.get('size').split(',').map(Number);
    return reply(url, { maskBits: Array(w * h).fill(false) });
  } }), /no elevation data/);
});

test('truncated BSQ response is rejected', async () => {
  await assert.rejects(fetchCoarseElevation({ ...options, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) }), /incomplete response/);
});

test('Jezero S2 can produce a finite elevation-based walking leg', async () => {
  const root = new URL('../', import.meta.url);
  const missionData = runInNewContext(`${readFileSync(new URL('missions.js', root), 'utf8')}\nMISSIONS.jezero`);
  const roverContext = {};
  roverContext.window = roverContext;
  runInNewContext(readFileSync(new URL('data/perseverance.js', root), 'utf8'), roverContext);
  const waypoints = roverContext.ROVER_DATA.perseverance.waypoints;
  const nearest = sol => waypoints.reduce((best, point) => Math.abs(point[0] - sol) < Math.abs(best[0] - sol) ? point : best);
  const base = nearest(missionData.habSol), s2 = nearest(missionData.stations[1].sol);
  const bbox = missionData.bbox, cellDeg = 10 / (Math.PI * 3389.5 * 1000 / 180);
  const nx = Math.ceil((bbox.e - bbox.w) / cellDeg), ny = Math.ceil((bbox.n - bbox.s) / cellDeg);
  const { raw } = await fetchCoarseElevation({ bbox, nx, ny, cellDeg,
    endpoint: 'https://example.test/ImageServer', fetchImpl: async url => {
      const [w, h] = new URL(url).searchParams.get('size').split(',').map(Number);
      return reply(url, { values: Array.from({ length: w * h }, (_, i) => -2500 + (i % w) * 0.2 + Math.floor(i / w) * 0.2) });
    } });
  const E = raw, S = new Float32Array(nx * ny).fill(0);
  const dx = 10 * Math.cos((bbox.s + bbox.n) * Math.PI / 360);
  for (let r = 1; r < ny - 1; r++) for (let c = 1; c < nx - 1; c++) {
    const i = r * nx + c;
    S[i] = Math.atan(Math.hypot((E[i + 1] - E[i - 1]) / (2 * dx), (E[i + nx] - E[i - nx]) / 20)) * 180 / Math.PI;
  }
  const source = readFileSync(new URL('mission.js', root), 'utf8');
  const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const actualRouteCode = [section('function havM(', 'const fmtH'), section('const cellOf =', 'const SLOPE_CLASSES'), section('class Heap', 'const routeLayer')].join('\n');
  const context = { T: { nx, ny, E, S }, BBOX: bbox, CELL_DEG: cellDeg, CELL_M: 10, MARS_R_KM: 3389.5, toRad: Math.PI / 180 };
  const result = runInNewContext(`${actualRouteCode}\nlegPath(${JSON.stringify([base[1], base[2]])}, ${JSON.stringify([s2[1], s2[2]])}, { maxSlope: 15, v0: 2.5, load: 10 }, new Uint8Array(T.nx*T.ny))`, context);
  assert.ok(result?.cells.length > 1);
  const distanceKm = result.cells.slice(1).reduce((sum, cell, i) => {
    const a = result.cells[i], dr = Math.floor(cell / nx) - Math.floor(a / nx), dc = cell % nx - a % nx;
    return sum + 0.01 * Math.hypot(dr, dc);
  }, 0);
  assert.ok(Number.isFinite(distanceKm) && distanceKm > 0);
  assert.ok(Number.isFinite(result.hours) && result.hours > 0);
  assert.ok(result.cells.every(cell => Number.isFinite(E[cell]) && Number.isFinite(S[cell]) && S[cell] <= 15));
});
