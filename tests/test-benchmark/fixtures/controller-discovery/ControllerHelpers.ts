/** A non-controller const that discovery must ignore. */
export const DISCOVERY_HELPER = "helper";

/** A non-controller function that discovery must ignore. */
export const discoveryHelper = (): string => DISCOVERY_HELPER;

/** A non-controller class that discovery must ignore. */
export class DiscoveryHelper {
  /** Returns the helper marker. */
  public get value(): string {
    return DISCOVERY_HELPER;
  }
}
