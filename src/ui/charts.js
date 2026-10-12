import { escapeHtml } from "../shared/dom.js";

/**
 * Render a premium SVG progression chart for one or more scenarios.
 * @param {Array<{label: string, y: number}>} points - Primary scenario points
 * @param {Object} options
 * @param {Array<{label: string, y: number}>} [options.secondaryPoints] - Optional secondary comparison scenario
 * @param {string} [options.primaryName] - Name of primary scenario
 * @param {string} [options.secondaryName] - Name of secondary scenario
 * @param {number} [options.width] - SVG viewBox width
 * @param {number} [options.height] - SVG viewBox height
 */
export function progressionChart(points, {
  secondaryPoints = null,
  primaryName = "Scenario A",
  secondaryName = "Scenario B",
  width = 460,
  height = 180,
  colorA = "#0d9488",
  colorB = "#6366f1",
} = {}) {
  const allValues = [
    ...points.map((p) => p.y),
    ...(secondaryPoints ? secondaryPoints.map((p) => p.y) : []),
  ].filter(Number.isFinite);

  if (!allValues.length) {
    return `<div class="mujx-empty">Not enough numeric points to render progression chart.</div>`;
  }

  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  // Add a nice visual margin to Y axis
  const minY = Math.max(0, Math.floor(rawMin * 10 - 2) / 10);
  const maxY = Math.min(10, Math.ceil(rawMax * 10 + 2) / 10);
  const ySpan = Math.max(maxY - minY, 0.2);

  const padLeft = 38;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toCoords = (pts) => {
    return pts.map((pt, i) => {
      const x = pts.length === 1 ? padLeft + plotW / 2 : padLeft + (i / (pts.length - 1)) * plotW;
      const y = padTop + plotH - ((pt.y - minY) / ySpan) * plotH;
      return { ...pt, x, y };
    });
  };

  const coordsA = toCoords(points);
  const coordsB = secondaryPoints && secondaryPoints.length ? toCoords(secondaryPoints) : null;

  // Grid lines (3 horizontal reference lines)
  const gridSteps = 3;
  let gridLines = "";
  for (let s = 0; s <= gridSteps; s++) {
    const val = minY + (s / gridSteps) * (maxY - minY);
    const yPos = padTop + plotH - (s / gridSteps) * plotH;
    gridLines += `
      <line x1="${padLeft}" y1="${yPos.toFixed(1)}" x2="${width - padRight}" y2="${yPos.toFixed(1)}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3"/>
      <text x="${padLeft - 6}" y="${(yPos + 3.5).toFixed(1)}" text-anchor="end" class="mujx-chart-axis-val">${val.toFixed(1)}</text>
    `;
  }

  // Path generator
  const createPath = (coords) => {
    return coords.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
  };

  // Area generator (for soft gradient background under curve)
  const createArea = (coords) => {
    const first = coords[0];
    const last = coords[coords.length - 1];
    const bottomY = padTop + plotH;
    return `M${first.x.toFixed(1)} ${bottomY} ` +
      coords.map((pt) => `L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ") +
      ` L${last.x.toFixed(1)} ${bottomY} Z`;
  };

  const pathA = createPath(coordsA);
  const areaA = createArea(coordsA);

  const dotsA = coordsA.map((pt) => `
    <g class="mujx-chart-dot-group">
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${colorA}" stroke="#ffffff" stroke-width="2"/>
      <title>${escapeHtml(pt.label)}: CGPA ${Number(pt.y).toFixed(2)} (${escapeHtml(primaryName)})</title>
      <text x="${pt.x.toFixed(1)}" y="${(pt.y - 8).toFixed(1)}" text-anchor="middle" class="mujx-chart-point-val" fill="${colorA}">${Number(pt.y).toFixed(2)}</text>
    </g>
  `).join("");

  let secondarySvg = "";
  if (coordsB && coordsB.length) {
    const pathB = createPath(coordsB);
    const areaB = createArea(coordsB);
    const dotsB = coordsB.map((pt) => `
      <g class="mujx-chart-dot-group">
        <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${colorB}" stroke="#ffffff" stroke-width="2"/>
        <title>${escapeHtml(pt.label)}: CGPA ${Number(pt.y).toFixed(2)} (${escapeHtml(secondaryName)})</title>
        <text x="${pt.x.toFixed(1)}" y="${(pt.y + 16).toFixed(1)}" text-anchor="middle" class="mujx-chart-point-val" fill="${colorB}">${Number(pt.y).toFixed(2)}</text>
      </g>
    `).join("");

    secondarySvg = `
      <path d="${areaB}" fill="url(#mujx-grad-b)" opacity="0.18"/>
      <path d="${pathB}" fill="none" stroke="${colorB}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>
      ${dotsB}
    `;
  }

  // X axis labels
  const xLabels = coordsA.map((pt) => `
    <text x="${pt.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="mujx-chart-label">${escapeHtml(pt.label)}</text>
  `).join("");

  // Legend
  const legend = secondaryPoints ? `
    <div class="mujx-chart-legend">
      <span class="mujx-legend-item"><span class="mujx-legend-dot" style="background:${colorA}"></span> ${escapeHtml(primaryName)}</span>
      <span class="mujx-legend-item"><span class="mujx-legend-dot" style="background:${colorB}"></span> ${escapeHtml(secondaryName)}</span>
    </div>
  ` : "";

  return `
    <div class="mujx-chart-container">
      ${legend}
      <svg class="mujx-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="CGPA progression trajectory">
        <defs>
          <linearGradient id="mujx-grad-a" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${colorA}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${colorA}" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="mujx-grad-b" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${colorB}" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="${colorB}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${areaA}" fill="url(#mujx-grad-a)"/>
        <path d="${pathA}" fill="none" stroke="${colorA}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        ${secondarySvg}
        ${dotsA}
        ${xLabels}
      </svg>
    </div>
  `;
}

// Backward compatibility alias for single-line charts
export function sparkline(points, options = {}) {
  return progressionChart(points, options);
}
