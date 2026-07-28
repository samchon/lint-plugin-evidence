import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";

/**
 * Deduplicated inclusive-token accounting and response-observed stop
 * enforcement.
 */
export class EvidenceBenchmarkCodexCostLedger {
  private readonly responseIds = new Set<string>();
  private observedTotalTokens = 0;
  private overshootTokens = 0;
  private stopTriggered = false;
  private wallClockStopTriggered = false;
  private usageLowerBound = false;
  private sharedStopDigest: string | null = null;
  private hardDeadlineUtc: string | null = null;
  private executionSafetySha256: string | null = null;

  /**
   * Creates a non-monetary ledger from explicit token and wall-time authority.
   *
   * @param maximumObservedTotalTokens Response-observed token threshold.
   * @param maximumObservedBlockTotalTokens Outer block token threshold.
   * @param hardWallDurationSeconds Cell duration derived from exact t0.
   * @param blockHardWallDurationSeconds Outer block launch duration.
   * @param clock Injected wall clock for deterministic boundary tests.
   * @param recovered Previously checkpointed non-monetary stop report.
   */
  public constructor(
    private readonly maximumObservedTotalTokens: number,
    private readonly maximumObservedBlockTotalTokens: number,
    private readonly hardWallDurationSeconds: number,
    private readonly blockHardWallDurationSeconds: number,
    private readonly clock: () => number = Date.now,
    recovered?: IEvidenceBenchmarkCodexRun.ICostReport,
  ) {
    if (
      !Number.isSafeInteger(maximumObservedTotalTokens) ||
      maximumObservedTotalTokens <= 0 ||
      !Number.isSafeInteger(maximumObservedBlockTotalTokens) ||
      maximumObservedBlockTotalTokens < maximumObservedTotalTokens ||
      !Number.isSafeInteger(hardWallDurationSeconds) ||
      hardWallDurationSeconds <= 0 ||
      !Number.isSafeInteger(blockHardWallDurationSeconds) ||
      blockHardWallDurationSeconds < hardWallDurationSeconds
    )
      throw new Error("observed token threshold or hard deadline is invalid");
    if (recovered !== undefined) {
      if (
        recovered.schemaVersion !== 1 ||
        recovered.unit !== "provider_total_tokens" ||
        recovered.maximumObservedTotalTokens !== maximumObservedTotalTokens ||
        recovered.maximumObservedBlockTotalTokens !==
          maximumObservedBlockTotalTokens ||
        recovered.hardWallDurationSeconds !== hardWallDurationSeconds ||
        recovered.blockHardWallDurationSeconds !==
          blockHardWallDurationSeconds ||
        recovered.hardCeilingGuaranteed !== false ||
        recovered.controllerTurnStartGateOnly !== true ||
        recovered.monetaryStatus !== "unavailable" ||
        recovered.providerCredits !== null ||
        recovered.usd !== null ||
        !Number.isSafeInteger(recovered.observedTotalTokens) ||
        recovered.observedTotalTokens < 0 ||
        !Number.isSafeInteger(recovered.responseObservedOvershootTokens) ||
        recovered.responseObservedOvershootTokens < 0 ||
        new Set(recovered.responseIds).size !== recovered.responseIds.length
      )
        throw new Error("recovered observed-token report is invalid");
      for (const responseId of recovered.responseIds) {
        if (responseId.length === 0)
          throw new Error("recovered response id must be nonempty");
        this.responseIds.add(responseId);
      }
      this.observedTotalTokens = recovered.observedTotalTokens;
      this.overshootTokens = recovered.responseObservedOvershootTokens;
      this.stopTriggered = recovered.responseObservedStopTriggered;
      this.wallClockStopTriggered = recovered.wallClockStopTriggered;
      this.usageLowerBound = recovered.usageAfterStopLowerBound;
      this.hardDeadlineUtc = recovered.hardDeadlineUtc;
      this.executionSafetySha256 = recovered.executionSafetySha256;
      if (recovered.sharedStopDigest !== null)
        this.markSharedStop(recovered.sharedStopDigest);
    }
  }

  /** Adds one unique exact upstream response using inclusive `totalTokens`. */
  public ingest(response: IEvidenceBenchmarkCodexRecord.IResponseUsage): void {
    if (this.responseIds.has(response.responseId)) return;
    this.responseIds.add(response.responseId);
    this.observedTotalTokens += response.usage.totalTokens;
    this.overshootTokens = Math.max(
      0,
      this.observedTotalTokens - this.maximumObservedTotalTokens,
    );
  }

  /** Freezes the cell deadline exactly once from the first turn-start event. */
  public activateDeadline(
    t0Utc: string,
    executionSafetySha256: string,
  ): string {
    if (
      !Number.isFinite(Date.parse(t0Utc)) ||
      !/^[0-9a-f]{64}$/.test(executionSafetySha256)
    )
      throw new Error("t0 or execution-safety SHA-256 is invalid");
    const hardDeadlineUtc = new Date(
      Date.parse(t0Utc) + this.hardWallDurationSeconds * 1_000,
    ).toISOString();
    if (
      this.hardDeadlineUtc !== null &&
      (this.hardDeadlineUtc !== hardDeadlineUtc ||
        this.executionSafetySha256 !== executionSafetySha256)
    )
      throw new Error("cell hard deadline changed after exact t0");
    this.hardDeadlineUtc = hardDeadlineUtc;
    this.executionSafetySha256 = executionSafetySha256;
    return hardDeadlineUtc;
  }

  /**
   * Rejects a later controller-issued top-level turn after either boundary.
   *
   * App-server internal retries, tool loops, and descendant requests do not
   * pass through this controller hook.
   */
  public assertCanStartProviderTurn(): void {
    const reason = this.stopReason();
    if (reason !== null)
      throw new EvidenceBenchmarkCodexCostLedger.BudgetExceeded(
        reason,
        this.observedTotalTokens,
        this.maximumObservedTotalTokens,
        this.overshootTokens,
      );
  }

  /** Marks the response-observed threshold as the global stop cause. */
  public markResponseObservedStop(): void {
    this.stopTriggered = true;
  }

  /** Marks the absolute wall deadline as the global stop cause. */
  public markHardDeadlineStop(): void {
    this.wallClockStopTriggered = true;
  }

  /** Marks final usage and derived reductions as right-censored lower bounds. */
  public markUsageLowerBound(): void {
    this.usageLowerBound = true;
  }

  /** Records the outer four-cell stop decision without account identifiers. */
  public markSharedStop(sharedStopDigest: string): void {
    if (!/^[0-9a-f]{64}$/.test(sharedStopDigest))
      throw new Error("shared safety-stop digest must be lowercase SHA-256");
    if (
      this.sharedStopDigest !== null &&
      this.sharedStopDigest !== sharedStopDigest
    )
      throw new Error("shared safety-stop digest changed after first stop");
    this.sharedStopDigest = sharedStopDigest;
  }

  /** Returns exact non-monetary threshold evidence for terminal reporting. */
  public report(): IEvidenceBenchmarkCodexRun.ICostReport {
    return {
      schemaVersion: 1,
      unit: "provider_total_tokens",
      maximumObservedTotalTokens: this.maximumObservedTotalTokens,
      observedTotalTokens: this.observedTotalTokens,
      responseObservedOvershootTokens: this.overshootTokens,
      responseIds: [...this.responseIds],
      thresholdReached:
        this.observedTotalTokens >= this.maximumObservedTotalTokens,
      hardWallDurationSeconds: this.hardWallDurationSeconds,
      hardDeadlineUtc: this.hardDeadlineUtc,
      maximumObservedBlockTotalTokens: this.maximumObservedBlockTotalTokens,
      blockHardWallDurationSeconds: this.blockHardWallDurationSeconds,
      hardDeadlineReached: this.wallClockStopTriggered,
      wallClockStopTriggered: this.wallClockStopTriggered,
      hardCeilingGuaranteed: false,
      responseObservedStopTriggered: this.stopTriggered,
      controllerTurnStartGateOnly: true,
      usageAfterStopLowerBound: this.usageLowerBound,
      monetaryStatus: "unavailable",
      providerCredits: null,
      usd: null,
      sharedStopDigest: this.sharedStopDigest,
      executionSafetySha256: this.executionSafetySha256,
    };
  }

  /** Parses a frozen price-source record without inventing missing rates. */
  public static priceSheet(
    input: unknown,
  ): IEvidenceBenchmarkCodexRun.IPriceSheet {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("price sheet must be an object");
    const sheet = input as unknown as IEvidenceBenchmarkCodexRun.IPriceSheet;
    EvidenceBenchmarkCodexCostLedger.validatePriceSheet(sheet);
    return sheet;
  }

  private stopReason(): "observed_token_threshold" | "hard_deadline" | null {
    if (
      this.hardDeadlineUtc !== null &&
      this.clock() >= Date.parse(this.hardDeadlineUtc)
    )
      return "hard_deadline";
    if (this.observedTotalTokens >= this.maximumObservedTotalTokens)
      return "observed_token_threshold";
    return null;
  }

  private static validatePriceSheet(
    sheet: IEvidenceBenchmarkCodexRun.IPriceSheet,
  ): void {
    if (
      sheet.schemaVersion !== 1 ||
      sheet.model !== "gpt-5.6-terra" ||
      sheet.serviceTier !== "default" ||
      sheet.reasoningTokensIncludedInOutput !== true ||
      sheet.unit !== "provider_credits" ||
      !Number.isSafeInteger(sheet.tokenUnit) ||
      sheet.tokenUnit <= 0 ||
      sheet.ratesPerMillionTokens.cacheWriteInput !== null ||
      sheet.monetaryUse?.status !== "unavailable" ||
      sheet.monetaryUse.launchBlocking !== false
    )
      throw new Error("price sheet identity or monetary status is invalid");
    for (const rate of [
      sheet.ratesPerMillionTokens.uncachedInput,
      sheet.ratesPerMillionTokens.cachedInput,
      sheet.ratesPerMillionTokens.output,
    ])
      if (!Number.isFinite(rate) || rate < 0)
        throw new Error(
          "known price sheet rates must be finite and nonnegative",
        );
  }
}

/** Errors and static contracts for {@link EvidenceBenchmarkCodexCostLedger}. */
export namespace EvidenceBenchmarkCodexCostLedger {
  /** Raised after a response-observed token threshold or hard deadline. */
  export class BudgetExceeded extends Error {
    /**
     * Creates a right-censoring stop error.
     *
     * @param reason Boundary that forced the stop.
     * @param observedTotalTokens Exact tokens already observed.
     * @param maximumObservedTotalTokens Response-observed token threshold.
     * @param overshootTokens Unbounded in-flight response overshoot observed.
     */
    public constructor(
      public readonly reason: "observed_token_threshold" | "hard_deadline",
      public readonly observedTotalTokens: number,
      public readonly maximumObservedTotalTokens: number,
      public readonly overshootTokens: number,
    ) {
      super(
        `${reason} exhausted: ${observedTotalTokens} observed tokens, threshold ${maximumObservedTotalTokens}`,
      );
      this.name = "EvidenceBenchmarkCodexBudgetExceeded";
    }
  }
}
