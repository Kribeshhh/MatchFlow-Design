export function seedOrder(size: number) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap((n) => [n, sum - n]);
  }
  return seeds;
}
