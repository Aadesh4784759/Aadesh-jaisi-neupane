export interface ScrollViewportMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export const DEFAULT_CHAT_NEAR_BOTTOM_THRESHOLD_PX = 120;

/**
 * Determines whether a scrollable container is currently positioned near the bottom.
 * Used so chat auto-scrolling only follows streaming updates when the user hasn't
 * intentionally scrolled up to read earlier messages.
 */
export function isScrollContainerNearBottom(
  metrics: ScrollViewportMetrics,
  thresholdPx: number = DEFAULT_CHAT_NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  const scrollHeight = Math.max(0, Number(metrics.scrollHeight) || 0);
  const clientHeight = Math.max(0, Number(metrics.clientHeight) || 0);
  const scrollTop = Math.max(0, Number(metrics.scrollTop) || 0);
  if (scrollHeight <= clientHeight) return true;
  const distanceFromBottom = Math.max(0, scrollHeight - (scrollTop + clientHeight));
  return distanceFromBottom <= Math.max(0, thresholdPx);
}

/**
 * Resolves whether the chat feed should automatically scroll to the latest message
 * during an update (new message, streaming chunk, or interim voice transcript).
 */
export function shouldAutoScrollChatFeed(options: {
  isNearBottom: boolean;
  forceScroll: boolean;
  hasSearchFilter: boolean;
}): boolean {
  if (options.hasSearchFilter) return false;
  return Boolean(options.forceScroll || options.isNearBottom);
}
