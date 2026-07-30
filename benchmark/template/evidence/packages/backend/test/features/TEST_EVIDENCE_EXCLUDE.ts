import type { HttpError } from "{{apiPackageName}}";

/**
 * Central exclusions for backend-test evidence claims.
 *
 * Keep real ownership evidence on the exported test function that proves it.
 * Add only reviewed non-applicability decisions here, for example:
 * `@evidenceExclude docs/analysis/example.md#section This package cannot observe the requirement through its public API.`
 *
 * @evidenceExclude {@link HttpError.prototype.toJSON} Backend feature tests do not exercise the generated SDK error serializer.
 */
export const TEST_EVIDENCE_EXCLUDE = true;
