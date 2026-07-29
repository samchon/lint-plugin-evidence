import api from "{{apiPackageName}}";
import assert from "node:assert/strict";

/**
 * Calls the generated health accessor and verifies the exact process marker.
 *
 * @param connection Base connection supplied by the dynamic e2e runner.
 * @returns The number of raw and typed assertions in this infrastructure proof.
 * @evidence GET:/health Asserts the published health operation.
 */
export async function test_api_health(
  connection: api.IConnection,
): Promise<3> {
  const response: Response = await fetch(`${connection.host}/health`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "OK");
  assert.equal(await api.functional.health.get(connection), "OK");
  return 3;
}
