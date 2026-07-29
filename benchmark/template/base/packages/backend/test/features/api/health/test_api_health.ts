import api from "{{apiPackageName}}";
import assert from "node:assert/strict";

/**
 * Calls the generated health accessor and verifies the exact process marker.
 *
 * @param connection Base connection supplied by the dynamic e2e runner.
 * @returns The number of assertions reported by this infrastructure proof.
 * @evidence {@link api.functional.health.get} Asserts the live response.
 */
export async function test_api_health(
  connection: api.IConnection,
): Promise<1> {
  assert.equal(await api.functional.health.get(connection), "OK");
  return 1;
}
