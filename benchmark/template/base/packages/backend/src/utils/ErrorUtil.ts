import type { IDiagnosis } from "{{apiPackageName}}";
import { HttpException, type HttpExceptionOptions } from "@nestjs/common";

export namespace ErrorUtil {
  export const badRequest = http(400);
  export const unauthorized = http(401);
  export const paymentRequired = http(402);
  export const forbidden = http(403);
  export const notFound = http(404);
  export const conflict = http(409);
  export const gone = http(410);
  export const unprocessable = http(422);
  export const internal = http(500);

  function http(status: number) {
    return (
      reason: string | IDiagnosis | IDiagnosis[],
      options?: HttpExceptionOptions,
    ): HttpException => {
      const diagnoses: IDiagnosis[] =
        typeof reason === "string"
          ? [{ message: reason, accessor: "unknown" }]
          : Array.isArray(reason)
            ? reason
            : [reason];
      return new HttpException(diagnoses, status, options);
    };
  }
}
