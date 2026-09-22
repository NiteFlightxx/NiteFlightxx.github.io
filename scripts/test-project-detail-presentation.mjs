import assert from "node:assert/strict";
import * as taxonomy from "../src/lib/taxonomy.ts";

assert.equal(
  typeof taxonomy.getProjectDetailPresentation,
  "function",
  "project detail presentation routing should be available",
);

assert.equal(
  taxonomy.getProjectDetailPresentation?.("drone-basics-interactive"),
  "flight-lab",
  "the drone sandbox should use the dedicated flight-lab experience",
);

assert.equal(
  taxonomy.getProjectDetailPresentation?.("another-project"),
  "standard",
  "other projects should keep the standard detail experience",
);

console.log("project detail presentation: ok");
