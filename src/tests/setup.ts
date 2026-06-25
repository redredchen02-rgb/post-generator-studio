import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "post-generator-tests-"));

process.env.POST_GENERATOR_HOME = testHome;
process.env.POST_GENERATOR_SECRET_KEY =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

afterAll(() => {
  fs.rmSync(testHome, { recursive: true, force: true });
});

