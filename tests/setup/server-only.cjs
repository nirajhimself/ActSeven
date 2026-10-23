// Test-only: `server-only` is provided by Next.js's bundler, not node_modules.
// Outside Next it has nothing to guard, so resolve it to an empty module.
// CommonJS on purpose: loaded with `node --require` before anything else.
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");
const stub = path.join(__dirname, "empty.cjs");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? stub : resolve.call(this, request, ...rest);
};
