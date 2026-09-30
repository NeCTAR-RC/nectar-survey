/** "1 error", "2 errors": a count with its word, plural unless it is one. */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
