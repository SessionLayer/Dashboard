/**
 * Helpers for building controls over a closed vocabulary from the generated
 * contract types.
 *
 * A hand-written array of a union type has no exhaustiveness requirement, so a
 * value added to the contract silently disappears from the control that offers
 * it — and for a permission vocabulary that fails in the worst direction: the
 * server rejects what nobody can select, and everything looks fine. Keying a
 * Record by the union instead makes the omission a compile error.
 */

/**
 * Build a `{value,label}` option list from a label map keyed by the vocabulary.
 *
 * Always pass the union explicitly — `enumOptions<Capability>({…})`. That is what
 * makes the map exhaustive: let it infer and the union collapses to whatever keys
 * happen to be present, which defeats the point. Key order is the presented order.
 */
export function enumOptions<T extends string>(
  labels: Record<T, string>,
): readonly { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
}

/**
 * The members of a closed vocabulary, for controls that render values directly.
 * Same rule: pass the union explicitly unless the argument is already a Record
 * annotated with it.
 */
export function enumMembers<T extends string>(
  table: Record<T, unknown>,
): readonly T[] {
  return Object.keys(table) as T[];
}
