/**
 * QIdentity — backward-compatible re-export of HyperBlackQ
 *
 * All existing imports of QIdentity / QIdentitySmall continue to work.
 * The underlying implementation is now the hyper-black glass SVG emblem.
 */
export type { QState } from "./HyperBlackQ";
export { HyperBlackQ as QIdentity, HyperBlackQSmall as QIdentitySmall } from "./HyperBlackQ";
