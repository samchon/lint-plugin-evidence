/**
 * Reference-local constraints on how a claim acknowledges selected evidence.
 *
 * Omit this policy, or use an empty object, to retain the ordinary graph
 * behavior: either `@evidence` or `@evidenceExclude` can acknowledge a selected
 * unit, any selected host may cite any number of units, and one acknowledgement
 * is enough per unit.
 */
export interface IEvidenceGraphAcknowledgementPolicy {
  /**
   * Whether this reference refuses `@evidenceExclude` as an acknowledgement.
   *
   * A forbidden exclusion is reported and contributes no coverage to this
   * reference, so its target still needs positive evidence. The same exclusion
   * may still satisfy another reference whose policy allows it.
   *
   * @default false
   */
  forbidEvidenceExclude?: boolean;

  /**
   * Exact number of distinct selected reference units each selected semantic
   * claim host must cite positively.
   *
   * Hosts with no `@evidence` tag count as zero. Repeated tags do not increase
   * the count, while an aggregate target contributes every selected descendant
   * it covers.
   */
  exactEvidenceUnitsPerHost?: number;

  /**
   * Minimum number of distinct selected semantic claim hosts that must cite
   * each selected reference unit positively.
   *
   * Several tags on one host count once. An `@evidenceExclude` declaration
   * never contributes a positive host.
   */
  minimumEvidenceHostsPerUnit?: number;
}
