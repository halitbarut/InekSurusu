/** Oyuncuları renk dışında da ayırt etmek için çizgi desenleri (grafikler) */
const DASHES = ['', '8 4', '2 4', '10 3 2 3', '5 5', '1 3', '12 4 4 4', '6 2 2 2 2 2'];

export function playerDash(p: number): string {
  return DASHES[p % DASHES.length];
}
