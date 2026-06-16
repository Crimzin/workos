export const DEFAULT_MOBILE_NAV_OPEN = true;
export const MOBILE_DRAWER_EDGE_WIDTH = 72;
const MOBILE_DRAWER_SWIPE_DISTANCE = 72;
const MOBILE_DRAWER_VERTICAL_TOLERANCE = 42;

interface MobileDrawerSwipeInput {
  drawerOpen: boolean;
  startX: number;
  deltaX: number;
  deltaY: number;
}

export type MobileDrawerSwipeIntent = "open" | "close" | "none";

export function getMobileDrawerSwipeIntent({
  drawerOpen,
  startX,
  deltaX,
  deltaY,
}: MobileDrawerSwipeInput): MobileDrawerSwipeIntent {
  if (Math.abs(deltaY) > MOBILE_DRAWER_VERTICAL_TOLERANCE) {
    return "none";
  }

  if (
    !drawerOpen &&
    startX <= MOBILE_DRAWER_EDGE_WIDTH &&
    deltaX >= MOBILE_DRAWER_SWIPE_DISTANCE
  ) {
    return "open";
  }

  if (drawerOpen && deltaX <= -MOBILE_DRAWER_SWIPE_DISTANCE) {
    return "close";
  }

  return "none";
}
