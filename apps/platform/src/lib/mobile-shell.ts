export const DEFAULT_MOBILE_NAV_OPEN = true;
export const MOBILE_DRAWER_EDGE_WIDTH = 72;
const MOBILE_DRAWER_SWIPE_DISTANCE = 72;
const MOBILE_DRAWER_SWIPE_PREVENT_DISTANCE = 16;
const MOBILE_DRAWER_VERTICAL_TOLERANCE = 42;

interface MobileDrawerSwipeInput {
  drawerOpen: boolean;
  startX: number;
  deltaX: number;
  deltaY: number;
}

export type MobileDrawerSwipeIntent = "open" | "close" | "none";

export function shouldPreventMobileDrawerBrowserNavigation({
  drawerOpen,
  startX,
  deltaX,
  deltaY,
}: MobileDrawerSwipeInput): boolean {
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    return false;
  }

  if (Math.abs(deltaY) > MOBILE_DRAWER_VERTICAL_TOLERANCE) {
    return false;
  }

  if (
    !drawerOpen &&
    startX <= MOBILE_DRAWER_EDGE_WIDTH &&
    deltaX >= MOBILE_DRAWER_SWIPE_PREVENT_DISTANCE
  ) {
    return true;
  }

  if (drawerOpen && deltaX <= -MOBILE_DRAWER_SWIPE_PREVENT_DISTANCE) {
    return true;
  }

  return false;
}

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
