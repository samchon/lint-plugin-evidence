import { TypedRoute } from "@nestia/core";
import { Controller } from "@nestjs/common";

/** Proves that a nested controller needs no static module registration. */
@Controller("discovery")
export class NestedDiscoveryController {
  /**
   * Returns the nested discovery marker.
   *
   * @returns Marker proving runtime, SDK, and Swagger population agreement.
   */
  @TypedRoute.Get("nested")
  public nested(): { source: "nested" } {
    return { source: "nested" };
  }
}
