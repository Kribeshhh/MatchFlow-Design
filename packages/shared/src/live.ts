/** Versions are decimal strings so transport never loses BIGINT precision. */
export function shouldApplyVersion(previous: string | undefined, incoming: string, resync = false) {
  return (
    /^\d{1,20}$/.test(incoming) &&
    (resync || previous === undefined || BigInt(incoming) > BigInt(previous))
  );
}
