/** Frozen content identities for one benchmark cell. */
export interface IEvidenceBenchmarkInputIdentity {
  /** Shared base plus selected arm template bytes. */
  templateSha256: string;

  /** Selected subject requirement bytes. */
  requirementsSha256: string;

  /** Selected arm instruction bytes. */
  instructionsSha256: string;
}
