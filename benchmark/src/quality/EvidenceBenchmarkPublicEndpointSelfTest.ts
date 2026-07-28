import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import { EvidenceBenchmarkArtifactInventory } from "./EvidenceBenchmarkArtifactInventory.ts";
import { EvidenceBenchmarkQualityInput } from "./EvidenceBenchmarkQualityInput.ts";

/** Exercises the production public-endpoint adapter against a real HTTP app. */
export namespace EvidenceBenchmarkPublicEndpointSelfTest {
  interface IAccount {
    id: string;
    email: string;
    password: string;
    displayName: string;
  }

  interface ITodo {
    id: string;
    ownerId: string;
    title: string;
    description: string | null;
    completed: boolean;
    revision: number;
    trashed: boolean;
    trashedAt: string | null;
  }

  interface IRedditUser {
    id: string;
    email: string;
    password: string;
    username: string;
  }

  interface IRedditCommunity {
    id: string;
    name: string;
    displayName: string;
    description: string;
    ownerId: string;
    moderatorIds: Set<string>;
    subscriberCount: number;
  }

  interface IRedditPost {
    id: string;
    communityId: string;
    authorId: string;
    title: string;
    text: string;
  }

  interface IRedditComment {
    id: string;
    postId: string;
    authorId: string;
    parentId: string | null;
    text: string;
  }

  interface IRedditState {
    users: Map<string, IRedditUser>;
    sessions: Map<string, string>;
    communities: Map<string, IRedditCommunity>;
    posts: Map<string, IRedditPost>;
    comments: Map<string, IRedditComment>;
    nextUser: number;
    nextSession: number;
    nextCommunity: number;
    nextPost: number;
    nextComment: number;
  }

  /** Runs positive state transitions and adversarial manifest fixtures. */
  export async function run(input: {
    benchmarkRoot: string;
    workspace: string;
  }): Promise<void> {
    const state = {
      accounts: new Map<string, IAccount>(),
      sessions: new Map<string, string>(),
      todos: new Map<string, ITodo>(),
      nextAccount: 1,
      nextSession: 1,
      nextTodo: 1,
      noBrowserApi: false,
    };
    const server = http.createServer((request, response) => {
      response.setHeader("x-evidence-runtime-nonce", "f".repeat(64));
      response.setHeader(
        "access-control-expose-headers",
        "x-evidence-runtime-nonce",
      );
      void dispatch(state, request, response).catch((error: unknown) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(`${JSON.stringify({ error: String(error) })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Fake public endpoint server has no TCP address.");
      const origin = `http://127.0.0.1:${address.port}`;
      write(
        path.join(input.workspace, "packages/frontend/package.json"),
        '{"private":true}\n',
      );
      const contract = todoContract();
      writeOpenApi(input.workspace, contract);
      const adapterPath = path.join(
        input.benchmarkRoot,
        "quality/adapters/public-endpoint-v1/index.ts",
      );
      const imported = (await import(
        `${pathToFileURL(adapterPath).href}?self-test=${Date.now()}`
      )) as {
        adapter: {
          execute(input: Record<string, unknown>): Promise<{
            hidden: { status: string }[];
            browser: { status: string; probes: { passed: boolean }[] }[];
          }>;
        };
      };
      const executeTodo = imported.adapter.execute.bind(imported.adapter);
      imported.adapter.execute = (value) =>
        executeTodo({
          ...value,
          parseJson: EvidenceBenchmarkProtocolValidator.parseBytes,
        });
      const qualityInput = EvidenceBenchmarkQualityInput.create({
        runId: "todo-plain-public-endpoint-self-test",
        runManifestBytes: Buffer.from('{"run":"public-adapter-valid"}\n'),
        milestone: "t_done",
        sourceSnapshotFiles: EvidenceBenchmarkArtifactInventory.authoredFiles(
          input.workspace,
        ),
        subjectRequirementFiles: EvidenceBenchmarkHash.directory(
          path.join(input.benchmarkRoot, "requirements/todo"),
        ),
      });
      const cases: {
        id: string;
        criterionIds: string[];
        kind: "http" | "browser";
        routeState: string | null;
        viewports: string[];
      }[] = [
        "TODO-HIDDEN-HTTP-AUTH-01",
        "TODO-HIDDEN-HTTP-ISOLATION-01",
        "TODO-HIDDEN-HTTP-LIFECYCLE-01",
        "TODO-HIDDEN-HTTP-BROWSE-01",
      ].map((id) => ({
        id,
        criterionIds: ["fixture"],
        kind: "http",
        routeState: null,
        viewports: [],
      }));
      cases.push({
        id: "TODO-HIDDEN-BROWSER-ACTIVE-01",
        criterionIds: ["fixture"],
        kind: "browser",
        routeState: "authenticated-active-list",
        viewports: ["mobile", "tablet", "desktop"],
      });
      const result = await imported.adapter.execute({
        manifest: {
          suiteId: "todo-public-endpoint-self-test",
          subject: "todo",
          cases,
        },
        input: qualityInput.provenance,
        workspace: input.workspace,
        output: path.join(
          path.dirname(input.workspace),
          "public-adapter-valid",
        ),
        workspaceSourceTreeSha256:
          EvidenceBenchmarkArtifactInventory.treeSha256(
            EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
          ),
        runtime: fixtureRuntime({
          id: "todo-t-done-fixture-1",
          input: qualityInput.provenance,
          origin,
          database: "b",
          process: "todo-done",
          cleanup: "todo-done",
          onFresh: () => resetState(state),
          onCleanup: () => undefined,
        }),
      });
      assert.equal(result.hidden.length, 4);
      assert.ok(
        result.hidden.every((observation) => observation.status === "passed"),
      );
      assert.equal(result.browser.length, 3);
      assert.ok(
        result.browser.every(
          (observation) =>
            observation.status === "passed" &&
            observation.probes.every((probe) => probe.passed),
        ),
      );
      const dryInput = EvidenceBenchmarkQualityInput.create({
        runId: qualityInput.provenance.runId,
        runManifestBytes: qualityInput.runManifestBytes,
        milestone: "t_dry",
        sourceSnapshotFiles: EvidenceBenchmarkArtifactInventory.authoredFiles(
          input.workspace,
        ),
        subjectRequirementFiles: EvidenceBenchmarkHash.directory(
          path.join(input.benchmarkRoot, "requirements/todo"),
        ),
      });
      const dry = await imported.adapter.execute({
        manifest: {
          suiteId: "todo-public-endpoint-self-test",
          subject: "todo",
          cases,
        },
        input: dryInput.provenance,
        workspace: input.workspace,
        output: path.join(
          path.dirname(input.workspace),
          "public-adapter-valid-dry",
        ),
        workspaceSourceTreeSha256:
          EvidenceBenchmarkArtifactInventory.treeSha256(
            EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
          ),
        runtime: fixtureRuntime({
          id: "todo-t-dry-fixture-2",
          input: dryInput.provenance,
          origin,
          database: "e",
          process: "todo-dry",
          cleanup: "todo-dry",
          onFresh: () => resetState(state),
          onCleanup: () => undefined,
        }),
      });
      assert.equal(dry.hidden.length, 4);
      assert.ok(
        dry.hidden.every((observation) => observation.status === "passed"),
      );
      assert.equal(dry.browser.length, 3);
      assert.ok(
        dry.browser.every((observation) => observation.status === "passed"),
      );
      state.noBrowserApi = true;
      const simulated = await imported.adapter.execute({
        manifest: {
          suiteId: "todo-public-endpoint-simulated-browser",
          subject: "todo",
          cases,
        },
        input: dryInput.provenance,
        workspace: input.workspace,
        output: path.join(
          path.dirname(input.workspace),
          "public-adapter-simulated-browser",
        ),
        workspaceSourceTreeSha256:
          EvidenceBenchmarkArtifactInventory.treeSha256(
            EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
          ),
        runtime: fixtureRuntime({
          id: "todo-simulated-browser-fixture-3",
          input: dryInput.provenance,
          origin,
          database: "2",
          process: "todo-simulated-browser",
          cleanup: "todo-simulated-browser",
          onFresh: () => resetState(state),
          onCleanup: () => undefined,
        }),
      });
      assert.ok(
        simulated.browser.every(
          (observation) => observation.status === "failed",
        ),
      );
      state.noBrowserApi = false;
      const openapiPath = path.join(
        input.workspace,
        "packages/api/swagger.json",
      );
      const validOpenApi = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
      const missing = structuredClone(validOpenApi);
      delete missing.paths["/api/register"].post;
      await assertDiscoveryFailure({
        adapter: imported.adapter,
        input,
        document: missing,
        provenance: qualityInput.provenance,
        cases,
        id: "missing",
        pattern: /no unique shape match for auth\.register/u,
      });
      const ambiguous = structuredClone(validOpenApi);
      ambiguous.paths["/api/accounts/signup"] = {
        post: structuredClone(validOpenApi.paths["/api/register"].post),
      };
      ambiguous.paths["/api/accounts/signup"].post.operationId =
        "todoAuthRegisterAlternative";
      write(
        path.join(
          input.workspace,
          "packages/api/src/functional/fixture-extra-signup.ts",
        ),
        "export const todoAuthRegisterAlternative = true;\n",
      );
      await assertDiscoveryFailure({
        adapter: imported.adapter,
        input,
        document: ambiguous,
        provenance: qualityInput.provenance,
        cases,
        id: "ambiguous-extra",
        pattern: /ambiguously matches auth\.register/u,
      });
      write(openapiPath, `${JSON.stringify(validOpenApi, null, 2)}\n`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
    await runReddit(input);
  }

  async function runReddit(input: {
    benchmarkRoot: string;
    workspace: string;
  }): Promise<void> {
    const state = {
      users: new Map<string, IRedditUser>(),
      sessions: new Map<string, string>(),
      communities: new Map<string, IRedditCommunity>(),
      posts: new Map<string, IRedditPost>(),
      comments: new Map<string, IRedditComment>(),
      nextUser: 1,
      nextSession: 1,
      nextCommunity: 1,
      nextPost: 1,
      nextComment: 1,
    };
    const server = http.createServer((request, response) => {
      response.setHeader("x-evidence-runtime-nonce", "f".repeat(64));
      response.setHeader(
        "access-control-expose-headers",
        "x-evidence-runtime-nonce",
      );
      void dispatchReddit(state, request, response).catch((error: unknown) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(`${JSON.stringify({ error: String(error) })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Fake Reddit public endpoint server has no address.");
      const origin = `http://127.0.0.1:${address.port}`;
      const contract = redditContract();
      writeOpenApi(input.workspace, contract);
      const adapterPath = path.join(
        input.benchmarkRoot,
        "quality/adapters/public-endpoint-v1/index.ts",
      );
      const imported = (await import(
        `${pathToFileURL(adapterPath).href}?reddit-self-test=${Date.now()}`
      )) as {
        adapter: {
          execute(input: Record<string, unknown>): Promise<{
            hidden: { status: string }[];
            browser: {
              routeState: string;
              viewport: string;
              status: string;
              probes: { kind: string; passed: boolean }[];
            }[];
          }>;
        };
      };
      const executeReddit = imported.adapter.execute.bind(imported.adapter);
      imported.adapter.execute = (value) =>
        executeReddit({
          ...value,
          parseJson: EvidenceBenchmarkProtocolValidator.parseBytes,
        });
      const cases = redditCases();
      const doneInput = EvidenceBenchmarkQualityInput.create({
        runId: "reddit-plain-public-endpoint-self-test",
        runManifestBytes: Buffer.from(
          '{"run":"reddit-public-adapter-valid"}\n',
        ),
        milestone: "t_done",
        sourceSnapshotFiles: EvidenceBenchmarkArtifactInventory.authoredFiles(
          input.workspace,
        ),
        subjectRequirementFiles: EvidenceBenchmarkHash.directory(
          path.join(input.benchmarkRoot, "requirements/reddit"),
        ),
      });
      let freshAssertions = 0;
      let cleanups = 0;
      const done = await imported.adapter.execute({
        manifest: {
          suiteId: "reddit-public-endpoint-self-test",
          subject: "reddit",
          cases,
        },
        input: doneInput.provenance,
        workspace: input.workspace,
        output: path.join(
          path.dirname(input.workspace),
          "reddit-public-adapter-valid",
        ),
        workspaceSourceTreeSha256:
          EvidenceBenchmarkArtifactInventory.treeSha256(
            EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
          ),
        runtime: fixtureRuntime({
          id: "reddit-t-done-fixture-1",
          input: doneInput.provenance,
          origin,
          database: "5",
          process: "reddit-done",
          cleanup: "reddit-done",
          onFresh: () => {
            ++freshAssertions;
            resetRedditState(state);
          },
          onCleanup: () => {
            ++cleanups;
          },
        }),
      });
      assertRedditResult(done);

      const dryInput = EvidenceBenchmarkQualityInput.create({
        runId: doneInput.provenance.runId,
        runManifestBytes: doneInput.runManifestBytes,
        milestone: "t_dry",
        sourceSnapshotFiles: EvidenceBenchmarkArtifactInventory.authoredFiles(
          input.workspace,
        ),
        subjectRequirementFiles: EvidenceBenchmarkHash.directory(
          path.join(input.benchmarkRoot, "requirements/reddit"),
        ),
      });
      const dry = await imported.adapter.execute({
        manifest: {
          suiteId: "reddit-public-endpoint-self-test",
          subject: "reddit",
          cases,
        },
        input: dryInput.provenance,
        workspace: input.workspace,
        output: path.join(
          path.dirname(input.workspace),
          "reddit-public-adapter-valid-dry",
        ),
        workspaceSourceTreeSha256:
          EvidenceBenchmarkArtifactInventory.treeSha256(
            EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
          ),
        runtime: fixtureRuntime({
          id: "reddit-t-dry-fixture-2",
          input: dryInput.provenance,
          origin,
          database: "8",
          process: "reddit-dry",
          cleanup: "reddit-dry",
          onFresh: () => {
            ++freshAssertions;
            resetRedditState(state);
          },
          onCleanup: () => {
            ++cleanups;
          },
        }),
      });
      assertRedditResult(dry);
      assert.equal(freshAssertions, 2);
      assert.equal(cleanups, 2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
  }

  function redditCases(): {
    id: string;
    criterionIds: string[];
    kind: "http" | "browser";
    routeState: string | null;
    viewports: string[];
  }[] {
    const httpCases = [
      "REDDIT-HIDDEN-HTTP-AUTH-01",
      "REDDIT-HIDDEN-HTTP-COMMUNITY-01",
      "REDDIT-HIDDEN-HTTP-PARTICIPATION-01",
    ].map((id) => ({
      id,
      criterionIds: ["fixture"],
      kind: "http" as const,
      routeState: null,
      viewports: [],
    }));
    return [
      ...httpCases,
      {
        id: "REDDIT-HIDDEN-BROWSER-POPULAR-01",
        criterionIds: ["fixture"],
        kind: "browser",
        routeState: "visitor-popular-feed",
        viewports: ["mobile", "tablet", "desktop"],
      },
      {
        id: "REDDIT-HIDDEN-BROWSER-DIALOG-01",
        criterionIds: ["fixture"],
        kind: "browser",
        routeState: "authenticated-create-post-dialog-closed",
        viewports: ["mobile", "tablet", "desktop"],
      },
    ];
  }

  function fixtureRuntime(input: {
    id: string;
    input: { runId: string; milestone: "t_done" | "t_dry" };
    origin: string;
    database: string;
    process: string;
    cleanup: string;
    onFresh: () => void;
    onCleanup: () => void;
  }): Record<string, unknown> {
    const processProvenanceBytes = Buffer.from(
      `fixture-process-provenance:${input.process}\n`,
    );
    const cleanupSealBytes = Buffer.from(
      `fixture-cleanup-seal:${input.cleanup}\n`,
    );
    return {
      instanceId: input.id,
      leaseId: "00000000-0000-4000-8000-000000000001",
      runId: input.input.runId,
      subject: input.id.startsWith("reddit") ? "reddit" : "todo",
      arm: "plain",
      milestone: input.input.milestone,
      apiOrigin: input.origin,
      browserOrigin: input.origin,
      requestNonce: "f".repeat(64),
      databaseCloneSha256: input.database.repeat(64),
      processProvenanceBytes,
      processProvenanceSha256: EvidenceBenchmarkHash.bytes(
        processProvenanceBytes,
      ),
      privateControlEvidence: {
        path: "fixture-private-control",
        registryPath: "fixture-private-registry",
        byteLength: 1,
        sha256: "e".repeat(64),
      },
      assertFresh: async () => input.onFresh(),
      cleanup: async () => {
        input.onCleanup();
        return {
          cleanupSealBytes,
          cleanupSealSha256: EvidenceBenchmarkHash.bytes(cleanupSealBytes),
          serverRequestLedgerBytes: Buffer.from(
            "fixture-server-request-ledger\n",
          ),
          serverRequestLedgerSha256: EvidenceBenchmarkHash.bytes(
            "fixture-server-request-ledger\n",
          ),
        };
      },
      promoteEvidence: async () => {
        throw new Error("Fixture runtime evidence promotion is unsupported.");
      },
    };
  }

  function assertRedditResult(result: {
    hidden: { status: string }[];
    browser: {
      routeState: string;
      viewport: string;
      status: string;
      probes: { kind: string; passed: boolean }[];
    }[];
  }): void {
    assert.equal(result.hidden.length, 3);
    assert.ok(
      result.hidden.every((observation) => observation.status === "passed"),
    );
    assert.equal(result.browser.length, 6);
    assert.ok(
      result.browser.every((observation) => observation.status === "passed"),
    );
    assert.deepEqual(
      new Set(result.browser.map((observation) => observation.routeState)),
      new Set([
        "visitor-popular-feed",
        "authenticated-create-post-dialog-closed",
      ]),
    );
    const mobile = result.browser.filter(
      (observation) => observation.viewport === "mobile",
    );
    assert.equal(mobile.length, 2);
    for (const observation of mobile)
      assert.deepEqual(
        observation.probes.map((probe) => [probe.kind, probe.passed]),
        [
          ["reflow_320", true],
          ["text_zoom_200", true],
        ],
      );
  }

  function resetRedditState(state: IRedditState): void {
    state.users.clear();
    state.sessions.clear();
    state.communities.clear();
    state.posts.clear();
    state.comments.clear();
    state.nextUser = 1;
    state.nextSession = 1;
    state.nextCommunity = 1;
    state.nextPost = 1;
    state.nextComment = 1;
  }

  function resetState(state: {
    accounts: Map<string, IAccount>;
    sessions: Map<string, string>;
    todos: Map<string, ITodo>;
    nextAccount: number;
    nextSession: number;
    nextTodo: number;
  }): void {
    state.accounts.clear();
    state.sessions.clear();
    state.todos.clear();
    state.nextAccount = 1;
    state.nextSession = 1;
    state.nextTodo = 1;
  }

  async function assertDiscoveryFailure(input: {
    adapter: {
      execute(input: Record<string, unknown>): Promise<unknown>;
    };
    input: { workspace: string };
    document: unknown;
    provenance: unknown;
    cases: unknown[];
    id: string;
    pattern: RegExp;
  }): Promise<void> {
    write(
      path.join(input.input.workspace, "packages/api/swagger.json"),
      `${JSON.stringify(input.document, null, 2)}\n`,
    );
    await assert.rejects(
      () =>
        input.adapter.execute({
          manifest: {
            suiteId: `todo-public-endpoint-${input.id}`,
            subject: "todo",
            cases: input.cases,
          },
          input: input.provenance,
          workspace: input.input.workspace,
          output: path.join(
            path.dirname(input.input.workspace),
            `public-adapter-${input.id}`,
          ),
          workspaceSourceTreeSha256: "a".repeat(64),
        }),
      input.pattern,
    );
  }

  function todoContract(): Record<string, any> {
    const body = (name: string) => ({ location: "body", name: `/${name}` });
    const query = (name: string) => ({ location: "query", name });
    const parameter = (name: string) => ({ location: "path", name });
    let operationCounter: number = 0;
    const operation = (
      method: string,
      pathname: string,
      request: Record<string, unknown>,
      response: Record<string, string>,
      successStatuses: number[] = [200],
    ) => ({
      method,
      path: pathname,
      operationId: `fixtureOperation${++operationCounter}`,
      sdkModule: `operation-${operationCounter}.ts`,
      request,
      response: { successStatuses, bindings: response },
    });
    return {
      schemaVersion: 1,
      subject: "todo",
      frontendPackageRoot: "packages/frontend",
      openapi: "packages/api/swagger.json",
      sdkRoot: "packages/api/src/functional",
      session: { kind: "cookie", cookieName: "sid" },
      operations: {
        "auth.register": operation(
          "POST",
          "/api/register",
          {
            displayName: body("displayName"),
            email: body("email"),
            password: body("password"),
          },
          { accountId: "/account/id" },
          [201],
        ),
        "auth.login": operation(
          "POST",
          "/api/login",
          { email: body("email"), password: body("password") },
          { accountId: "/account/id" },
        ),
        "auth.logout.current": operation(
          "DELETE",
          "/api/session",
          {},
          {},
          [204],
        ),
        "profile.get.current": operation(
          "GET",
          "/api/profile",
          {},
          { accountId: "/account/id", displayName: "/account/displayName" },
        ),
        "todo.create": operation(
          "POST",
          "/api/todos",
          {
            description: body("description"),
            dueDate: body("dueDate"),
            startDate: body("startDate"),
            title: body("title"),
          },
          { todoId: "/todo/id" },
          [201],
        ),
        "todo.list.active": operation(
          "GET",
          "/api/todos",
          {
            completion: query("completion"),
            direction: query("direction"),
            page: query("page"),
            sort: query("sort"),
          },
          {
            itemCompleted: "/items/*/completed",
            itemIds: "/items/*/id",
            itemTitles: "/items/*/title",
            total: "/total",
          },
        ),
        "todo.get.active": operation(
          "GET",
          "/api/todos/{todoId}",
          { todoId: parameter("todoId") },
          {
            completed: "/todo/completed",
            contentRevision: "/todo/revision",
            title: "/todo/title",
            todoId: "/todo/id",
          },
        ),
        "todo.edit": operation(
          "PUT",
          "/api/todos/{todoId}",
          {
            description: body("description"),
            expectedRevision: body("expectedRevision"),
            title: body("title"),
            todoId: parameter("todoId"),
          },
          {
            contentRevision: "/todo/revision",
            title: "/todo/title",
            todoId: "/todo/id",
          },
        ),
        "todo.complete": operation(
          "PUT",
          "/api/todos/{todoId}/complete",
          { todoId: parameter("todoId") },
          { completed: "/todo/completed", todoId: "/todo/id" },
        ),
        "todo.softDelete": operation(
          "DELETE",
          "/api/todos/{todoId}",
          { todoId: parameter("todoId") },
          { todoId: "/todo/id" },
        ),
        "todo.list.trash": operation(
          "GET",
          "/api/trash",
          { page: query("page") },
          { itemIds: "/items/*/id" },
        ),
        "todo.get.trash": operation(
          "GET",
          "/api/trash/{todoId}",
          { todoId: parameter("todoId") },
          {
            contentRevision: "/todo/revision",
            title: "/todo/title",
            todoId: "/todo/id",
            trashedAt: "/todo/trashedAt",
          },
        ),
        "todo.restore": operation(
          "POST",
          "/api/trash/{todoId}/restore",
          { todoId: parameter("todoId") },
          { todoId: "/todo/id" },
        ),
        "todo.list.history": operation(
          "GET",
          "/api/todos/{todoId}/history",
          { page: query("page"), todoId: parameter("todoId") },
          { revisions: "/revisions" },
        ),
      },
      routes: {
        "authenticated-active-list": { path: "/todos" },
      },
    };
  }

  function redditContract(): Record<string, any> {
    const body = (name: string) => ({ location: "body", name: `/${name}` });
    const query = (name: string) => ({ location: "query", name });
    const parameter = (name: string) => ({ location: "path", name });
    let operationCounter: number = 0;
    const operation = (
      method: string,
      pathname: string,
      request: Record<string, unknown>,
      response: Record<string, string>,
      successStatuses: number[] = [200],
    ) => ({
      method,
      path: pathname,
      operationId: `redditFixtureOperation${++operationCounter}`,
      sdkModule: `reddit-operation-${operationCounter}.ts`,
      request,
      response: { successStatuses, bindings: response },
    });
    return {
      schemaVersion: 1,
      subject: "reddit",
      frontendPackageRoot: "packages/frontend",
      openapi: "packages/api/swagger.json",
      sdkRoot: "packages/api/src/functional",
      session: { kind: "cookie", cookieName: "sid" },
      operations: {
        "auth.register": operation(
          "POST",
          "/api/users/register",
          {
            email: body("email"),
            password: body("password"),
            username: body("username"),
          },
          { userId: "/user/id" },
          [201],
        ),
        "auth.login": operation(
          "POST",
          "/api/users/login",
          { email: body("email"), password: body("password") },
          { userId: "/user/id" },
        ),
        "auth.logout.current": operation(
          "DELETE",
          "/api/sessions/current",
          {},
          {},
          [204],
        ),
        "profile.get.public": operation(
          "GET",
          "/api/profiles/{username}",
          { username: parameter("username") },
          { userId: "/user/id", username: "/user/username" },
        ),
        "community.create": operation(
          "POST",
          "/api/communities",
          {
            description: body("description"),
            displayName: body("displayName"),
            icon: body("icon"),
            name: body("name"),
          },
          { communityId: "/community/id", ownerId: "/community/ownerId" },
          [201],
        ),
        "community.list.public": operation(
          "GET",
          "/api/communities",
          { page: query("page"), search: query("search") },
          {
            communityIds: "/items/*/id",
            communityNames: "/items/*/name",
            ownerIds: "/items/*/ownerId",
            subscriberCounts: "/items/*/subscriberCount",
          },
        ),
        "community.moderator.add": operation(
          "POST",
          "/api/communities/{communityId}/moderators",
          {
            communityId: parameter("communityId"),
            targetUserId: body("targetUserId"),
          },
          {
            moderatorIds: "/community/moderatorIds",
            ownerId: "/community/ownerId",
          },
        ),
        "community.moderator.remove": operation(
          "DELETE",
          "/api/communities/{communityId}/moderators",
          {
            communityId: parameter("communityId"),
            targetUserId: body("targetUserId"),
          },
          {
            moderatorIds: "/community/moderatorIds",
            ownerId: "/community/ownerId",
          },
        ),
        "post.create": operation(
          "POST",
          "/api/posts",
          {
            communityId: body("communityId"),
            text: body("text"),
            title: body("title"),
          },
          { postId: "/post/id" },
          [201],
        ),
        "post.get.public": operation(
          "GET",
          "/api/posts/{postId}",
          { postId: parameter("postId") },
          {
            commentCount: "/post/commentCount",
            postId: "/post/id",
            title: "/post/title",
          },
        ),
        "comment.create": operation(
          "POST",
          "/api/posts/{postId}/comments",
          { postId: parameter("postId"), text: body("text") },
          { commentId: "/comment/id" },
          [201],
        ),
        "comment.reply": operation(
          "POST",
          "/api/posts/{postId}/comments/{parentCommentId}/replies",
          {
            parentCommentId: parameter("parentCommentId"),
            postId: parameter("postId"),
            text: body("text"),
          },
          {
            commentId: "/comment/id",
            parentCommentId: "/comment/parentId",
          },
          [201],
        ),
        "comment.list.thread": operation(
          "GET",
          "/api/posts/{postId}/comments",
          {
            page: query("page"),
            postId: parameter("postId"),
            sort: query("sort"),
          },
          {
            commentIds: "/items/*/id",
            parentIds: "/items/*/parentId",
          },
        ),
        "feed.popular": operation(
          "GET",
          "/api/feeds/popular",
          { page: query("page") },
          {
            postIds: "/items/*/id",
            postTitles: "/items/*/title",
          },
        ),
      },
      routes: {
        "visitor-popular-feed": { path: "/popular" },
        "authenticated-create-post-dialog-closed": {
          path: "/create",
          dialogTrigger: { role: "button", name: "Create post" },
          dialogClose: { role: "button", name: "Close" },
        },
      },
    };
  }

  function writeOpenApi(
    workspace: string,
    contract: Record<string, any>,
  ): void {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [semantic, operation] of Object.entries(contract.operations) as [
      string,
      Record<string, any>,
    ][]) {
      operation.operationId = [contract.subject, ...semantic.split(".")]
        .map((part: string, index: number) =>
          index === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`,
        )
        .join("");
      operation.sdkModule = `${semantic.replaceAll(".", "-")}.ts`;
      paths[operation.path] ??= {};
      const parameters = Object.values(operation.request)
        .filter(
          (binding: any) =>
            binding.location === "path" || binding.location === "query",
        )
        .map((binding: any) => ({
          in: binding.location,
          name: binding.name,
          required: binding.location === "path",
          schema: { type: "string" },
        }));
      const body = Object.entries(operation.request).filter(
        ([, binding]: [string, any]) =>
          binding.location === "body" || binding.location === "multipart",
      );
      const definition: Record<string, unknown> = {
        operationId: operation.operationId,
        parameters,
        responses: Object.fromEntries(
          operation.response.successStatuses.map((status: number) => [
            String(status),
            {
              description: "Success",
              ...(status === 204
                ? {}
                : {
                    content: {
                      "application/json": {
                        schema: responseSchema(operation.response.bindings),
                      },
                    },
                  }),
            },
          ]),
        ),
      };
      if (body.length !== 0)
        definition.requestBody = {
          required: true,
          content: {
            [body.some(
              ([, binding]: [string, any]) => binding.location === "multipart",
            )
              ? "multipart/form-data"
              : "application/json"]: {
              schema: {
                type: "object",
                properties: Object.fromEntries(
                  body.map(([semantic, binding]: [string, any]) => [
                    String(binding.name).replace(/^\//u, ""),
                    {
                      type: semantic === "icon" ? "object" : "string",
                    },
                  ]),
                ),
              },
            },
          },
        };
      paths[operation.path]![operation.method.toLowerCase()] = definition;
      write(
        path.join(
          workspace,
          "packages/api/src/functional",
          operation.sdkModule,
        ),
        `export const ${operation.operationId} = true;\n`,
      );
    }
    write(
      path.join(workspace, "packages/api/swagger.json"),
      `${JSON.stringify(
        {
          openapi: "3.1.0",
          info: { title: "fixture", version: "1" },
          paths,
          components: {
            securitySchemes: {
              session: {
                type: "apiKey",
                in: "cookie",
                name: "sid",
              },
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      path.join(workspace, "packages/frontend/src/routes.ts"),
      `export const routes = ${JSON.stringify(
        Object.values(contract.routes).map((route: any) => route.path),
      )} as const;\n`,
    );
  }

  function responseSchema(
    bindings: Record<string, string>,
  ): Record<string, unknown> {
    const root: Record<string, any> = {
      type: "object",
      properties: {},
    };
    const arraySemantics = new Set([
      "commentIds",
      "communityIds",
      "communityNames",
      "itemCompleted",
      "itemIds",
      "itemTitles",
      "moderatorIds",
      "ownerIds",
      "parentIds",
      "postIds",
      "postTitles",
      "revisions",
      "subscriberCounts",
    ]);
    for (const [semantic, pointer] of Object.entries(bindings)) {
      const segments = pointer.slice(1).split("/");
      let schema = root;
      for (let index = 0; index < segments.length; ++index) {
        const segment = segments[index]!;
        if (segment === "*") {
          schema.type = "array";
          schema.items ??= { type: "object", properties: {} };
          schema = schema.items;
          continue;
        }
        schema.properties ??= {};
        const last = index === segments.length - 1;
        schema.properties[segment] ??= last
          ? arraySemantics.has(semantic)
            ? { type: "array", items: { type: "string" } }
            : { type: "string" }
          : { type: "object", properties: {} };
        schema = schema.properties[segment];
      }
    }
    return root;
  }

  async function dispatchReddit(
    state: IRedditState,
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";
    const user = authenticateReddit(state, request);
    if (method === "GET" && url.pathname === "/popular-redirect") {
      response.writeHead(302, { location: "/popular" });
      response.end();
      return;
    }
    if (method === "GET" && url.pathname === "/popular") {
      return sendRedditPage(response, "Popular", state, false);
    }
    if (method === "GET" && url.pathname === "/create") {
      if (user === undefined) return send(response, 401, { refused: true });
      return sendRedditPage(response, "Create", state, true);
    }
    if (method === "POST" && url.pathname === "/api/users/register") {
      const body = await jsonBody(request);
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const username = String(body.username ?? "").trim();
      if (
        email.length === 0 ||
        username.length === 0 ||
        [...state.users.values()].some(
          (candidate) =>
            candidate.email === email ||
            candidate.username.toLowerCase() === username.toLowerCase(),
        )
      )
        return send(response, 409, { refused: true });
      const created: IRedditUser = {
        id: `reddit-user-${state.nextUser++}`,
        email,
        password: String(body.password ?? ""),
        username,
      };
      state.users.set(created.id, created);
      const session = `reddit-session-${state.nextSession++}`;
      state.sessions.set(session, created.id);
      return send(
        response,
        201,
        { user: created },
        { "set-cookie": `sid=${session}; Path=/; HttpOnly; SameSite=Lax` },
      );
    }
    if (method === "POST" && url.pathname === "/api/users/login") {
      const body = await jsonBody(request);
      const found = [...state.users.values()].find(
        (candidate) =>
          candidate.email ===
            String(body.email ?? "")
              .trim()
              .toLowerCase() && candidate.password === body.password,
      );
      if (found === undefined) return send(response, 401, { refused: true });
      const session = `reddit-session-${state.nextSession++}`;
      state.sessions.set(session, found.id);
      return send(
        response,
        200,
        { user: found },
        { "set-cookie": `sid=${session}; Path=/; HttpOnly; SameSite=Lax` },
      );
    }
    if (method === "DELETE" && url.pathname === "/api/sessions/current") {
      const session = cookie(request, "sid");
      if (user === undefined || session === undefined)
        return send(response, 401, { refused: true });
      state.sessions.delete(session);
      response.writeHead(204);
      response.end();
      return;
    }
    const profile = /^\/api\/profiles\/([^/]+)$/u.exec(url.pathname);
    if (method === "GET" && profile !== null) {
      const username = decodeURIComponent(profile[1]!);
      const found = [...state.users.values()].find(
        (candidate) =>
          candidate.username.toLowerCase() === username.toLowerCase(),
      );
      return found === undefined
        ? send(response, 404, { refused: true })
        : send(response, 200, { user: found });
    }
    if (method === "GET" && url.pathname === "/api/communities") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const items = [...state.communities.values()]
        .filter(
          (community) =>
            search.length === 0 ||
            community.name.toLowerCase().includes(search) ||
            community.displayName.toLowerCase().includes(search),
        )
        .map(redditCommunityView);
      return send(response, 200, { items });
    }
    const publicPost = /^\/api\/posts\/([^/]+)$/u.exec(url.pathname);
    if (method === "GET" && publicPost !== null) {
      const post = state.posts.get(decodeURIComponent(publicPost[1]!));
      return post === undefined
        ? send(response, 404, { refused: true })
        : send(response, 200, {
            post: {
              ...post,
              commentCount: [...state.comments.values()].filter(
                (comment) => comment.postId === post.id,
              ).length,
            },
          });
    }
    const thread = /^\/api\/posts\/([^/]+)\/comments$/u.exec(url.pathname);
    if (method === "GET" && thread !== null) {
      const postId = decodeURIComponent(thread[1]!);
      if (!state.posts.has(postId))
        return send(response, 404, { refused: true });
      return send(response, 200, {
        items: [...state.comments.values()].filter(
          (comment) => comment.postId === postId,
        ),
      });
    }
    if (method === "GET" && url.pathname === "/api/feeds/popular")
      return send(response, 200, { items: [...state.posts.values()] });
    if (user === undefined) return send(response, 401, { refused: true });
    if (method === "POST" && url.pathname === "/api/communities") {
      const body = await jsonBody(request);
      const name = String(body.name ?? "");
      if (
        name.length === 0 ||
        [...state.communities.values()].some(
          (community) => community.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return send(response, 409, { refused: true });
      const created: IRedditCommunity = {
        id: `reddit-community-${state.nextCommunity++}`,
        name,
        displayName: String(body.displayName ?? ""),
        description: String(body.description ?? ""),
        ownerId: user.id,
        moderatorIds: new Set([user.id]),
        subscriberCount: 1,
      };
      state.communities.set(created.id, created);
      return send(response, 201, { community: redditCommunityView(created) });
    }
    const moderators = /^\/api\/communities\/([^/]+)\/moderators$/u.exec(
      url.pathname,
    );
    if (moderators !== null && (method === "POST" || method === "DELETE")) {
      const community = state.communities.get(
        decodeURIComponent(moderators[1]!),
      );
      if (community === undefined)
        return send(response, 404, { refused: true });
      const body = await jsonBody(request);
      const targetUserId = String(body.targetUserId ?? "");
      if (!state.users.has(targetUserId))
        return send(response, 404, { refused: true });
      if (method === "POST") {
        if (community.ownerId !== user.id)
          return send(response, 403, { refused: true });
        community.moderatorIds.add(targetUserId);
      } else {
        if (
          !community.moderatorIds.has(user.id) ||
          targetUserId === community.ownerId
        )
          return send(response, 403, { refused: true });
        community.moderatorIds.delete(targetUserId);
      }
      return send(response, 200, {
        community: redditCommunityView(community),
      });
    }
    if (method === "POST" && url.pathname === "/api/posts") {
      const body = await jsonBody(request);
      const communityId = String(body.communityId ?? "");
      if (!state.communities.has(communityId))
        return send(response, 404, { refused: true });
      const created: IRedditPost = {
        id: `reddit-post-${state.nextPost++}`,
        communityId,
        authorId: user.id,
        title: String(body.title ?? ""),
        text: String(body.text ?? ""),
      };
      state.posts.set(created.id, created);
      return send(response, 201, { post: created });
    }
    const topComment = /^\/api\/posts\/([^/]+)\/comments$/u.exec(url.pathname);
    if (method === "POST" && topComment !== null) {
      const postId = decodeURIComponent(topComment[1]!);
      if (!state.posts.has(postId))
        return send(response, 404, { refused: true });
      const body = await jsonBody(request);
      const created: IRedditComment = {
        id: `reddit-comment-${state.nextComment++}`,
        postId,
        authorId: user.id,
        parentId: null,
        text: String(body.text ?? ""),
      };
      state.comments.set(created.id, created);
      return send(response, 201, { comment: created });
    }
    const reply = /^\/api\/posts\/([^/]+)\/comments\/([^/]+)\/replies$/u.exec(
      url.pathname,
    );
    if (method === "POST" && reply !== null) {
      const postId = decodeURIComponent(reply[1]!);
      const parentId = decodeURIComponent(reply[2]!);
      const parent = state.comments.get(parentId);
      if (parent === undefined || parent.postId !== postId)
        return send(response, 404, { refused: true });
      const body = await jsonBody(request);
      const created: IRedditComment = {
        id: `reddit-comment-${state.nextComment++}`,
        postId,
        authorId: user.id,
        parentId,
        text: String(body.text ?? ""),
      };
      state.comments.set(created.id, created);
      return send(response, 201, { comment: created });
    }
    return send(response, 404, { refused: true });
  }

  function authenticateReddit(
    state: IRedditState,
    request: http.IncomingMessage,
  ): IRedditUser | undefined {
    const session = cookie(request, "sid");
    const userId =
      session === undefined ? undefined : state.sessions.get(session);
    return userId === undefined ? undefined : state.users.get(userId);
  }

  function redditCommunityView(community: IRedditCommunity): {
    id: string;
    name: string;
    displayName: string;
    description: string;
    ownerId: string;
    moderatorIds: string[];
    subscriberCount: number;
  } {
    return {
      id: community.id,
      name: community.name,
      displayName: community.displayName,
      description: community.description,
      ownerId: community.ownerId,
      moderatorIds: [...community.moderatorIds],
      subscriberCount: community.subscriberCount,
    };
  }

  function sendRedditPage(
    response: http.ServerResponse,
    title: string,
    state: IRedditState,
    dialog: boolean,
  ): void {
    const posts = [...state.posts.values()];
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(
      [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        `<title>${title}</title>`,
        "<style>",
        "body{font-family:sans-serif;margin:0;padding:1rem;overflow-wrap:anywhere}",
        "main{max-width:60rem;margin:auto}",
        "button{font:inherit;padding:.5rem}",
        "[role=dialog]{border:1px solid;padding:1rem}",
        "</style>",
        "</head>",
        "<body>",
        "<main>",
        `<h1>${title}</h1>`,
        "<ul>",
        ...posts.map((post) => `<li>${escapeHtml(post.title)}</li>`),
        "</ul>",
        ...(dialog
          ? [
              '<button id="create-post" type="button" aria-haspopup="dialog">Create post</button>',
              '<section id="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title" hidden>',
              '<h2 id="create-title">Create post</h2>',
              '<button id="close-dialog" type="button">Close</button>',
              "</section>",
              "<script>",
              "const trigger=document.getElementById('create-post');",
              "const dialog=document.getElementById('create-dialog');",
              "const close=document.getElementById('close-dialog');",
              "trigger.addEventListener('click',()=>{dialog.hidden=false;close.focus();});",
              "close.addEventListener('click',()=>{dialog.hidden=true;trigger.focus();});",
              "</script>",
            ]
          : ['<a href="/create">Create post</a>']),
        "</main>",
        "<script>void fetch('/api/feeds/popular?page=1');</script>",
        "</body>",
        "</html>",
      ].join(""),
    );
  }

  async function dispatch(
    state: {
      accounts: Map<string, IAccount>;
      sessions: Map<string, string>;
      todos: Map<string, ITodo>;
      nextAccount: number;
      nextSession: number;
      nextTodo: number;
      noBrowserApi: boolean;
    },
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";
    const account = authenticate(state, request);
    if (method === "POST" && url.pathname === "/api/register") {
      const body = await jsonBody(request);
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (
        String(body.displayName ?? "").trim().length === 0 ||
        [...state.accounts.values()].some((entry) => entry.email === email)
      )
        return send(response, 409, { refused: true });
      const created: IAccount = {
        id: `account-${state.nextAccount++}`,
        email,
        password: String(body.password),
        displayName: String(body.displayName),
      };
      state.accounts.set(created.id, created);
      const session = `session-${state.nextSession++}`;
      state.sessions.set(session, created.id);
      return send(
        response,
        201,
        { account: created },
        { "set-cookie": `sid=${session}; Path=/; HttpOnly` },
      );
    }
    if (method === "POST" && url.pathname === "/api/login") {
      const body = await jsonBody(request);
      const found = [...state.accounts.values()].find(
        (entry) =>
          entry.email ===
            String(body.email ?? "")
              .trim()
              .toLowerCase() && entry.password === body.password,
      );
      if (found === undefined) return send(response, 401, { refused: true });
      const session = `session-${state.nextSession++}`;
      state.sessions.set(session, found.id);
      return send(
        response,
        200,
        { account: found },
        { "set-cookie": `sid=${session}; Path=/; HttpOnly` },
      );
    }
    if (method === "DELETE" && url.pathname === "/api/session") {
      const session = cookie(request, "sid");
      if (account === undefined || session === undefined)
        return send(response, 401, { refused: true });
      state.sessions.delete(session);
      response.writeHead(204);
      response.end();
      return;
    }
    if (method === "GET" && url.pathname === "/api/profile")
      return account === undefined
        ? send(response, 401, { refused: true })
        : send(response, 200, { account });
    if (account === undefined) return send(response, 401, { refused: true });
    if (method === "GET" && url.pathname === "/redirect") {
      response.writeHead(302, { location: "/todos" });
      response.end();
      return;
    }
    if (method === "GET" && url.pathname === "/todos") {
      const items = [...state.todos.values()].filter(
        (todo) => todo.ownerId === account.id && !todo.trashed,
      );
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        [
          "<!doctype html>",
          '<html lang="en">',
          "<head>",
          '<meta name="viewport" content="width=device-width,initial-scale=1">',
          "<title>Todos</title>",
          "</head>",
          "<body>",
          "<main>",
          "<h1>Todos</h1>",
          "<ul>",
          ...items.map((todo) => `<li>${escapeHtml(todo.title)}</li>`),
          "</ul>",
          '<button type="button">Create todo</button>',
          "</main>",
          ...(state.noBrowserApi
            ? []
            : ["<script>void fetch('/api/profile');</script>"]),
          "</body>",
          "</html>",
        ].join(""),
      );
      return;
    }
    if (method === "POST" && url.pathname === "/api/todos") {
      const body = await jsonBody(request);
      const todo: ITodo = {
        id: `todo-${state.nextTodo++}`,
        ownerId: account.id,
        title: String(body.title),
        description:
          body.description === null ? null : String(body.description),
        completed: false,
        revision: 1,
        trashed: false,
        trashedAt: null,
      };
      state.todos.set(todo.id, todo);
      return send(response, 201, { todo });
    }
    if (method === "GET" && url.pathname === "/api/todos") {
      let items = [...state.todos.values()].filter(
        (todo) => todo.ownerId === account.id && !todo.trashed,
      );
      const completion = url.searchParams.get("completion");
      if (completion === "complete")
        items = items.filter((todo) => todo.completed);
      if (completion === "incomplete")
        items = items.filter((todo) => !todo.completed);
      if (url.searchParams.get("sort") === "title")
        items.sort((left, right) => left.title.localeCompare(right.title));
      if (url.searchParams.get("direction") === "desc") items.reverse();
      return send(response, 200, { items, total: items.length });
    }
    if (method === "GET" && url.pathname === "/api/trash")
      return send(response, 200, {
        items: [...state.todos.values()].filter(
          (todo) => todo.ownerId === account.id && todo.trashed,
        ),
      });
    const active = /^\/api\/todos\/([^/]+)$/u.exec(url.pathname);
    const complete = /^\/api\/todos\/([^/]+)\/complete$/u.exec(url.pathname);
    const history = /^\/api\/todos\/([^/]+)\/history$/u.exec(url.pathname);
    const trash = /^\/api\/trash\/([^/]+)$/u.exec(url.pathname);
    const restore = /^\/api\/trash\/([^/]+)\/restore$/u.exec(url.pathname);
    const id =
      active?.[1] ??
      complete?.[1] ??
      history?.[1] ??
      trash?.[1] ??
      restore?.[1];
    const todo = id === undefined ? undefined : state.todos.get(id);
    if (todo === undefined || todo.ownerId !== account.id)
      return send(response, 404, { refused: true });
    if (active !== null && method === "GET")
      return todo.trashed
        ? send(response, 404, { refused: true })
        : send(response, 200, { todo });
    if (active !== null && method === "PUT") {
      if (todo.trashed) return send(response, 404, { refused: true });
      const body = await jsonBody(request);
      if (Number(body.expectedRevision) !== todo.revision)
        return send(response, 409, { refused: true });
      todo.title = String(body.title);
      todo.description = String(body.description);
      ++todo.revision;
      return send(response, 200, { todo });
    }
    if (active !== null && method === "DELETE") {
      if (todo.trashed) return send(response, 404, { refused: true });
      todo.trashed = true;
      todo.trashedAt = "2026-07-29T00:00:00.000Z";
      return send(response, 200, { todo });
    }
    if (complete !== null && method === "PUT") {
      if (todo.trashed) return send(response, 404, { refused: true });
      todo.completed = true;
      return send(response, 200, { todo });
    }
    if (history !== null && method === "GET")
      return send(response, 200, {
        revisions: Array.from(
          { length: todo.revision },
          (_, index) => index + 1,
        ),
      });
    if (trash !== null && method === "GET")
      return todo.trashed
        ? send(response, 200, { todo })
        : send(response, 404, { refused: true });
    if (restore !== null && method === "POST") {
      if (!todo.trashed) return send(response, 404, { refused: true });
      todo.trashed = false;
      todo.trashedAt = null;
      return send(response, 200, { todo });
    }
    return send(response, 404, { refused: true });
  }

  function authenticate(
    state: {
      accounts: Map<string, IAccount>;
      sessions: Map<string, string>;
    },
    request: http.IncomingMessage,
  ): IAccount | undefined {
    const session = cookie(request, "sid");
    const accountId =
      session === undefined ? undefined : state.sessions.get(session);
    return accountId === undefined ? undefined : state.accounts.get(accountId);
  }

  function cookie(
    request: http.IncomingMessage,
    name: string,
  ): string | undefined {
    for (const part of (request.headers.cookie ?? "").split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return rest.join("=");
    }
    return undefined;
  }

  async function jsonBody(
    request: http.IncomingMessage,
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  }

  function send(
    response: http.ServerResponse,
    status: number,
    value: unknown,
    headers: Record<string, string> = {},
  ): void {
    response.writeHead(status, {
      "content-type": "application/json",
      ...headers,
    });
    response.end(`${JSON.stringify(value)}\n`);
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
  }
}
