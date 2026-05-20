export const DETAIL_PANEL_MIN_WIDTH = 320;
export const DETAIL_PANEL_DEFAULT_WIDTH = 520;
export const DETAIL_PANEL_SNAP_THRESHOLD = 24;
export const DETAIL_PANEL_DIVIDER_WIDTH = 4;

export function getDetailPanelMaxWidth(availableWidth: number): number {
  return Math.max(DETAIL_PANEL_MIN_WIDTH, availableWidth - DETAIL_PANEL_DIVIDER_WIDTH);
}

export function clampDetailPanelWidth(width: number, availableWidth: number): number {
  const maxWidth = getDetailPanelMaxWidth(availableWidth);
  return Math.round(Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(maxWidth, width)));
}

export function snapDetailPanelWidth(width: number, availableWidth: number): number {
  const clamped = clampDetailPanelWidth(width, availableWidth);
  const snapPoints = [
    DETAIL_PANEL_MIN_WIDTH,
    DETAIL_PANEL_DEFAULT_WIDTH,
    getDetailPanelMaxWidth(availableWidth),
  ];

  for (const point of snapPoints) {
    if (Math.abs(clamped - point) <= DETAIL_PANEL_SNAP_THRESHOLD) {
      return clampDetailPanelWidth(point, availableWidth);
    }
  }

  return clamped;
}

export function detailPanelWidthFromPointer({
  containerLeft,
  containerRight,
  pointerX,
}: {
  containerLeft: number;
  containerRight: number;
  pointerX: number;
}): number {
  const availableWidth = containerRight - containerLeft;
  return clampDetailPanelWidth(
    containerRight - pointerX - DETAIL_PANEL_DIVIDER_WIDTH,
    availableWidth
  );
}
