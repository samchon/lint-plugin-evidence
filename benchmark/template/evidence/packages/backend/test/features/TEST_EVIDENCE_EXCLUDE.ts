import type { HttpError } from "{{apiPackageName}}";

/**
 * Central exclusions for backend-test evidence claims.
 *
 * Keep real ownership evidence on the exported test function that proves it.
 * Add only reviewed non-applicability decisions here, for example:
 * `@evidenceExclude docs/analysis/example.md#section Frontend browser journeys own this presentation-only requirement; reject this exclusion if an API response varies by it.`
 *
 * @evidenceExclude {@link HttpError.prototype.toJSON} The inherited Nestia SDK dependency owns this transport-error serializer outside authored application behavior; remove this exclusion if an application requirement or authored test begins specifying HttpError serialization.
 */
export const TEST_EVIDENCE_EXCLUDE = true;
