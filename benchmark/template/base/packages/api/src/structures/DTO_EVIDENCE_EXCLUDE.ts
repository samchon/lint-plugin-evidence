/**
 * Central exclusions for DTO type and property evidence claims.
 *
 * Keep real ownership evidence on the DTO declaration that represents it.
 * Add only reviewed non-applicability decisions here, for example:
 * `@evidenceExclude prisma:ExampleModel.example_field No DTO transports this internal field.`
 */
export const DTO_EVIDENCE_EXCLUDE = true;
