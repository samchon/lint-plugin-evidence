import { Controller, Get } from "@nestjs/common";

/**
 * Reports whether the HTTP application is accepting requests.
 */
@Controller()
export class HealController {
  /**
   * Returns the process health marker.
   *
   * @returns Literal marker used by local and deployed health probes.
   */
  @Get("health")
  public get(): string {
    return "OK";
  }
}
