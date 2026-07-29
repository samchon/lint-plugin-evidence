import { NestedDiscoveryController } from "./NestedDiscoveryController";

/** Conditionally re-exports one controller to prove duplicate rejection. */
export const DISCOVERY_DUPLICATE =
  process.env.DISCOVERY_DUPLICATE === "1"
    ? NestedDiscoveryController
    : class DiscoveryDuplicateDisabled {};
