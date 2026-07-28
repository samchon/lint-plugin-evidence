import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

import axe from "axe-core";

const JSON_VALIDATOR = createRequire(import.meta.url)("json-dup-key-validator");
const DENIED_SEGMENTS = new Set([
  "benchmark",
  "debug",
  "evidence",
  "fixture",
  "internal",
  "oracle",
  "reset",
  "seed",
  "test",
  "testing",
]);
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};
const OPERATIONS = {
  todo: {
    "auth.register": {
      methods: ["POST"],
      auth: false,
      request: ["displayName", "email", "password"],
      response: ["accountId"],
    },
    "auth.login": {
      methods: ["POST"],
      auth: false,
      request: ["email", "password"],
      response: ["accountId"],
    },
    "auth.logout.current": {
      methods: ["DELETE", "POST"],
      auth: true,
      request: [],
      response: [],
    },
    "profile.get.current": {
      methods: ["GET"],
      auth: true,
      request: [],
      response: ["accountId", "displayName"],
    },
    "todo.create": {
      methods: ["POST"],
      auth: true,
      request: ["description", "dueDate", "startDate", "title"],
      response: ["todoId"],
    },
    "todo.list.active": {
      methods: ["GET", "POST"],
      auth: true,
      request: ["completion", "direction", "page", "sort"],
      response: ["itemCompleted", "itemIds", "itemTitles", "total"],
    },
    "todo.get.active": {
      methods: ["GET"],
      auth: true,
      request: ["todoId"],
      response: ["completed", "contentRevision", "title", "todoId"],
    },
    "todo.edit": {
      methods: ["PATCH", "PUT"],
      auth: true,
      request: ["description", "expectedRevision", "title", "todoId"],
      response: ["contentRevision", "title", "todoId"],
    },
    "todo.complete": {
      methods: ["PATCH", "POST", "PUT"],
      auth: true,
      request: ["todoId"],
      response: ["completed", "todoId"],
    },
    "todo.softDelete": {
      methods: ["DELETE", "PATCH", "POST"],
      auth: true,
      request: ["todoId"],
      response: ["todoId"],
    },
    "todo.list.trash": {
      methods: ["GET", "POST"],
      auth: true,
      request: ["page"],
      response: ["itemIds"],
    },
    "todo.get.trash": {
      methods: ["GET"],
      auth: true,
      request: ["todoId"],
      response: ["contentRevision", "title", "todoId", "trashedAt"],
    },
    "todo.restore": {
      methods: ["PATCH", "POST"],
      auth: true,
      request: ["todoId"],
      response: ["todoId"],
    },
    "todo.list.history": {
      methods: ["GET", "POST"],
      auth: true,
      request: ["page", "todoId"],
      response: ["revisions"],
    },
  },
  reddit: {
    "auth.register": {
      methods: ["POST"],
      auth: false,
      request: ["email", "password", "username"],
      response: ["userId"],
    },
    "auth.login": {
      methods: ["POST"],
      auth: false,
      request: ["email", "password"],
      response: ["userId"],
    },
    "auth.logout.current": {
      methods: ["DELETE", "POST"],
      auth: true,
      request: [],
      response: [],
    },
    "profile.get.public": {
      methods: ["GET"],
      auth: false,
      request: ["username"],
      response: ["userId", "username"],
    },
    "community.create": {
      methods: ["POST"],
      auth: true,
      request: ["description", "displayName", "icon", "name"],
      response: ["communityId", "ownerId"],
    },
    "community.list.public": {
      methods: ["GET", "POST"],
      auth: false,
      request: ["page", "search"],
      response: [
        "communityIds",
        "communityNames",
        "ownerIds",
        "subscriberCounts",
      ],
    },
    "community.moderator.add": {
      methods: ["PATCH", "POST"],
      auth: true,
      request: ["communityId", "targetUserId"],
      response: ["moderatorIds", "ownerId"],
    },
    "community.moderator.remove": {
      methods: ["DELETE", "POST"],
      auth: true,
      request: ["communityId", "targetUserId"],
      response: ["moderatorIds", "ownerId"],
    },
    "post.create": {
      methods: ["POST"],
      auth: true,
      request: ["communityId", "text", "title"],
      response: ["postId"],
    },
    "post.get.public": {
      methods: ["GET"],
      auth: false,
      request: ["postId"],
      response: ["commentCount", "postId", "title"],
    },
    "comment.create": {
      methods: ["POST"],
      auth: true,
      request: ["postId", "text"],
      response: ["commentId"],
    },
    "comment.reply": {
      methods: ["POST"],
      auth: true,
      request: ["parentCommentId", "postId", "text"],
      response: ["commentId", "parentCommentId"],
    },
    "comment.list.thread": {
      methods: ["GET", "POST"],
      auth: false,
      request: ["page", "postId", "sort"],
      response: ["commentIds", "parentIds"],
    },
    "feed.popular": {
      methods: ["GET", "POST"],
      auth: false,
      request: ["page"],
      response: ["postIds", "postTitles"],
    },
  },
};
const ROUTES = {
  todo: {
    "authenticated-active-list": { auth: true, dialog: false },
  },
  reddit: {
    "visitor-popular-feed": { auth: false, dialog: false },
    "authenticated-create-post-dialog-closed": {
      auth: true,
      dialog: true,
    },
  },
};
const OPERATION_MATCHERS = {
  todo: {
    "auth.register": { required: [["register", "signup", "sign-up", "join"]] },
    "auth.login": { required: [["login", "signin", "sign-in"]] },
    "auth.logout.current": {
      required: [["logout", "signout", "sign-out"]],
    },
    "profile.get.current": {
      required: [["profile", "account", "me"]],
      forbidden: ["public"],
    },
    "todo.create": {
      required: [["todo", "task"]],
      preferred: ["create", "new"],
      forbidden: ["trash", "history", "complete", "restore"],
      pathParameters: 0,
    },
    "todo.list.active": {
      required: [["todo", "task"]],
      preferred: ["list", "index", "search", "active"],
      forbidden: ["trash", "history"],
      pathParameters: 0,
    },
    "todo.get.active": {
      required: [["todo", "task"]],
      preferred: ["get", "at", "detail"],
      forbidden: ["trash", "history"],
      pathParameters: 1,
    },
    "todo.edit": {
      required: [["todo", "task"]],
      preferred: ["edit", "update"],
      forbidden: ["complete", "trash", "restore"],
      pathParameters: 1,
    },
    "todo.complete": {
      required: [["complete", "completion", "done", "check"]],
      pathParameters: 1,
    },
    "todo.softDelete": {
      required: [["todo", "task"]],
      preferred: ["delete", "remove", "trash"],
      forbidden: ["restore", "permanent"],
      pathParameters: 1,
    },
    "todo.list.trash": {
      required: [["trash", "trashed", "deleted"]],
      preferred: ["list", "index", "search"],
      pathParameters: 0,
    },
    "todo.get.trash": {
      required: [["trash", "trashed", "deleted"]],
      preferred: ["get", "at", "detail"],
      pathParameters: 1,
    },
    "todo.restore": {
      required: [["restore", "recover"]],
      pathParameters: 1,
    },
    "todo.list.history": {
      required: [["history", "revision", "audit"]],
      pathParameters: 1,
    },
  },
  reddit: {
    "auth.register": { required: [["register", "signup", "sign-up", "join"]] },
    "auth.login": { required: [["login", "signin", "sign-in"]] },
    "auth.logout.current": {
      required: [["logout", "signout", "sign-out"]],
    },
    "profile.get.public": {
      required: [["profile", "user"]],
      preferred: ["public", "get", "at"],
      pathParameters: 1,
    },
    "community.create": {
      required: [["community", "communities"]],
      preferred: ["create", "new"],
      forbidden: ["moderator", "list", "index"],
      pathParameters: 0,
    },
    "community.list.public": {
      required: [["community", "communities"]],
      preferred: ["list", "index", "search", "public"],
      forbidden: ["moderator"],
      pathParameters: 0,
    },
    "community.moderator.add": {
      required: [["moderator"], ["add", "assign", "appoint", "grant"]],
      pathParameters: 1,
    },
    "community.moderator.remove": {
      required: [["moderator"], ["remove", "revoke", "delete"]],
      pathParameters: 1,
    },
    "post.create": {
      required: [["post"]],
      preferred: ["create", "new"],
      forbidden: ["comment", "feed"],
      pathParameters: 0,
    },
    "post.get.public": {
      required: [["post"]],
      preferred: ["get", "at", "detail", "public"],
      forbidden: ["comment", "feed"],
      pathParameters: 1,
    },
    "comment.create": {
      required: [["comment"]],
      preferred: ["create", "new"],
      forbidden: ["reply", "thread"],
      pathParameters: 1,
    },
    "comment.reply": {
      required: [
        ["comment", "reply"],
        ["reply", "replies", "parent"],
      ],
      pathParameters: 2,
    },
    "comment.list.thread": {
      required: [["comment", "thread"]],
      preferred: ["list", "index", "thread"],
      pathParameters: 1,
    },
    "feed.popular": {
      required: [["popular"], ["feed", "post"]],
      pathParameters: 0,
    },
  },
};
const FIELD_ALIASES = {
  accountId: ["accountId", "userId", "id"],
  commentCount: ["commentCount", "commentsCount"],
  commentId: ["commentId", "id"],
  commentIds: ["commentIds", "ids", "id"],
  communityId: ["communityId", "id"],
  communityIds: ["communityIds", "ids", "id"],
  communityNames: ["communityNames", "names", "name"],
  completion: ["completion", "completed", "status"],
  completed: ["completed", "completion", "done"],
  contentRevision: ["contentRevision", "revision", "version"],
  direction: ["direction", "order"],
  displayName: ["displayName", "nickname", "name"],
  dueDate: ["dueDate", "dueAt", "deadline"],
  expectedRevision: ["expectedRevision", "revision", "version"],
  icon: ["icon", "iconFile", "image"],
  itemCompleted: ["itemCompleted", "completed", "completions"],
  itemIds: ["itemIds", "ids", "id"],
  itemTitles: ["itemTitles", "titles", "title"],
  moderatorIds: ["moderatorIds", "moderators"],
  ownerId: ["ownerId", "creatorId"],
  ownerIds: ["ownerIds", "owners", "ownerId"],
  page: ["page", "pageIndex", "offset"],
  parentCommentId: ["parentCommentId", "parentId"],
  parentIds: ["parentIds", "parentCommentIds", "parentId"],
  postId: ["postId", "id"],
  postIds: ["postIds", "ids", "id"],
  postTitles: ["postTitles", "titles", "title"],
  revisions: ["revisions", "history", "items"],
  search: ["search", "query", "keyword"],
  sort: ["sort", "orderBy"],
  startDate: ["startDate", "startAt", "startsAt"],
  subscriberCounts: ["subscriberCounts", "subscribers", "subscriberCount"],
  targetUserId: ["targetUserId", "userId", "moderatorId"],
  todoId: ["todoId", "taskId", "id"],
  total: ["total", "count"],
  trashedAt: ["trashedAt", "deletedAt"],
  userId: ["userId", "accountId", "id"],
  username: ["username", "handle"],
};

export const adapter = {
  schemaVersion: 1,
  async execute(input) {
    const contract = readContract(input.workspace, input.manifest.subject);
    const runtime = validateRuntime(input);
    contract.apiOrigin = runtime.apiOrigin;
    contract.browserOrigin = runtime.browserOrigin;
    await runtime.assertFresh();
    const nonce = digest(
      `${input.input.runId}\0${input.input.milestone}\0${input.input.runManifestSha256}\0${runtime.instanceId}`,
    ).slice(0, 16);
    let hidden;
    let browser;
    let cleanup;
    try {
      const state =
        contract.subject === "todo"
          ? await todoScenarios(contract, nonce)
          : await redditScenarios(contract, nonce);
      hidden = [];
      for (const test of input.manifest.cases.filter(
        (candidate) => candidate.kind === "http",
      )) {
        const started = process.hrtime.bigint();
        const observation = state.http.get(test.id);
        if (observation === undefined)
          throw new Error(`Public endpoint adapter has no case ${test.id}.`);
        const relative = `http/${test.id}.json`;
        const bytes = Buffer.from(`${JSON.stringify(observation, null, 2)}\n`);
        writeArtifact(input.output, relative, bytes);
        hidden.push({
          caseId: test.id,
          status: observation.passed === true ? "passed" : "failed",
          startedMonotonicNs: started.toString(),
          completedMonotonicNs: process.hrtime.bigint().toString(),
          artifact: relative,
          artifactSha256: digest(bytes),
        });
      }
      browser = await browserScenarios(input, contract, state);
    } finally {
      cleanup = await runtime.cleanup();
      exactKeys(
        cleanup,
        ["cleanupSealBytes", "cleanupSealSha256"],
        "runtime cleanup result",
      );
      bytesSha(
        cleanup.cleanupSealBytes,
        cleanup.cleanupSealSha256,
        "runtime cleanup seal",
      );
      sha256(cleanup.cleanupSealSha256, "runtime cleanup seal");
    }
    return {
      schemaVersion: 1,
      input: input.input,
      suiteId: input.manifest.suiteId,
      subject: input.manifest.subject,
      workspaceSourceTreeSha256: input.workspaceSourceTreeSha256,
      runtime: {
        instanceId: runtime.instanceId,
        databaseCloneSha256: runtime.databaseCloneSha256,
        processProvenanceSha256: runtime.processProvenanceSha256,
        cleanupSealSha256: cleanup.cleanupSealSha256,
      },
      hidden,
      browser,
    };
  },
};

function validateRuntime(input) {
  const runtime = input.runtime;
  exactKeys(
    runtime,
    [
      "instanceId",
      "runId",
      "milestone",
      "apiOrigin",
      "browserOrigin",
      "databaseCloneSha256",
      "processProvenanceBytes",
      "processProvenanceSha256",
      "assertFresh",
      "cleanup",
    ],
    "runner runtime lease",
  );
  token(runtime.instanceId, "runner runtime instance");
  if (
    runtime.runId !== input.input.runId ||
    runtime.milestone !== input.input.milestone
  )
    throw new Error("Runner runtime lease does not bind run and milestone.");
  loopbackOrigin(runtime.apiOrigin, "runner API origin");
  loopbackOrigin(runtime.browserOrigin, "runner browser origin");
  sha256(runtime.databaseCloneSha256, "runner database clone");
  bytesSha(
    runtime.processProvenanceBytes,
    runtime.processProvenanceSha256,
    "runner process provenance",
  );
  sha256(runtime.processProvenanceSha256, "runner process provenance");
  if (
    typeof runtime.assertFresh !== "function" ||
    typeof runtime.cleanup !== "function"
  )
    throw new Error("Runner runtime lease lacks lifecycle controls.");
  return runtime;
}

function bytesSha(value, expected, label) {
  if (!(value instanceof Uint8Array))
    throw new Error(`${label} bytes must be a Uint8Array.`);
  if (digest(value) !== expected)
    throw new Error(`${label} bytes do not match their digest.`);
}

function readContract(workspace, expectedSubject) {
  if (!(expectedSubject in OPERATIONS))
    throw new Error(`Unsupported hidden subject ${expectedSubject}.`);
  const openapiPath = discoverOpenApi(workspace);
  const document = strictJson(
    fs.readFileSync(openapiPath),
    "generated OpenAPI document",
  );
  const publicOperations = enumerateOpenApi(document);
  const operations = {};
  const consumed = new Set();
  for (const [semantic, specification] of Object.entries(
    OPERATIONS[expectedSubject],
  )) {
    const matches = [];
    for (const candidate of publicOperations) {
      if (consumed.has(candidate.identity)) continue;
      const matched = matchOperation(
        expectedSubject,
        semantic,
        specification,
        candidate,
        document,
      );
      if (matched !== null) matches.push(matched);
    }
    matches.sort(
      (left, right) =>
        right.score - left.score ||
        Buffer.compare(
          Buffer.from(left.operation.operationId, "utf8"),
          Buffer.from(right.operation.operationId, "utf8"),
        ),
    );
    if (
      matches.length === 0 ||
      (matches.length > 1 && matches[0].score === matches[1].score)
    )
      throw new Error(
        matches.length === 0
          ? `Generated OpenAPI has no unique shape match for ${semantic}.`
          : `Generated OpenAPI ambiguously matches ${semantic}: ${matches
              .filter((entry) => entry.score === matches[0].score)
              .map((entry) => entry.operation.operationId)
              .join(", ")}.`,
      );
    const selected = matches[0];
    consumed.add(selected.identity);
    operations[semantic] = selected.operation;
  }
  bindSdkModules(workspace, operations);
  const frontendPackageRoot = discoverFrontend(workspace);
  return {
    schemaVersion: 1,
    subject: expectedSubject,
    frontendPackageRoot: path
      .relative(workspace, frontendPackageRoot)
      .replaceAll("\\", "/"),
    openapi: path.relative(workspace, openapiPath).replaceAll("\\", "/"),
    sdkRoot: ".",
    session: discoverSession(document, frontendPackageRoot),
    operations,
    routes: discoverRoutes(expectedSubject, frontendPackageRoot),
  };
}

function discoverOpenApi(workspace) {
  const candidates = discoverFiles(workspace, (relative) =>
    /(?:^|\/)(?:swagger|openapi)\.json$/iu.test(relative),
  ).filter((location) => {
    try {
      const document = strictJson(
        fs.readFileSync(location),
        "OpenAPI candidate",
      );
      return (
        typeof document === "object" &&
        document !== null &&
        typeof document.paths === "object" &&
        document.paths !== null
      );
    } catch {
      return false;
    }
  });
  if (candidates.length !== 1)
    throw new Error(
      `Generated workspace must expose one OpenAPI JSON document; observed ${candidates.length}.`,
    );
  return candidates[0];
}

function enumerateOpenApi(document) {
  record(document, "OpenAPI document");
  record(document.paths, "OpenAPI paths");
  const output = [];
  const operationIds = new Set();
  for (const [pathname, pathItem] of Object.entries(document.paths)) {
    publicPath(pathname, "OpenAPI path");
    if (typeof pathItem !== "object" || pathItem === null) continue;
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const definition = pathItem[method.toLowerCase()];
      if (typeof definition !== "object" || definition === null) continue;
      token(definition.operationId, `${method} ${pathname} operationId`);
      if (operationIds.has(definition.operationId))
        throw new Error(
          `Generated OpenAPI repeats operationId ${definition.operationId}.`,
        );
      operationIds.add(definition.operationId);
      output.push({
        identity: `${method} ${pathname}`,
        method,
        path: pathname,
        definition,
        pathItem,
      });
    }
  }
  return output;
}

function matchOperation(subject, semantic, specification, candidate, document) {
  if (!specification.methods.includes(candidate.method)) return null;
  const matcher = OPERATION_MATCHERS[subject][semantic];
  const descriptor = words(
    `${candidate.definition.operationId} ${candidate.path}`,
  );
  const pathParameters = [...candidate.path.matchAll(/\{[^/{}]+\}/gu)].length;
  if (
    matcher.pathParameters !== undefined &&
    matcher.pathParameters !== pathParameters
  )
    return null;
  if (
    (matcher.required ?? []).some(
      (group) => !group.some((alias) => descriptor.includes(words(alias))),
    ) ||
    (matcher.forbidden ?? []).some((alias) => descriptor.includes(words(alias)))
  )
    return null;
  let request;
  let response;
  try {
    request = discoverRequestBindings(
      semantic,
      specification.request,
      candidate,
      document,
    );
    response = discoverResponseBindings(
      semantic,
      specification.response,
      candidate.definition.responses,
      document,
    );
  } catch {
    return null;
  }
  const preferred = (matcher.preferred ?? []).filter((alias) =>
    descriptor.includes(words(alias)),
  ).length;
  return {
    identity: candidate.identity,
    score:
      100 + preferred * 10 + (descriptor.includes(words(semantic)) ? 25 : 0),
    operation: {
      method: candidate.method,
      path: candidate.path,
      operationId: candidate.definition.operationId,
      sdkModule: "",
      request,
      response,
    },
  };
}

function discoverRequestBindings(semantic, expected, candidate, document) {
  const fields = [];
  for (const parameter of [
    ...(Array.isArray(candidate.pathItem.parameters)
      ? candidate.pathItem.parameters
      : []),
    ...(Array.isArray(candidate.definition.parameters)
      ? candidate.definition.parameters
      : []),
  ]) {
    const resolved = resolveSchema(document, parameter);
    if (
      typeof resolved?.name === "string" &&
      ["path", "query"].includes(resolved.in)
    )
      fields.push({
        field: resolved.name,
        location: resolved.in,
        name: resolved.name,
      });
  }
  const content = candidate.definition.requestBody?.content;
  if (typeof content === "object" && content !== null) {
    const mediaType = Object.keys(content).find((key) =>
      [
        "application/json",
        "multipart/form-data",
        "application/x-www-form-urlencoded",
      ].includes(key),
    );
    if (mediaType !== undefined)
      for (const leaf of schemaLeaves(document, content[mediaType]?.schema, ""))
        fields.push({
          field: leaf.field,
          location: mediaType === "multipart/form-data" ? "multipart" : "body",
          name: mediaType === "multipart/form-data" ? leaf.field : leaf.pointer,
        });
  }
  return bindFields(expected, fields, `${semantic} request`);
}

function discoverResponseBindings(semantic, expected, responses, document) {
  record(responses, `${semantic} OpenAPI responses`);
  const successStatuses = Object.keys(responses)
    .filter((status) => /^[2]\d\d$/u.test(status))
    .map(Number)
    .sort((left, right) => left - right);
  if (successStatuses.length === 0)
    throw new Error(`${semantic} has no declared 2xx response.`);
  if (expected.length === 0) return { successStatuses, bindings: {} };
  const fields = [];
  for (const status of successStatuses) {
    const response = resolveSchema(document, responses[String(status)]);
    const content = response?.content;
    if (typeof content !== "object" || content === null) continue;
    for (const media of Object.values(content))
      for (const leaf of schemaLeaves(document, media?.schema, ""))
        fields.push({
          field: leaf.field,
          location: "response",
          name: leaf.pointer,
        });
  }
  return {
    successStatuses,
    bindings: bindFields(expected, fields, `${semantic} response`, true),
  };
}

function bindFields(expected, fields, label, valuesOnly = false) {
  const output = {};
  for (const semantic of expected) {
    const aliases = FIELD_ALIASES[semantic] ?? [semantic];
    const matches = fields.filter((field) =>
      aliases.some((alias) => words(alias) === words(field.field)),
    );
    const exact = matches.filter(
      (field) => words(field.field) === words(semantic),
    );
    const selected = exact.length === 1 ? exact[0] : matches[0];
    if (selected === undefined || (exact.length !== 1 && matches.length !== 1))
      throw new Error(`${label} cannot uniquely bind ${semantic}.`);
    output[semantic] = valuesOnly
      ? selected.name
      : { location: selected.location, name: selected.name };
  }
  return output;
}

function schemaLeaves(document, input, pointerPrefix) {
  const schema = resolveSchema(document, input);
  if (typeof schema !== "object" || schema === null) return [];
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const alternatives = schema.oneOf ?? schema.anyOf;
    return alternatives.flatMap((entry) =>
      schemaLeaves(document, entry, pointerPrefix),
    );
  }
  if (schema.type === "array" || schema.items !== undefined)
    return [
      {
        field: pointerPrefix.split("/").at(-1) ?? "",
        pointer: pointerPrefix,
      },
      ...schemaLeaves(document, schema.items, `${pointerPrefix}/*`),
    ];
  if (typeof schema.properties === "object" && schema.properties !== null)
    return Object.entries(schema.properties).flatMap(([key, value]) =>
      schemaLeaves(
        document,
        value,
        `${pointerPrefix}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
      ),
    );
  const segments = pointerPrefix.split("/");
  return [
    {
      field: segments.at(-1) ?? "",
      pointer: pointerPrefix,
    },
  ];
}

function resolveSchema(document, input) {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.$ref !== "string"
  )
    return input;
  if (!input.$ref.startsWith("#/"))
    throw new Error("OpenAPI schema reference must remain local.");
  return input.$ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, part) => current?.[part], document);
}

function bindSdkModules(workspace, operations) {
  const sources = discoverFiles(
    workspace,
    (relative) => relative.includes("/functional/") && relative.endsWith(".ts"),
  );
  for (const [semantic, operation] of Object.entries(operations)) {
    const pattern = new RegExp(
      `\\b${operation.operationId.replaceAll(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      )}\\b`,
      "u",
    );
    const matches = sources.filter((source) =>
      pattern.test(fs.readFileSync(source, "utf8")),
    );
    if (matches.length !== 1)
      throw new Error(
        `Generated SDK must uniquely expose ${operation.operationId}; observed ${matches.length} modules.`,
      );
    operation.sdkModule = path
      .relative(workspace, matches[0])
      .replaceAll("\\", "/");
    if (!operation.sdkModule.includes("/functional/"))
      throw new Error(`${semantic} SDK binding is outside functional output.`);
  }
}

function discoverSession(document, frontendRoot) {
  const schemes = Object.values(document.components?.securitySchemes ?? {}).map(
    (entry) => resolveSchema(document, entry),
  );
  const cookies = schemes.filter(
    (scheme) =>
      scheme?.type === "apiKey" &&
      scheme.in === "cookie" &&
      typeof scheme.name === "string",
  );
  if (cookies.length === 1)
    return { kind: "cookie", cookieName: cookies[0].name };
  const bearer = schemes.filter(
    (scheme) =>
      scheme?.type === "http" &&
      String(scheme.scheme).toLowerCase() === "bearer",
  );
  if (bearer.length !== 1)
    throw new Error(
      "Generated OpenAPI must expose one cookie or bearer session scheme.",
    );
  const storageKeys = new Set();
  for (const source of discoverFiles(frontendRoot, (relative) =>
    /\.(?:ts|tsx|js|jsx)$/u.test(relative),
  )) {
    const text = fs.readFileSync(source, "utf8");
    for (const match of text.matchAll(
      /localStorage\.setItem\(\s*["']([^"']+)["']/gu,
    ))
      storageKeys.add(match[1]);
  }
  if (storageKeys.size !== 1)
    throw new Error(
      "Bearer frontend must expose one literal localStorage session key.",
    );
  return {
    kind: "bearer",
    headerName: "Authorization",
    scheme: "Bearer",
    browserStorageKey: [...storageKeys][0],
  };
}

function discoverFrontend(workspace) {
  const candidates = discoverFiles(workspace, (relative) =>
    relative.endsWith("/package.json"),
  )
    .map((manifest) => path.dirname(manifest))
    .filter(
      (directory) =>
        fs.existsSync(path.join(directory, "src")) &&
        /frontend|web|client/iu.test(path.basename(directory)),
    );
  if (candidates.length !== 1)
    throw new Error(
      `Generated workspace must expose one frontend package; observed ${candidates.length}.`,
    );
  return candidates[0];
}

function discoverRoutes(subject, frontendRoot) {
  const text = discoverFiles(frontendRoot, (relative) =>
    /\.(?:ts|tsx|js|jsx)$/u.test(relative),
  )
    .map((source) => fs.readFileSync(source, "utf8"))
    .join("\n");
  const paths = new Set(
    [...text.matchAll(/["'`]((?:\/[A-Za-z0-9._~-]+)+\/?)["'`]/gu)].map(
      (match) => match[1],
    ),
  );
  const choose = (label, predicates) => {
    const matches = [...paths].filter((candidate) =>
      predicates.some((pattern) => pattern.test(candidate)),
    );
    if (matches.length !== 1)
      throw new Error(
        `Frontend route discovery for ${label} observed ${matches.length} candidates.`,
      );
    return matches[0];
  };
  return subject === "todo"
    ? {
        "authenticated-active-list": {
          path: choose("todo active list", [
            /^\/(?:todos?|tasks?)(?:\/active)?\/?$/iu,
          ]),
        },
      }
    : {
        "visitor-popular-feed": {
          path: choose("Reddit popular feed", [
            /^\/(?:feeds?\/)?popular\/?$/iu,
          ]),
        },
        "authenticated-create-post-dialog-closed": {
          path: choose("Reddit post creation", [
            /^\/(?:posts?\/)?(?:create|new|submit)\/?$/iu,
            /^\/(?:create|new|submit)(?:\/posts?)?\/?$/iu,
          ]),
        },
      };
}

function discoverFiles(root, predicate) {
  const output = [];
  const visit = (directory, prefix) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) =>
        Buffer.compare(
          Buffer.from(left.name, "utf8"),
          Buffer.from(right.name, "utf8"),
        ),
      )) {
      if (
        entry.isSymbolicLink() ||
        ["node_modules", ".git", ".benchmark-deps"].includes(entry.name)
      )
        continue;
      const relative =
        prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(location, relative);
      else if (entry.isFile() && predicate(relative)) output.push(location);
    }
  };
  visit(root, "");
  return output;
}

function words(input) {
  return String(input)
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

async function todoScenarios(contract, nonce) {
  const emailA = `evidence-${nonce}-a@example.test`;
  const emailB = `evidence-${nonce}-b@example.test`;
  const password = `Evidence-${nonce}-Pass9!`;
  const first = await call(contract, "auth.register", {
    email: emailA,
    password,
    displayName: `Evidence ${nonce} A`,
  });
  expectSuccess(first, "todo first registration");
  const sessionA = sessionFrom(contract, first);
  const accountA = output(first, "accountId");
  const duplicate = await call(contract, "auth.register", {
    email: emailA.toUpperCase(),
    password,
    displayName: `Duplicate ${nonce}`,
  });
  expectRefusal(duplicate, "todo duplicate registration");
  const invalid = await call(contract, "auth.register", {
    email: `evidence-${nonce}-invalid@example.test`,
    password,
    displayName: "",
  });
  expectRefusal(invalid, "todo invalid registration");
  const profile = await call(contract, "profile.get.current", {}, sessionA);
  expectSuccess(profile, "todo initial profile");
  const empty = await call(
    contract,
    "todo.list.active",
    browseTodo(),
    sessionA,
  );
  expectSuccess(empty, "todo initial empty list");
  const emptyIds = arrayOutput(empty, "itemIds");
  const authPassed =
    emptyIds.length === 0 &&
    Number(output(empty, "total")) === 0 &&
    String(output(profile, "accountId")) === String(accountA);

  const second = await call(contract, "auth.register", {
    email: emailB,
    password,
    displayName: `Evidence ${nonce} B`,
  });
  expectSuccess(second, "todo second registration");
  const sessionB = sessionFrom(contract, second);
  const privateTitle = `private-${nonce}`;
  const privateTodo = await call(
    contract,
    "todo.create",
    todoInput(privateTitle),
    sessionA,
  );
  expectSuccess(privateTodo, "todo isolation create");
  const privateId = String(output(privateTodo, "todoId"));
  const edited = await call(
    contract,
    "todo.edit",
    {
      description: `edited private ${nonce}`,
      expectedRevision: 1,
      title: `edited-${privateTitle}`,
      todoId: privateId,
    },
    sessionA,
  );
  expectSuccess(edited, "todo isolation edit");
  const otherList = await call(
    contract,
    "todo.list.active",
    browseTodo(),
    sessionB,
  );
  expectSuccess(otherList, "todo other-owner list");
  for (const [operationId, semantic] of [
    ["todo.get.active", { todoId: privateId }],
    [
      "todo.edit",
      {
        description: "foreign edit",
        expectedRevision: 2,
        title: "foreign edit",
        todoId: privateId,
      },
    ],
    ["todo.softDelete", { todoId: privateId }],
    ["todo.list.history", { page: 1, todoId: privateId }],
  ]) {
    const refused = await call(contract, operationId, semantic, sessionB);
    expectRefusal(refused, `todo foreign ${operationId}`);
  }
  const login = await call(contract, "auth.login", {
    email: emailA,
    password,
  });
  expectSuccess(login, "todo second login");
  const sessionA2 = sessionFrom(contract, login);
  const logout = await call(contract, "auth.logout.current", {}, sessionA);
  expectSuccess(logout, "todo current logout");
  const revoked = await call(contract, "profile.get.current", {}, sessionA);
  expectRefusal(revoked, "todo revoked session");
  const current = await call(contract, "profile.get.current", {}, sessionA2);
  expectSuccess(current, "todo surviving session");
  const isolationPassed =
    !arrayOutput(otherList, "itemIds").map(String).includes(privateId) &&
    String(output(current, "accountId")) === String(accountA) &&
    String(output(edited, "contentRevision")) === "2";

  const lifecycleTitle = `lifecycle-${nonce}`;
  const lifecycle = await call(
    contract,
    "todo.create",
    todoInput(lifecycleTitle),
    sessionA2,
  );
  expectSuccess(lifecycle, "todo lifecycle create");
  const lifecycleId = String(output(lifecycle, "todoId"));
  const activeBefore = await call(
    contract,
    "todo.get.active",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(activeBefore, "todo active detail before trash");
  const removed = await call(
    contract,
    "todo.softDelete",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(removed, "todo soft delete");
  const trash = await call(contract, "todo.list.trash", { page: 1 }, sessionA2);
  expectSuccess(trash, "todo trash list");
  const absentActive = await call(
    contract,
    "todo.get.active",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectRefusal(absentActive, "todo active detail after trash");
  const trashDetail = await call(
    contract,
    "todo.get.trash",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(trashDetail, "todo trash detail");
  const history = await call(
    contract,
    "todo.list.history",
    { page: 1, todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(history, "todo retained history");
  const restored = await call(
    contract,
    "todo.restore",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(restored, "todo restore");
  const activeAfterRestore = await call(
    contract,
    "todo.list.active",
    browseTodo(),
    sessionA2,
  );
  expectSuccess(activeAfterRestore, "todo active list after restore");
  const activeDetail = await call(
    contract,
    "todo.get.active",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectSuccess(activeDetail, "todo active detail after restore");
  const absentTrash = await call(
    contract,
    "todo.get.trash",
    { todoId: lifecycleId },
    sessionA2,
  );
  expectRefusal(absentTrash, "todo trash detail after restore");
  const lifecyclePassed =
    arrayOutput(trash, "itemIds").map(String).includes(lifecycleId) &&
    arrayOutput(activeAfterRestore, "itemIds")
      .map(String)
      .includes(lifecycleId) &&
    String(output(restored, "todoId")) === lifecycleId &&
    String(output(trashDetail, "todoId")) === lifecycleId &&
    String(output(activeDetail, "todoId")) === lifecycleId &&
    String(output(activeDetail, "title")) === lifecycleTitle &&
    arrayOutput(history, "revisions").length >= 1;

  const alpha = await call(
    contract,
    "todo.create",
    todoInput(`aaa-${nonce}`),
    sessionA2,
  );
  const omega = await call(
    contract,
    "todo.create",
    todoInput(`zzz-${nonce}`),
    sessionA2,
  );
  expectSuccess(alpha, "todo browse alpha create");
  expectSuccess(omega, "todo browse omega create");
  const complete = await call(
    contract,
    "todo.complete",
    { todoId: String(output(omega, "todoId")) },
    sessionA2,
  );
  expectSuccess(complete, "todo browse complete");
  const sorted = await call(
    contract,
    "todo.list.active",
    {
      completion: "all",
      direction: "asc",
      page: 1,
      sort: "title",
    },
    sessionA2,
  );
  expectSuccess(sorted, "todo sorted list");
  const titles = arrayOutput(sorted, "itemTitles").map(String);
  const completed = await call(
    contract,
    "todo.list.active",
    {
      completion: "complete",
      direction: "asc",
      page: 1,
      sort: "title",
    },
    sessionA2,
  );
  expectSuccess(completed, "todo completed filter");
  const incomplete = await call(
    contract,
    "todo.list.active",
    {
      completion: "incomplete",
      direction: "asc",
      page: 1,
      sort: "title",
    },
    sessionA2,
  );
  expectSuccess(incomplete, "todo incomplete filter");
  const browsePassed =
    titles.includes(`aaa-${nonce}`) &&
    titles.includes(`zzz-${nonce}`) &&
    titles.indexOf(`aaa-${nonce}`) < titles.indexOf(`zzz-${nonce}`) &&
    arrayOutput(completed, "itemIds")
      .map(String)
      .includes(String(output(omega, "todoId"))) &&
    !arrayOutput(incomplete, "itemIds")
      .map(String)
      .includes(String(output(omega, "todoId")));

  return {
    session: sessionA2,
    browserWitness: lifecycleTitle,
    http: new Map([
      ["TODO-HIDDEN-HTTP-AUTH-01", { passed: authPassed, accountId: accountA }],
      [
        "TODO-HIDDEN-HTTP-ISOLATION-01",
        { passed: isolationPassed, privateTodoId: privateId },
      ],
      [
        "TODO-HIDDEN-HTTP-LIFECYCLE-01",
        { passed: lifecyclePassed, todoId: lifecycleId },
      ],
      [
        "TODO-HIDDEN-HTTP-BROWSE-01",
        { passed: browsePassed, observedTitles: titles },
      ],
    ]),
  };
}

async function redditScenarios(contract, nonce) {
  const password = `Evidence-${nonce}-Pass9!`;
  const ownerEmail = `evidence-${nonce}-owner@example.test`;
  const moderatorEmail = `evidence-${nonce}-moderator@example.test`;
  const peerEmail = `evidence-${nonce}-peer@example.test`;
  const owner = await call(contract, "auth.register", {
    email: ownerEmail,
    password,
    username: `ev_${nonce}_owner`,
  });
  expectSuccess(owner, "reddit owner registration");
  const ownerSession = sessionFrom(contract, owner);
  const ownerId = String(output(owner, "userId"));
  const ownerUsername = `ev_${nonce}_owner`;
  const profile = await call(contract, "profile.get.public", {
    username: ownerUsername,
  });
  expectSuccess(profile, "reddit initial public profile");
  const duplicate = await call(contract, "auth.register", {
    email: ownerEmail.toUpperCase(),
    password,
    username: `EV_${nonce}_OWNER`,
  });
  expectRefusal(duplicate, "reddit duplicate registration");
  const secondLogin = await call(contract, "auth.login", {
    email: ownerEmail,
    password,
  });
  expectSuccess(secondLogin, "reddit second login");
  const ownerSession2 = sessionFrom(contract, secondLogin);
  const logout = await call(contract, "auth.logout.current", {}, ownerSession);
  expectSuccess(logout, "reddit current logout");
  const revoked = await call(
    contract,
    "community.create",
    communityInput(`revoked_${nonce}`, nonce),
    ownerSession,
  );
  expectRefusal(revoked, "reddit revoked session");
  const authPassed =
    String(output(profile, "userId")) === ownerId &&
    String(output(profile, "username")).toLowerCase() ===
      ownerUsername.toLowerCase();

  const moderator = await call(contract, "auth.register", {
    email: moderatorEmail,
    password,
    username: `ev_${nonce}_moderator`,
  });
  expectSuccess(moderator, "reddit moderator registration");
  const moderatorId = String(output(moderator, "userId"));
  const moderatorSession = sessionFrom(contract, moderator);
  const peer = await call(contract, "auth.register", {
    email: peerEmail,
    password,
    username: `ev_${nonce}_peer`,
  });
  expectSuccess(peer, "reddit peer registration");
  const peerId = String(output(peer, "userId"));
  const community = await call(
    contract,
    "community.create",
    communityInput(`evidence_${nonce}`, nonce),
    ownerSession2,
  );
  expectSuccess(community, "reddit community create");
  const communityId = String(output(community, "communityId"));
  const initialOwner = String(output(community, "ownerId"));
  const addModerator = await call(
    contract,
    "community.moderator.add",
    { communityId, targetUserId: moderatorId },
    ownerSession2,
  );
  expectSuccess(addModerator, "reddit add moderator");
  const forbiddenRemoval = await call(
    contract,
    "community.moderator.remove",
    { communityId, targetUserId: ownerId },
    moderatorSession,
  );
  expectRefusal(forbiddenRemoval, "reddit moderator ownership removal");
  const addPeer = await call(
    contract,
    "community.moderator.add",
    { communityId, targetUserId: peerId },
    ownerSession2,
  );
  expectSuccess(addPeer, "reddit owner remains authoritative");
  const communities = await call(contract, "community.list.public", {
    page: 1,
    search: `evidence_${nonce}`,
  });
  expectSuccess(communities, "reddit public community list");
  const communityIds = arrayOutput(communities, "communityIds").map(String);
  const ownerIds = arrayOutput(communities, "ownerIds").map(String);
  const subscriberCounts = arrayOutput(communities, "subscriberCounts").map(
    Number,
  );
  const moderatorIds = arrayOutput(addPeer, "moderatorIds").map(String);
  const communityPassed =
    initialOwner === ownerId &&
    String(output(addPeer, "ownerId")) === ownerId &&
    moderatorIds.includes(moderatorId) &&
    moderatorIds.includes(peerId) &&
    communityIds.includes(communityId) &&
    ownerIds.includes(ownerId) &&
    subscriberCounts.some((count) => count >= 1);

  const postTitle = `hidden-popular-${nonce}`;
  const post = await call(
    contract,
    "post.create",
    { communityId, text: `post body ${nonce}`, title: postTitle },
    ownerSession2,
  );
  expectSuccess(post, "reddit post create");
  const postId = String(output(post, "postId"));
  const top = await call(
    contract,
    "comment.create",
    { postId, text: `top ${nonce}` },
    moderatorSession,
  );
  expectSuccess(top, "reddit top-level comment");
  const topId = String(output(top, "commentId"));
  const reply = await call(
    contract,
    "comment.reply",
    { parentCommentId: topId, postId, text: `reply ${nonce}` },
    ownerSession2,
  );
  expectSuccess(reply, "reddit comment reply");
  const participationPassed =
    String(output(reply, "parentCommentId")) === topId &&
    String(output(reply, "commentId")) !== topId;
  const postDetail = await call(contract, "post.get.public", { postId });
  expectSuccess(postDetail, "reddit post detail after comments");
  const thread = await call(contract, "comment.list.thread", {
    page: 1,
    postId,
    sort: "best",
  });
  expectSuccess(thread, "reddit nested comment thread");
  const commentIds = arrayOutput(thread, "commentIds").map(String);
  const parentIds = arrayOutput(thread, "parentIds").map((value) =>
    value === null ? null : String(value),
  );
  const popular = await call(contract, "feed.popular", { page: 1 });
  expectSuccess(popular, "reddit popular feed");
  const popularIds = arrayOutput(popular, "postIds").map(String);
  const popularTitles = arrayOutput(popular, "postTitles").map(String);
  const popularPassed =
    popularIds.includes(postId) && popularTitles.includes(postTitle);

  return {
    session: ownerSession2,
    browserWitness: postTitle,
    http: new Map([
      ["REDDIT-HIDDEN-HTTP-AUTH-01", { passed: authPassed, userId: ownerId }],
      [
        "REDDIT-HIDDEN-HTTP-COMMUNITY-01",
        {
          passed: communityPassed,
          communityId,
          ownerId,
          moderatorIds,
        },
      ],
      [
        "REDDIT-HIDDEN-HTTP-PARTICIPATION-01",
        {
          passed:
            participationPassed &&
            popularPassed &&
            Number(output(postDetail, "commentCount")) === 2 &&
            commentIds.includes(topId) &&
            commentIds.includes(String(output(reply, "commentId"))) &&
            parentIds.includes(topId),
          postId,
          topId,
        },
      ],
    ]),
  };
}

async function browserScenarios(input, contract, state) {
  const browserCases = input.manifest.cases.filter(
    (candidate) => candidate.kind === "browser",
  );
  if (browserCases.length === 0) return [];
  confinedPackageRoot(input.workspace, contract.frontendPackageRoot);
  const resolve = createRequire(import.meta.url);
  const playwrightPath = resolve.resolve("@playwright/test");
  const playwright = await import(pathToFileURL(playwrightPath).href);
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (chromium === undefined)
    throw new Error("Pinned Playwright does not export Chromium.");
  const browser = await chromium.launch({ headless: true });
  const observations = [];
  try {
    for (const test of browserCases)
      for (const viewport of test.viewports) {
        const started = process.hrtime.bigint();
        const dimensions = VIEWPORTS[viewport];
        const context = await browser.newContext({ viewport: dimensions });
        try {
          await installBrowserSession(
            context,
            contract,
            state.session,
            test.routeState,
          );
          const page = await context.newPage();
          const route = contract.routes[test.routeState];
          const requestedUrl = new URL(route.path, contract.browserOrigin).href;
          await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });
          const navigated = new URL(page.url());
          const expectedRoute = new URL(route.path, contract.browserOrigin);
          if (
            navigated.origin !== expectedRoute.origin ||
            navigated.pathname !== expectedRoute.pathname
          )
            throw new Error(
              `Browser route ${test.routeState} escaped its public binding.`,
            );
          await page
            .getByText(state.browserWitness, { exact: false })
            .first()
            .waitFor();
          let dialogFocusReturned = true;
          if (ROUTES[contract.subject][test.routeState].dialog) {
            const trigger = await uniqueAction(
              page,
              /(?:create|new|submit).*(?:post)|(?:post).*(?:create|new|submit)/iu,
              `${test.routeState} dialog trigger`,
            );
            await trigger.click();
            await page.getByRole("dialog").waitFor();
            const close = await uniqueAction(
              page,
              /close|cancel|dismiss/iu,
              `${test.routeState} dialog close`,
            );
            await close.click();
            dialogFocusReturned = await trigger.evaluate(
              (element) => document.activeElement === element,
            );
          } else {
            await page.keyboard.press("Tab");
            dialogFocusReturned = await page.evaluate(
              () => document.activeElement !== document.body,
            );
          }
          await page.addScriptTag({ content: axe.source });
          const accessibility = await page.evaluate(async () =>
            globalThis.axe.run(document, {
              runOnly: {
                type: "tag",
                values: [
                  "wcag2a",
                  "wcag2aa",
                  "wcag21a",
                  "wcag21aa",
                  "wcag22a",
                  "wcag22aa",
                ],
              },
            }),
          );
          const prefix = `browser/${test.id}-${viewport}`;
          const screenshotRelative = `${prefix}.png`;
          const screenshotPath = path.join(
            input.output,
            ...screenshotRelative.split("/"),
          );
          fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
          await page.screenshot({ path: screenshotPath, fullPage: false });
          const accessibilityRelative = `${prefix}.axe.json`;
          const accessibilityBytes = Buffer.from(
            `${JSON.stringify(
              {
                engine: "axe-core",
                engineVersion: axe.version,
                rulesetSha256: digest(axe.source),
                violations: accessibility.violations,
              },
              null,
              2,
            )}\n`,
          );
          writeArtifact(
            input.output,
            accessibilityRelative,
            accessibilityBytes,
          );
          const screenshotBytes = fs.readFileSync(screenshotPath);
          const probes = [];
          if (viewport === "mobile") {
            for (const probe of [
              { kind: "reflow_320", width: 320, zoom: false },
              { kind: "text_zoom_200", width: 390, zoom: true },
            ]) {
              await page.setViewportSize({ width: probe.width, height: 844 });
              let passed;
              if (probe.zoom) {
                const textZoom = await page.evaluate(() => {
                  const candidates = [
                    ...document.querySelectorAll(
                      "body *:not(script):not(style):not(svg):not(path)",
                    ),
                  ].filter((element) => {
                    const style = getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    const ownsText = [...element.childNodes].some(
                      (node) =>
                        node.nodeType === Node.TEXT_NODE &&
                        (node.textContent ?? "").trim().length !== 0,
                    );
                    const isControl = element.matches(
                      "a,button,input,select,textarea,[role=button],[role=link],[tabindex]",
                    );
                    return (
                      (ownsText || isControl) &&
                      style.display !== "none" &&
                      style.visibility !== "hidden" &&
                      rect.width > 0 &&
                      rect.height > 0
                    );
                  });
                  const before = candidates.map((element, index) => {
                    element.setAttribute(
                      "data-benchmark-text-zoom",
                      String(index),
                    );
                    return {
                      index,
                      fontSize: Number.parseFloat(
                        getComputedStyle(element).fontSize,
                      ),
                    };
                  });
                  for (const entry of before) {
                    const element = document.querySelector(
                      `[data-benchmark-text-zoom="${entry.index}"]`,
                    );
                    element.style.setProperty(
                      "font-size",
                      `${entry.fontSize * 2}px`,
                      "important",
                    );
                  }
                  const viewportWidth = document.documentElement.clientWidth;
                  const retained = before.every((entry) => {
                    const element = document.querySelector(
                      `[data-benchmark-text-zoom="${entry.index}"]`,
                    );
                    const rect = element.getBoundingClientRect();
                    const computed = Number.parseFloat(
                      getComputedStyle(element).fontSize,
                    );
                    return (
                      computed >= entry.fontSize * 1.99 &&
                      rect.width > 0 &&
                      rect.height > 0 &&
                      rect.left >= -1 &&
                      rect.right <= viewportWidth + 1 &&
                      element.scrollWidth <= element.clientWidth + 1 &&
                      element.scrollHeight <= element.clientHeight + 1
                    );
                  });
                  return {
                    candidates: before.length,
                    retained,
                    noHorizontalOverflow:
                      document.documentElement.scrollWidth <= viewportWidth,
                  };
                });
                passed =
                  textZoom.candidates > 0 &&
                  textZoom.retained &&
                  textZoom.noHorizontalOverflow &&
                  (await page
                    .getByText(state.browserWitness, { exact: false })
                    .first()
                    .isVisible());
              } else
                passed = await page.evaluate(
                  () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth,
                );
              const relative = `${prefix}.${probe.kind}.png`;
              const location = path.join(input.output, ...relative.split("/"));
              await page.screenshot({ path: location, fullPage: false });
              probes.push({
                kind: probe.kind,
                path: relative,
                sha256: digest(fs.readFileSync(location)),
                width: probe.width,
                height: 844,
                passed,
              });
            }
          }
          observations.push({
            caseId: test.id,
            viewport,
            routeState: test.routeState,
            requestedUrl,
            finalUrl: page.url(),
            status:
              accessibility.violations.length === 0 &&
              dialogFocusReturned &&
              probes.every((probe) => probe.passed)
                ? "passed"
                : "failed",
            startedMonotonicNs: started.toString(),
            completedMonotonicNs: process.hrtime.bigint().toString(),
            screenshot: {
              path: screenshotRelative,
              sha256: digest(screenshotBytes),
              width: dimensions.width,
              height: dimensions.height,
            },
            accessibility: {
              artifact: accessibilityRelative,
              sha256: digest(accessibilityBytes),
              engine: "axe-core",
              engineVersion: axe.version,
              rulesetSha256: digest(axe.source),
              violations: accessibility.violations.length,
            },
            probes,
          });
        } finally {
          await context.close();
        }
      }
  } finally {
    await browser.close();
  }
  return observations;
}

async function uniqueAction(page, name, label) {
  const matches = [];
  for (const role of ["button", "link"]) {
    const locator = page.getByRole(role, { name });
    const count = await locator.count();
    for (let index = 0; index < count; ++index)
      if (await locator.nth(index).isVisible())
        matches.push(locator.nth(index));
  }
  if (matches.length !== 1)
    throw new Error(`${label} observed ${matches.length} public controls.`);
  return matches[0];
}

async function installBrowserSession(context, contract, session, routeState) {
  if (!ROUTES[contract.subject][routeState].auth) return;
  if (contract.session.kind === "cookie") {
    await context.addCookies([
      {
        name: contract.session.cookieName,
        value: session.value,
        url: contract.browserOrigin,
      },
    ]);
  } else {
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: contract.session.browserStorageKey, value: session.value },
    );
  }
}

async function call(contract, operationId, semanticInput, session) {
  const specification = OPERATIONS[contract.subject][operationId];
  const operation = contract.operations[operationId];
  exactKeys(
    semanticInput,
    specification.request,
    `${operationId} semantic input`,
  );
  if (specification.auth && session === undefined)
    throw new Error(`Operation ${operationId} requires a hidden session.`);
  let pathname = operation.path;
  const query = new URLSearchParams();
  const body = {};
  const multipart = Object.values(operation.request).some(
    (binding) => binding.location === "multipart",
  )
    ? new FormData()
    : null;
  for (const [semantic, value] of Object.entries(semanticInput)) {
    const binding = operation.request[semantic];
    if (binding.location === "path")
      pathname = pathname.replace(
        `{${binding.name}}`,
        encodeURIComponent(String(value)),
      );
    else if (binding.location === "query")
      query.append(binding.name, String(value));
    else if (binding.location === "multipart") {
      if (
        typeof value === "object" &&
        value !== null &&
        "bytes" in value &&
        "filename" in value &&
        "mediaType" in value
      )
        multipart.append(
          binding.name,
          new Blob([Buffer.from(value.bytes, "base64")], {
            type: value.mediaType,
          }),
          value.filename,
        );
      else multipart.append(binding.name, String(value));
    } else setPointer(body, binding.name, value);
  }
  if (pathname.includes("{"))
    throw new Error(
      `Operation ${operationId} left a path placeholder unbound.`,
    );
  const url = new URL(pathname, contract.apiOrigin);
  for (const [key, value] of query) url.searchParams.append(key, value);
  const headers = { accept: "application/json" };
  if (
    multipart === null &&
    operation.method !== "GET" &&
    Object.keys(body).length !== 0
  )
    headers["content-type"] = "application/json";
  if (session !== undefined) {
    if (contract.session.kind === "cookie")
      headers.cookie = `${contract.session.cookieName}=${session.value}`;
    else
      headers[contract.session.headerName] =
        `${contract.session.scheme} ${session.value}`;
  }
  const response = await fetch(url, {
    method: operation.method,
    headers,
    body:
      operation.method === "GET"
        ? undefined
        : (multipart ??
          (Object.keys(body).length === 0 ? undefined : JSON.stringify(body))),
    redirect: "error",
  });
  const bodyBytes = Buffer.from(await response.arrayBuffer());
  const text = strictUtf8(bodyBytes, `operation ${operationId} response`);
  let json = null;
  if (text.length !== 0) {
    try {
      json = JSON_VALIDATOR.parse(text, false);
    } catch {
      throw new Error(`Operation ${operationId} returned non-JSON content.`);
    }
  }
  return { operationId, operation, response, json };
}

function sessionFrom(contract, result) {
  if (contract.session.kind === "cookie") {
    const cookies =
      typeof result.response.headers.getSetCookie === "function"
        ? result.response.headers.getSetCookie()
        : [result.response.headers.get("set-cookie")].filter(Boolean);
    const prefix = `${contract.session.cookieName}=`;
    for (const cookie of cookies) {
      const pair = cookie.split(";", 1)[0];
      if (pair.startsWith(prefix)) return { value: pair.slice(prefix.length) };
    }
    throw new Error(
      `${result.operationId} did not issue the declared session cookie.`,
    );
  }
  const header = result.response.headers.get(contract.session.headerName);
  const value =
    typeof header === "string" && header.trim().length !== 0
      ? header.replace(new RegExp(`^${contract.session.scheme}\\s+`, "iu"), "")
      : findBearer(result.json);
  if (typeof value !== "string" || value.length < 16)
    throw new Error(`${result.operationId} returned an invalid bearer.`);
  return { value };
}

function findBearer(value) {
  const matches = [];
  const visit = (current, key) => {
    if (typeof current === "string") {
      if (
        /(?:access)?token|session|authorization|bearer/iu.test(key) &&
        current.length >= 16
      )
        matches.push(current.replace(/^Bearer\s+/iu, ""));
      return;
    }
    if (Array.isArray(current)) for (const entry of current) visit(entry, key);
    else if (typeof current === "object" && current !== null)
      for (const [childKey, child] of Object.entries(current))
        visit(child, childKey);
  };
  visit(value, "");
  return new Set(matches).size === 1 ? matches[0] : undefined;
}

function expectSuccess(result, label) {
  if (
    !result.operation.response.successStatuses.includes(result.response.status)
  )
    throw new Error(`${label} failed with HTTP ${result.response.status}.`);
}

function expectRefusal(result, label) {
  if (
    result.operation.response.successStatuses.includes(
      result.response.status,
    ) ||
    result.response.status < 400 ||
    result.response.status > 499
  )
    throw new Error(`${label} was not a neutral client refusal.`);
}

function output(result, semantic) {
  return pointer(
    result.json,
    result.operation.response.bindings[semantic],
    `${result.operationId} ${semantic}`,
  );
}

function arrayOutput(result, semantic) {
  const value = output(result, semantic);
  if (!Array.isArray(value))
    throw new Error(`${result.operationId} ${semantic} must be an array.`);
  return value;
}

function pointer(value, expression, label) {
  let current = value;
  const segments = expression
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  for (let index = 0; index < segments.length; ++index) {
    const segment = segments[index];
    if (segment === "*") {
      if (!Array.isArray(current))
        throw new Error(`${label} wildcard does not address an array.`);
      const rest = `/${segments
        .slice(index + 1)
        .map((part) => part.replaceAll("~", "~0").replaceAll("/", "~1"))
        .join("/")}`;
      return current.map((entry) =>
        rest === "/" ? entry : pointer(entry, rest, label),
      );
    }
    if (
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    )
      throw new Error(`${label} response pointer is absent.`);
    current = current[segment];
  }
  return current;
}

function setPointer(target, expression, value) {
  const segments = expression
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!(segment in current)) current[segment] = {};
    if (
      typeof current[segment] !== "object" ||
      current[segment] === null ||
      Array.isArray(current[segment])
    )
      throw new Error(
        `Body pointer ${expression} collides with another field.`,
      );
    current = current[segment];
  }
  current[segments.at(-1)] = value;
}

function browseTodo() {
  return {
    completion: "all",
    direction: "desc",
    page: 1,
    sort: "createdAt",
  };
}

function todoInput(title) {
  return {
    title,
    description: `hidden ${title}`,
    startDate: null,
    dueDate: null,
  };
}

function communityInput(name, nonce) {
  return {
    description: `Evidence community ${nonce}`,
    displayName: `Evidence ${nonce}`,
    icon: {
      bytes:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
      filename: `evidence-${nonce}.png`,
      mediaType: "image/png",
    },
    name,
  };
}

function writeArtifact(root, relative, bytes) {
  const location = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, bytes, { flag: "wx" });
}

function confinedPackageRoot(workspace, relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative.split("/").some((segment) => segment === "" || segment === "..")
  )
    throw new Error("Frontend package root is not a confined POSIX path.");
  const root = path.resolve(workspace);
  const location = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(root, location);
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    !fs.existsSync(path.join(location, "package.json"))
  )
    throw new Error("Frontend package root is absent or escaped.");
  return location;
}

function confinedRegularFile(workspace, relative, label) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative.split("/").some((segment) => segment === "" || segment === "..")
  )
    throw new Error(`${label} is not a confined POSIX path.`);
  const root = path.resolve(workspace);
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (!fs.existsSync(current) || fs.lstatSync(current).isSymbolicLink())
      throw new Error(`${label} is absent or symbolic.`);
  }
  if (!fs.statSync(current).isFile())
    throw new Error(`${label} is not a regular file.`);
  return current;
}

function publicPath(value, label) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  )
    throw new Error(`${label} must be an absolute public URL path.`);
  for (const segment of value.toLowerCase().split("/"))
    if (DENIED_SEGMENTS.has(segment.replaceAll(/[{}]/gu, "")))
      throw new Error(`${label} uses a harness-only path segment.`);
}

function loopbackOrigin(value, label) {
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
  )
    throw new Error(`${label} must be a bare loopback HTTP origin.`);
}

function jsonPointer(value, wildcard, label) {
  if (
    typeof value !== "string" ||
    !/^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/u.test(value) ||
    (!wildcard && value.split("/").includes("*")) ||
    (wildcard && value.split("/").filter((part) => part === "*").length > 1)
  )
    throw new Error(`${label} is not a supported JSON pointer.`);
}

function token(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(value))
    throw new Error(`${label} is not a safe public token.`);
}

function exactKeys(value, keys, label) {
  record(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label} fields are not the exact expected set.`);
}

function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function strictJson(bytes, label) {
  try {
    return JSON_VALIDATOR.parse(strictUtf8(bytes, label), false);
  } catch (error) {
    throw new Error(
      `${label} is not strict JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function strictUtf8(bytes, label) {
  const input = Buffer.from(bytes);
  if (
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
  )
    throw new Error(`${label} must not contain a UTF-8 BOM.`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function sha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
}
