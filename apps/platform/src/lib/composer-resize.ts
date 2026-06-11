export const COMPOSER_DEFAULT_MIN_HEIGHT = 44;
export const COMPOSER_DEFAULT_MAX_HEIGHT = 192;
export const COMPOSER_FIXED_MIN_HEIGHT = 56;
export const COMPOSER_FIXED_MAX_HEIGHT = 360;
export const COMPOSER_COMPACT_HEIGHT = 44;
export const COMPOSER_SCROLL_AWAY_MULTIPLIER = 1.25;
export const COMPOSER_EXPAND_DISTANCE_FROM_BOTTOM = 96;

export function clampComposerHeight(height: number): number {
  return Math.round(
    Math.max(COMPOSER_FIXED_MIN_HEIGHT, Math.min(COMPOSER_FIXED_MAX_HEIGHT, height))
  );
}

export function getNextComposerCompactState(
  currentlyCompact: boolean,
  distanceFromBottom: number,
  visibleFeedHeight: number
): boolean {
  if (currentlyCompact) {
    return distanceFromBottom > COMPOSER_EXPAND_DISTANCE_FROM_BOTTOM;
  }

  return distanceFromBottom > visibleFeedHeight * COMPOSER_SCROLL_AWAY_MULTIPLIER;
}
