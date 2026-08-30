export type FlowRect = { x: number; y: number; width: number; height: number };
export type FlowViewport = { x: number; y: number; zoom: number };
export type PaneSize = { width: number; height: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 1.5;
export const READABLE_ZOOM = 1;
export const OPENING_PAD = 48;

export function openingViewport(bounds: FlowRect, pane: PaneSize): FlowViewport {
  if (pane.width <= 0 || pane.height <= 0 || bounds.width <= 0) {
    return { x: 0, y: 0, zoom: READABLE_ZOOM };
  }

  const zoomForWidth = (pane.width - OPENING_PAD * 2) / bounds.width;
  const zoom = Math.min(READABLE_ZOOM, Math.max(MIN_ZOOM, zoomForWidth));
  const x = (pane.width - bounds.width * zoom) / 2 - bounds.x * zoom;
  const fittedHeight = bounds.height * zoom;
  if (fittedHeight <= pane.height - OPENING_PAD * 2) {
    return {
      x,
      y: (pane.height - fittedHeight) / 2 - bounds.y * zoom,
      zoom,
    };
  }

  // Tall maps: keep cards readable and pin the root to the top, like roadmap.sh.
  return { x, y: OPENING_PAD - bounds.y * zoom, zoom };
}
