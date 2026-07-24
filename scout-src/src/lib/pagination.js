/**
 * Which page numbers to show. Always the first, the last, and a window
 * around the current one, with gaps marked so a long list does not turn
 * into a wall of numbers.
 */
export function pageList(current, total) {
  const want = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => want.add(n));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => want.add(n));

  const list = [...want].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}
