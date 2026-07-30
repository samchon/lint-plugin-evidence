import api from "{{apiPackageName}}";
import assert from "node:assert/strict";

/**
 * Validate that the generated health accessor reaches the running backend.
 *
 * The scaffold needs one infrastructure proof that the generated SDK can call
 * the application it describes. This test derives an anonymous connection from
 * the runner's base host, pins the raw route contract, calls the health
 * accessor, and validates both responses against the generated contract.
 *
 * 1. Derive an anonymous connection from the base host.
 * 2. Call the raw `GET /health` route and assert its exact response.
 * 3. Call the generated health accessor.
 * 4. Assert the exact health marker.
 *
 * @param connection Base connection supplied by the dynamic e2e runner.
 * @evidence {@link api.functional.health.get} Exercises the generated health operation.
 */
export async function test_api_health(
  connection: api.IConnection,
): Promise<void> {
  // Step 1: Derive an anonymous connection from the base host
  const healthConnection: api.IConnection = { host: connection.host };

  // Step 2: Pin the raw route and response contract
  const rawResponse = await fetch(new URL("/health", connection.host));
  assert.equal(rawResponse.status, 200);
  assert.equal(await rawResponse.text(), "OK");

  // Step 3: Call the generated health accessor
  const response = await api.functional.health.get(healthConnection);

  // Step 4: Assert the exact health marker
  assert.equal(response, "OK");
}
