import { SOURCE_PENALTY } from "./config";

/**
 * Source preference rule (code, not AI): a source is lowered for a person only when
 * dislikes >= 3 AND dislikes > loves. One or two dislikes never change a source's standing.
 */
export function sourcePenalty(loves: number, dislikes: number): number {
  return dislikes >= 3 && dislikes > loves ? SOURCE_PENALTY : 0;
}
