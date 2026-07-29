import { TypedRoute } from "@nestia/core";
import { Controller as HttpController } from "@nestjs/common";

/** Proves that a nested controller needs no static module registration. */
@HttpController("discovery")
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
