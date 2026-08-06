import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import type { IEvidenceBenchmarkApiCost } from "./structures/IEvidenceBenchmarkApiCost";

/**
 * Prices a run from the Codex session that produced it.
 *
 * The runner's retained event stream is the exact source and is preferred, but
 * it only exists for the turns the runner brokered. A cell driven by hand
 * leaves prose on a console and nothing else, so a campaign that intervened at
 * all cannot price most of itself from that side. The session rollout is the
 * other end of the same wire: Codex records the counter there whichever process
 * dispatched the turn.
 *
 * This is exact rather than approximate for one specific reason. The only
 * per-request decision in the price is whether a request's input crosses the
 * long-context threshold; every other term is a rate applied to a total. Where
 * no request crosses it, the price reduces to a function of four figures the
 * session's own final counter carries. Where some do, their share is measured
 * from the per-request readings rather than assumed, and the two rates are
 * blended by it — which is an apportionment, and is reported as a lower
 * confidence than a clean replay.
 */
export namespace EvidenceBenchmarkSessionCost {
  interface ITokenPrice {
    input: number;
    cachedInput: number;
    cacheWriteInput: number;
    output: number;
  }

  const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000 as const;
  const PRICING_AS_OF = "2026-08-01" as const;
  const PRICE_SOURCE = "https://openrouter.ai/api/v1/models" as const;

  const PRICES: Readonly<Record<string, { short: ITokenPrice; long: ITokenPrice }>> =
    {
      "gpt-5.6-luna": {
        short: { input: 0.1, cachedInput: 0.01, cacheWriteInput: 0.125, output: 0.6 },
        long: { input: 0.2, cachedInput: 0.02, cacheWriteInput: 0.25, output: 0.9 },
      },
      "gpt-5.6-terra": {
        short: { input: 1, cachedInput: 0.1, cacheWriteInput: 1.25, output: 6 },
        long: { input: 2, cachedInput: 0.2, cacheWriteInput: 2.5, output: 9 },
      },
      "gpt-5.6-sol": {
        short: { input: 5, cachedInput: 0.5, cacheWriteInput: 6.25, output: 30 },
        long: { input: 10, cachedInput: 1, cacheWriteInput: 12.5, output: 45 },
      },
    };

  interface ISession {
    runId: string;
    final: Record<string, number>;
    longTokens: number;
    shortTokens: number;
    requests: number;
  }

  const RUN_ID =
    /runs[\\/]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/u;

  /** Every benchmark run priced from its sessions, keyed by run id. */
  export const collect = async (
    model: string,
  ): Promise<ReadonlyMap<string, IEvidenceBenchmarkApiCost>> => {
    const prices = PRICES[model.toLowerCase()];
    const found: Map<string, ISession[]> = new Map();
    if (prices === undefined) return new Map();
    for (const file of rollouts()) {
      // The session's own header names its workspace, so a session belonging to
      // no benchmark run is skipped without reading the rest of it. Most of a
      // developer's sessions are not benchmark runs, and reading them all to
      // learn that costs more than the whole report.
      const runId: string | undefined = readRunId(file);
      if (runId === undefined) continue;
      const session: ISession | undefined = await readSession(file, runId);
      if (session === undefined) continue;
      if (!found.has(runId)) found.set(runId, []);
      found.get(runId)!.push(session);
    }
    const result: Map<string, IEvidenceBenchmarkApiCost> = new Map();
    for (const [runId, sessions] of found) {
      let amountUsd: number = 0;
      let requests: number = 0;
      let shortContextRequests: number = 0;
      let longContextRequests: number = 0;
      for (const session of sessions) {
        const total: number = session.longTokens + session.shortTokens;
        const share: number = total === 0 ? 0 : session.longTokens / total;
        amountUsd +=
          cost(session.final, prices.short) * (1 - share) +
          cost(session.final, prices.long) * share;
        requests += session.requests;
        longContextRequests += Math.round(session.requests * share);
        shortContextRequests += session.requests - Math.round(session.requests * share);
      }
      result.set(runId, {
        provider: "openrouter",
        pricingAsOf: PRICING_AS_OF,
        priceSource: PRICE_SOURCE,
        currency: "USD",
        amountUsd: Math.round(amountUsd * 100_000_000) / 100_000_000,
        requests,
        shortContextRequests,
        longContextRequests,
        longContextThresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
      });
    }
    return result;
  };

  const cost = (
    usage: Record<string, number>,
    price: ITokenPrice,
  ): number => {
    const uncached: number =
      (usage.input_tokens ?? 0) -
      (usage.cached_input_tokens ?? 0) -
      (usage.cache_write_input_tokens ?? 0);
    return (
      (uncached * price.input +
        (usage.cached_input_tokens ?? 0) * price.cachedInput +
        (usage.cache_write_input_tokens ?? 0) * price.cacheWriteInput +
        (usage.output_tokens ?? 0) * price.output) /
      1_000_000
    );
  };

  const rollouts = (): string[] => {
    const root: string = path.join(os.homedir(), ".codex", "sessions");
    if (!fs.existsSync(root)) return [];
    const walk = (directory: string): string[] =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(directory, entry.name))
            : /^rollout-.*\.jsonl$/u.test(entry.name)
              ? [path.join(directory, entry.name)]
              : [],
        );
    return walk(root);
  };

  /** Reads the run this session worked in, from its header alone. */
  const readRunId = (file: string): string | undefined => {
    const buffer: Buffer = Buffer.alloc(4096);
    const descriptor: number = fs.openSync(file, "r");
    try {
      const length: number = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
      return RUN_ID.exec(buffer.subarray(0, length).toString("utf8"))?.[1];
    } finally {
      fs.closeSync(descriptor);
    }
  };

  const readSession = (
    file: string,
    runId: string,
  ): Promise<ISession | undefined> =>
    new Promise((resolve) => {
      let final: Record<string, number> | undefined;
      let longTokens: number = 0;
      let shortTokens: number = 0;
      let requests: number = 0;
      readline
        .createInterface({ input: fs.createReadStream(file) })
        .on("line", (line) => {
          if (!line.includes("last_token_usage")) return;
          let record: Record<string, any>;
          try {
            record = JSON.parse(line);
          } catch {
            return;
          }
          const info: Record<string, any> | undefined = record.payload?.info;
          const total: Record<string, number> | undefined =
            info?.total_token_usage;
          const last: Record<string, number> | undefined = info?.last_token_usage;
          if (
            total === undefined ||
            last === undefined ||
            typeof total.total_tokens !== "number" ||
            typeof last.input_tokens !== "number"
          )
            return;
          // The counter is the session's own and a resumed process continues
          // it, so the highest reading is the session's end whatever order the
          // lines arrived in.
          if (final === undefined || total.total_tokens > (final.total_tokens ?? 0))
            final = total;
          requests += 1;
          if (last.input_tokens >= LONG_CONTEXT_THRESHOLD_TOKENS)
            longTokens += last.total_tokens ?? 0;
          else shortTokens += last.total_tokens ?? 0;
        })
        .on("close", () =>
          resolve(
            final === undefined
              ? undefined
              : { runId, final, longTokens, shortTokens, requests },
          ),
        );
    });
}
