import readline from "node:readline";

const scenarios = new Set(
  (process.env.EVIDENCE_FAKE_SCENARIO ?? "fragmented")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const primaryThread = {
  id: "thread-primary",
  parentThreadId: null,
  sessionId: "session-1",
  path: process.env.EVIDENCE_FAKE_ROLLOUT ?? null,
  status: { type: "idle" },
  source: "appServer",
  cwd: process.cwd(),
  ephemeral: false,
  cliVersion: "0.145.0",
  modelProvider: "openai",
  preview: "",
  turns: [],
  createdAt: 1,
  updatedAt: 1,
};
const childThread = {
  ...primaryThread,
  id: "thread-child",
  parentThreadId: "thread-primary",
  source: {
    subAgent: {
      thread_spawn: { depth: 1, parent_thread_id: "thread-primary" },
    },
  },
};
let turnNumber = 0;
let steerRejected = false;
let output = Promise.resolve();

function emit(value, incomplete = false) {
  const line = incomplete ? String(value) : `${JSON.stringify(value)}\n`;
  output = output.then(async () => {
    if (!scenarios.has("fragmented") || line.length < 4) {
      process.stdout.write(line);
      return;
    }
    const one = Math.max(1, Math.floor(line.length / 3));
    const two = Math.max(one + 1, Math.floor((line.length * 2) / 3));
    process.stdout.write(line.slice(0, one));
    await new Promise((resolve) => setTimeout(resolve, 1));
    process.stdout.write(line.slice(one, two));
    await new Promise((resolve) => setTimeout(resolve, 1));
    process.stdout.write(line.slice(two));
  });
}

function response(id, result) {
  emit({ id, result });
}

function error(id, message) {
  emit({ id, error: { code: -32000, message } });
}

function usage(
  totalTokens,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
) {
  return {
    totalTokens,
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens: 0,
    outputTokens,
    reasoningOutputTokens,
  };
}

function completeTurn(threadId, turnId, interrupted = false) {
  const first = usage(100, 80, 20, 20, 5);
  emit({
    method: "rawResponse/completed",
    params: {
      responseId: `response-${turnId}`,
      threadId,
      turnId,
      usage: first,
    },
  });
  if (scenarios.has("duplicate"))
    emit({
      method: "rawResponse/completed",
      params: {
        responseId: `response-${turnId}`,
        threadId,
        turnId,
        usage: first,
      },
    });
  emit({
    method: "thread/tokenUsage/updated",
    params: { threadId, turnId, tokenUsage: { last: first, total: first } },
  });
  if (turnNumber === 1 && scenarios.has("descendant")) {
    const childUsage = usage(50, 35, 5, 15, 3);
    emit({ method: "thread/started", params: { thread: childThread } });
    emit({
      method: "rawResponse/completed",
      params: {
        responseId: "response-child",
        threadId: childThread.id,
        turnId: "turn-child",
        usage: childUsage,
      },
    });
    emit({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: childThread.id,
        turnId: "turn-child",
        tokenUsage: { last: childUsage, total: childUsage },
      },
    });
  }
  emit({ method: "future/unknown", params: { retained: true } });
  if (scenarios.has("malformed")) emit('{"method":bad}\n', true);
  emit({
    method: "item/completed",
    params: {
      threadId,
      turnId,
      item: {
        id: `message-${turnId}`,
        type: "agentMessage",
        phase: "final_answer",
        text: "All requested work is complete.",
      },
    },
  });
  emit({
    method: "turn/completed",
    params: {
      threadId,
      turn: {
        id: turnId,
        items: [],
        status: interrupted ? "interrupted" : "completed",
        startedAt: 1,
        completedAt: 2,
        durationMs: 1000,
      },
    },
  });
  emit({
    method: "thread/goal/updated",
    params: {
      threadId,
      turnId,
      goal: {
        threadId,
        objective: "finish",
        status: interrupted ? "paused" : "complete",
        tokenBudget: null,
        tokensUsed: 100,
        timeUsedSeconds: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  });
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === "initialize") {
    response(id, { serverInfo: { name: "fake-codex", version: "0.145.0" } });
  } else if (method === "initialized") {
    return;
  } else if (method === "thread/start") {
    response(id, { thread: primaryThread });
    emit({ method: "thread/started", params: { thread: primaryThread } });
  } else if (method === "thread/resume") {
    response(id, { thread: primaryThread });
  } else if (method === "thread/goal/set") {
    const goal = {
      threadId: params.threadId,
      objective: params.objective,
      status: params.status ?? "active",
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    response(id, { goal });
    emit({
      method: "thread/goal/updated",
      params: { threadId: params.threadId, goal },
    });
  } else if (method === "thread/goal/get") {
    response(id, {
      goal: {
        threadId: params.threadId,
        objective: "finish",
        status: "active",
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    });
  } else if (method === "turn/start") {
    const turnId = `turn-${++turnNumber}`;
    response(id, { turn: { id: turnId, items: [], status: "inProgress" } });
    emit({
      method: "turn/started",
      params: {
        threadId: params.threadId,
        turn: { id: turnId, items: [], status: "inProgress", startedAt: 1 },
      },
    });
    setTimeout(
      () => completeTurn(params.threadId, turnId, scenarios.has("interrupted")),
      5,
    );
  } else if (method === "turn/steer") {
    if (scenarios.has("steering-race") && !steerRejected) {
      steerRejected = true;
      error(id, "active turn changed before steering");
    } else {
      response(id, { turnId: params.expectedTurnId });
    }
  } else if (method === "thread/list") {
    response(id, {
      data: scenarios.has("descendant")
        ? [primaryThread, childThread]
        : [primaryThread],
      nextCursor: null,
    });
  } else if (method === "fake/restart") {
    response(id, { accepted: true });
    void output.then(() => process.exit(17));
  } else if (method === "fake/incomplete") {
    response(id, { accepted: true });
    void output.then(() => {
      emit('{"method":"truncated"', true);
      void output.then(() => process.exit(19));
    });
  } else {
    error(id, `unsupported fake method ${method}`);
  }
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
input.on("line", (line) => {
  if (line.trim().length === 0) return;
  void handle(JSON.parse(line));
});
