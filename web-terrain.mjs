// Web-only export at the source's approximate native resolution. The navigation grid is interpolated, not measured at 10 m.
export async function fetchCoarseElevation({ bbox, nx, ny, cellDeg, endpoint, fetchImpl = fetch, timeoutMs = 30000 }) {
  const width = Math.max(2, Math.ceil((bbox.e - bbox.w) * 59158 * Math.cos((bbox.s + bbox.n) * Math.PI / 360) / 200));
  const height = Math.max(2, Math.ceil((bbox.n - bbox.s) * 59158 / 200));
  const east = bbox.w + nx * cellDeg, south = bbox.n - ny * cellDeg;
  const url = `${endpoint}/exportImage?bbox=${bbox.w},${south},${east},${bbox.n}` +
    `&size=${width},${height}&format=bsq&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response, buffer;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffer = await response.arrayBuffer();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`timed out (${timeoutMs / 1000} s)`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const count = width * height, pixelBytes = count * 4, maskBytes = Math.ceil(count / 8);
  if (buffer.byteLength < pixelBytes + maskBytes) throw new Error(`incomplete response (${buffer.byteLength} bytes)`);
  const view = new DataView(buffer), mask = new Uint8Array(buffer, pixelBytes, maskBytes);
  const source = new Float32Array(count);
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const value = view.getFloat32(i * 4, true);
    const covered = (mask[i >> 3] & (0x80 >> (i & 7))) !== 0;
    source[i] = covered && Number.isFinite(value) && value > -12000 && value < 25000 ? value : NaN;
    if (Number.isFinite(source[i])) valid++;
  }
  if (!valid) throw new Error('no elevation data in response');
  const raw = new Float32Array(nx * ny);
  for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) {
    const x = Math.max(0, Math.min(width - 1, (col + 0.5) * width / nx - 0.5));
    const y = Math.max(0, Math.min(height - 1, (row + 0.5) * height / ny - 0.5));
    const x0 = Math.floor(x), x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(y), y1 = Math.min(y0 + 1, height - 1);
    const corners = [source[y0 * width + x0], source[y0 * width + x1], source[y1 * width + x0], source[y1 * width + x1]];
    const weights = [(1 - (x - x0)) * (1 - (y - y0)), (x - x0) * (1 - (y - y0)), (1 - (x - x0)) * (y - y0), (x - x0) * (y - y0)];
    raw[row * nx + col] = corners.some((v, i) => weights[i] > 0 && !Number.isFinite(v))
      ? NaN : corners.reduce((sum, v, i) => sum + (weights[i] ? v * weights[i] : 0), 0);
  }
  return { raw, bytes: buffer.byteLength };
}
