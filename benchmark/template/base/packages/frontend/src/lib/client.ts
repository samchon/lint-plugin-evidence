import type { IConnection } from "@nestia/fetcher";

import { config } from "@/lib/config";

export const apiConnection: IConnection = {
  host: config.apiHost,
  simulate: config.simulate,
};
