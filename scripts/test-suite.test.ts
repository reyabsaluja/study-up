import { afterEach, describe, expect, test } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const suitePath = resolve(process.cwd(), "scripts/test-suite.sh");
const temporaryDirectories: string[] = [];

interface ToolchainOptions {
  nodeMajor?: string;
  pnpmVersion?: string;
  supabaseRunning?: boolean;
  failCommand?: string;
}

const createToolchain = ({
  nodeMajor = "22",
  pnpmVersion = "12.4.1",
  supabaseRunning = false,
  failCommand,
}: ToolchainOptions = {}) => {
  const bin = mkdtempSync(resolve(tmpdir(), "studyup-suite-test-"));
  temporaryDirectories.push(bin);
  const log = resolve(bin, "commands.log");
  writeFileSync(log, "");

  writeFileSync(
    resolve(bin, "node"),
    `#!/bin/sh
case "$*" in
  *process.versions.node*) printf '%s\\n' '${nodeMajor}' ;;
  *packageManager*) printf '%s\\n' '12.4.1' ;;
  *) exit 0 ;;
esac
`,
  );
  writeFileSync(
    resolve(bin, "pnpm"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' '${pnpmVersion}'
  exit 0
fi
printf 'pnpm %s\\n' "$*" >> "$TEST_COMMAND_LOG"
if [ "$*" = "exec supabase status" ]; then
  exit ${supabaseRunning ? "0" : "1"}
fi
if [ -n "$TEST_FAIL_COMMAND" ] && [ "$*" = "$TEST_FAIL_COMMAND" ]; then
  exit 7
fi
exit 0
`,
  );
  writeFileSync(
    resolve(bin, "deno"),
    `#!/bin/sh
printf 'deno %s\\n' "$*" >> "$TEST_COMMAND_LOG"
exit 0
`,
  );
  writeFileSync(resolve(bin, "docker"), "#!/bin/sh\nexit 0\n");

  for (const command of ["node", "pnpm", "deno", "docker"]) {
    chmodSync(resolve(bin, command), 0o755);
  }

  return {
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}/usr/bin${delimiter}/bin`,
      TEST_COMMAND_LOG: log,
      TEST_FAIL_COMMAND: failCommand ?? "",
      SUPABASE_START_RETRY_DELAY_SECONDS: "0",
    },
    log,
  };
};

const runSuite = (
  mode: string,
  options: ToolchainOptions = {},
  additionalArguments: string[] = [],
) => {
  const toolchain = createToolchain(options);
  const result = spawnSync(
    "/bin/bash",
    [suitePath, mode, ...additionalArguments],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: toolchain.env,
    },
  );

  return {
    ...result,
    commands: readFileSync(toolchain.log, "utf8").trim().split("\n").filter(Boolean),
  };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("test suite shell entry point", () => {
  test("prints help without requiring the toolchain", () => {
    const result = spawnSync("/bin/bash", [suitePath, "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("functions   Run isolated Edge Function");
    expect(result.stdout).toContain("database    Start an owned test stack");
  });

  test("runs the quick quality and audit gates", () => {
    const result = runSuite("quick");

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm check",
      "pnpm audit --audit-level=high",
    ]);
  });

  test("forwards Playwright arguments to the public suite", () => {
    const result = runSuite("public", {}, ["--workers=1", "--grep", "landing"]);

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm test:e2e:public:ci --workers=1 --grep landing",
    ]);
  });

  test("rejects the wrong Node major version", () => {
    const result = runSuite("quick", { nodeMajor: "21" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Node 22 is required");
    expect(result.commands).toEqual([]);
  });

  test("rejects a pnpm version other than the manifest pin", () => {
    const result = runSuite("quick", { pnpmVersion: "11.18.0" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm 12.4.1 is required");
    expect(result.commands).toEqual([]);
  });

  test("runs isolated Edge Function tests only when Deno is available", () => {
    const result = runSuite("functions");

    expect(result.status).toBe(0);
    expect(result.commands).toEqual(["pnpm test:functions"]);
  });

  test("starts and cleans up an owned disposable database", () => {
    const result = runSuite("database");

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm exec supabase status",
      "pnpm supabase:start:test",
      "pnpm db:reset",
      "pnpm db:test",
      "pnpm db:lint",
      "pnpm supabase:stop --no-backup",
    ]);
    expect(result.stdout).toContain("Starting a disposable Supabase test stack");
    expect(result.stdout).toContain("Stopping the disposable Supabase stack");
  });

  test("does not stop a database stack it did not start", () => {
    const result = runSuite("database", { supabaseRunning: true });

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm exec supabase status",
      "pnpm db:reset",
      "pnpm db:test",
      "pnpm db:lint",
    ]);
    expect(result.stdout).toContain("Using the Supabase stack that was already running");
  });

  test("cleans up an owned database after a test failure", () => {
    const result = runSuite("database", { failCommand: "db:test" });

    expect(result.status).toBe(7);
    expect(result.commands.at(-1)).toBe("pnpm supabase:stop --no-backup");
    expect(result.commands).not.toContain("pnpm db:lint");
  });

  test("cleans partial Supabase state and retries startup failures", () => {
    const result = runSuite("database", {
      failCommand: "supabase:start:test",
    });

    expect(result.status).toBe(1);
    expect(
      result.commands.filter(
        (command) => command === "pnpm supabase:start:test",
      ),
    ).toHaveLength(3);
    expect(
      result.commands.filter(
        (command) => command === "pnpm supabase:stop --no-backup",
      ),
    ).toHaveLength(3);
    expect(result.stdout).toContain("cleaning partial state before retry");
  });

  test("provisions and cleans up an owned full product integration stack", () => {
    const result = runSuite("integration", {}, ["--workers=1"]);

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm exec supabase status",
      "pnpm supabase:start",
      "pnpm db:reset",
      "pnpm env:local --force",
      "pnpm e2e:user:local",
      "pnpm test:e2e:integration --workers=1",
      "pnpm supabase:stop --no-backup",
    ]);
    expect(result.stdout).toContain(
      "Starting a disposable full Supabase product-test stack",
    );
  });

  test("preserves a product stack that was already running", () => {
    const result = runSuite("integration", { supabaseRunning: true });

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "pnpm exec supabase status",
      "pnpm supabase:start",
      "pnpm db:reset",
      "pnpm env:local --force",
      "pnpm e2e:user:local",
      "pnpm test:e2e:integration",
    ]);
    expect(result.commands).not.toContain("pnpm supabase:stop --no-backup");
  });

  test("rejects an unknown suite mode", () => {
    const result = runSuite("mystery");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Usage: pnpm test:suite");
    expect(result.stderr).toContain("unknown mode 'mystery'");
  });
});
