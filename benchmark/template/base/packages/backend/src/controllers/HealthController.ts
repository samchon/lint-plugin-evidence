import { Controller, Get, Header } from "@nestjs/common";

/**
 * Reports whether the HTTP application is accepting requests.
 */
@Controller()
export class HealthController {
  /**
   * Returns the process health marker.
   *
   * @returns Literal marker used by local and deployed health probes.
   *
   * @internal
   */
  @Get("health")
  @Header("Content-Type", "text/plain")
  public get(): string {
    return "OK";
  }
}
