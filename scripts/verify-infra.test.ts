import { afterEach, describe, expect, test } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const verifierPath = resolve(process.cwd(), "scripts/verify-infra.mjs");
const temporaryProjects: string[] = [];

const writeJson = (root: string, path: string, value: unknown) => {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
};

const createProject = () => {
  const root = mkdtempSync(resolve(tmpdir(), "studyup-infra-test-"));
  temporaryProjects.push(root);
  mkdirSync(resolve(root, "supabase/migrations"), { recursive: true });
  mkdirSync(resolve(root, "infra/environments"), { recursive: true });
  mkdirSync(resolve(root, ".github/workflows"), { recursive: true });

  writeJson(root, "package.json", {
    packageManager: "pnpm@12.4.1",
    scripts: {
      "test:ci:static": "true",
      "test:ci:unit": "true",
      "test:ci:functions": "true",
      "test:ci:e2e": "true",
      "test:suite": "true",
    },
    dependencies: { react: "19.2.8" },
    devDependencies: { vite: "8.1.5" },
  });
  writeJson(root, "vercel.json", {
    framework: "vite",
    buildCommand: "pnpm build",
    outputDirectory: "dist",
    git: {
      deploymentEnabled: {
        "*": false,
        main: true,
        staging: true,
      },
    },
    rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    headers: [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'; frame-ancestors 'none'; connect-src 'self' https://*.supabase.co wss://*.supabase.co" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=()" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }],
  });
  writeJson(root, "infra/environments/staging.json", {
    name: "staging",
    git: {
      repository: "vicdenz/study-up",
      branch: "staging",
      productionBranch: "main",
      requiredChecks: [],
      directPushesAllowed: true,
      forcePushesAllowed: false,
      deletionAllowed: false,
    },
    github: {
      environment: "staging",
      branchPolicy: "selected",
      requiredPullRequestApprovals: 0,
      requireConversationResolution: false,
    },
    vercel: {
      target: "preview",
      customEnvironment: false,
      branchAlias:
        "https://study-up-git-staging-david-daniliucs-projects.vercel.app",
    },
    supabase: {
      allowedOrigins: [
        "https://study-up-pi.vercel.app",
        "https://study-up-git-staging-david-daniliucs-projects.vercel.app",
      ],
      allowedOriginPatterns: [
        "https://study-*-david-daniliucs-projects.vercel.app",
      ],
      strategy: "persistent-branch",
      projectRef: "hzkwaecgggkjikwlvghi",
      branch: "staging",
      withProductionData: true,
      resetOnProductionMerge: true,
      requiresPlan: "pro",
    },
  });
  writeJson(root, "infra/environments/production.json", {
    name: "production",
    git: {
      repository: "vicdenz/study-up",
      branch: "main",
      requiredChecks: [
        "static-analysis",
        "unit",
        "edge-functions",
        "browser-e2e",
        "performance",
        "database",
        "integration-e2e",
      ],
      directPushesAllowed: false,
      forcePushesAllowed: false,
      deletionAllowed: false,
    },
    github: {
      branchPolicy: "protected",
      requirePullRequest: true,
      requiredPullRequestApprovals: 0,
      requireUpToDateBranch: true,
    },
    vercel: { project: "study-up", target: "production" },
    supabase: { projectRef: "hzkwaecgggkjikwlvghi", branch: "main" },
  });
  writeFileSync(
    resolve(root, ".github/workflows/quality.yml"),
    [
      "on:",
      "  deployment_status:",
      "concurrency:",
      "  group: quality-${{ github.event_name }}-${{ github.event.deployment.id }}-${{ github.event.deployment_status.state }}",
      "jobs:",
      "  static-analysis:",
      "  unit:",
      "  edge-functions:",
      "  browser-e2e:",
      "  performance:",
      "  database:",
      "  integration-e2e:",
      "    if: github.event.deployment.creator.login == 'vercel[bot]'",
      "    steps:",
      "      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6",
      "        with:",
      "          persist-credentials: false",
      "",
    ].join("\n"),
  );
  writeFileSync(
    resolve(root, ".github/workflows/staging-gate.yml"),
    [
      "on:",
      "  push:",
      "    branches:",
      "      - staging",
      "jobs:",
      "  gate:",
      "    environment:",
      "      name: staging",
      "",
    ].join("\n"),
  );
  writeFileSync(
    resolve(root, ".github/workflows/deploy-vercel.yml"),
    [
      "jobs:",
      "  validate-target:",
      "    steps:",
      "      - name: Require main for production deployments",
      "        run: |",
      '          if [ "$DEPLOY_TARGET" = production ] && [ "$SOURCE_REF" != refs/heads/main ]; then',
      "            exit 1",
      "          fi",
      "  deploy:",
      "    needs: validate-target",
      "",
    ].join("\n"),
  );
  writeFileSync(resolve(root, ".vercelignore"), "/supabase\n");
  writeFileSync(resolve(root, "pnpm-workspace.yaml"), 'packages:\n  - "."\n');
  writeFileSync(resolve(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    resolve(root, "supabase/config.toml"),
    [
      "[auth]",
      'site_url = "https://study-up.vercel.app"',
      "additional_redirect_urls = [",
      '  "http://localhost:8080",',
      '  "http://127.0.0.1:8080",',
      '  "http://127.0.0.1:4173",',
      "]",
      "[auth.email]",
      'max_frequency = "1m"',
      "otp_length = 8",
      "[auth.mfa.totp]",
      "enroll_enabled = true",
      "verify_enabled = true",
      "[functions.chat-with-gemini]",
      "verify_jwt = true",
      "[functions.generate-study-plan]",
      "verify_jwt = true",
      "",
    ].join("\n"),
  );
  writeFileSync(
    resolve(root, "supabase/migrations/20260730000000_valid.sql"),
    "select 1;\n",
  );

  return root;
};

const runVerifier = (root: string) =>
  spawnSync(process.execPath, [verifierPath], {
    cwd: root,
    encoding: "utf8",
  });

const readPackage = (root: string) =>
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;

afterEach(() => {
  for (const root of temporaryProjects.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("infrastructure verifier", () => {
  test("accepts the repository's required deployment invariants", () => {
    const result = runVerifier(createProject());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Vercel, Supabase, function-auth, and migration invariants are valid.",
    );
  });

  test("rejects an unapproved pnpm version", () => {
    const root = createProject();
    const manifest = readPackage(root);
    writeJson(root, "package.json", {
      ...manifest,
      packageManager: "pnpm@11.18.0",
    });

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must pin the approved pnpm release");
  });

  test("rejects deployment configuration without a content security policy", () => {
    const root = createProject();
    const path = resolve(root, "vercel.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.headers[0].headers = config.headers[0].headers.filter(
      ({ key }: { key: string }) => key !== "Content-Security-Policy",
    );
    writeJson(root, "vercel.json", config);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Content-Security-Policy security header");
  });

  test("rejects Vercel deployments from branches other than main and staging", () => {
    const root = createProject();
    const path = resolve(root, "vercel.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.git.deploymentEnabled["dependabot/**"] = true;
    writeJson(root, "vercel.json", config);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("limited to main and staging");
  });

  test("rejects manual production deployment from an unrestricted branch", () => {
    const root = createProject();
    const path = resolve(root, ".github/workflows/deploy-vercel.yml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        '"$SOURCE_REF" != refs/heads/main',
        '"$SOURCE_REF" != refs/heads/staging',
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("restricted to main");
  });

  test("requires the project root in the pnpm workspace", () => {
    const root = createProject();
    writeFileSync(resolve(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must declare the project root");
  });

  test("rejects a second package-manager lockfile", () => {
    const root = createProject();
    writeFileSync(resolve(root, "package-lock.json"), "{}\n");

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only the committed pnpm lockfile");
  });

  test("rejects dependency ranges", () => {
    const root = createProject();
    const manifest = readPackage(root);
    writeJson(root, "package.json", {
      ...manifest,
      dependencies: { react: "^19.2.8" },
    });

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dependencies.react must use an exact version");
  });

  test("requires every CI entry point", () => {
    const root = createProject();
    const manifest = readPackage(root);
    writeJson(root, "package.json", {
      ...manifest,
      scripts: { "test:ci:static": "true" },
    });

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing the test:ci:unit test entry point");
  });

  test("rejects mutable action tags", () => {
    const root = createProject();
    const workflowPath = resolve(root, ".github/workflows/quality.yml");
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, "utf8").replace(
        "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
        "actions/checkout@v6",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must pin actions/checkout@v6 to a full commit SHA");
  });

  test("requires checkout credentials to be non-persistent", () => {
    const root = createProject();
    const workflowPath = resolve(root, ".github/workflows/quality.yml");
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, "utf8").replace(
        "          persist-credentials: false\n",
        "",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must disable persisted checkout credentials");
  });

  test("rejects a custom Vercel install command", () => {
    const root = createProject();
    writeJson(root, "vercel.json", {
      framework: "vite",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      outputDirectory: "dist",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    });

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("detect pnpm from pnpm-lock.yaml");
  });

  test("requires the Vite framework and build output", () => {
    const root = createProject();
    writeJson(root, "vercel.json", {
      framework: "nextjs",
      buildCommand: "pnpm build",
      outputDirectory: "build",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    });

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must use the Vite framework");
  });

  test("requires the SPA deep-link rewrite", () => {
    const root = createProject();
    const path = resolve(root, "vercel.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.rewrites = [];
    writeJson(root, "vercel.json", config);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SPA deep-link rewrite is missing");
  });

  test("requires the canonical repository promotion path", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/staging.json");
    const staging = JSON.parse(readFileSync(path, "utf8"));
    staging.git.repository = "legacy-owner/study-up";
    writeJson(root, "infra/environments/staging.json", staging);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must target vicdenz/study-up staging -> main",
    );
  });

  test("allows ordinary staging pushes without PR checks", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/staging.json");
    const staging = JSON.parse(readFileSync(path, "utf8"));
    staging.git.directPushesAllowed = false;
    writeJson(root, "infra/environments/staging.json", staging);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must allow direct ordinary Git operations",
    );
  });

  test("requires production to own the quality gate", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/production.json");
    const production = JSON.parse(readFileSync(path, "utf8"));
    production.git.requiredChecks = [];
    writeJson(root, "infra/environments/production.json", production);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Production must own the seven checks",
    );
  });

  test("requires a pull request while allowing zero approvals on main", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/production.json");
    const production = JSON.parse(readFileSync(path, "utf8"));
    production.git.directPushesAllowed = true;
    production.github.requirePullRequest = false;
    writeJson(root, "infra/environments/production.json", production);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("protected branch controls");
  });

  test("requires the production-data staging reset policy", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/staging.json");
    const staging = JSON.parse(readFileSync(path, "utf8"));
    staging.supabase.resetOnProductionMerge = false;
    writeJson(root, "infra/environments/staging.json", staging);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "isolated production-data branch lifecycle",
    );
  });

  test("rejects production targeting for staging deployments", () => {
    const root = createProject();
    const path = resolve(root, "infra/environments/staging.json");
    const staging = JSON.parse(readFileSync(path, "utf8"));
    staging.vercel.target = "production";
    staging.vercel.customEnvironment = true;
    writeJson(root, "infra/environments/staging.json", staging);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("branch-specific Vercel Preview alias");
  });

  test("requires quality checks after successful Vercel deployments", () => {
    const root = createProject();
    const path = resolve(root, ".github/workflows/quality.yml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("  deployment_status:\n", ""),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must run for successful Vercel deployment statuses",
    );
  });

  test("isolates push and deployment concurrency groups", () => {
    const root = createProject();
    const path = resolve(root, ".github/workflows/quality.yml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "quality-${{ github.event_name }}-${{ github.event.deployment.id }}-${{ github.event.deployment_status.state }}",
        "quality-${{ github.ref }}",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must use isolated concurrency groups",
    );
  });

  test("requires the protected staging workflow to stay branch-scoped", () => {
    const root = createProject();
    const path = resolve(root, ".github/workflows/staging-gate.yml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("      - staging", "      - main"),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must target only the protected staging environment",
    );
  });

  test("rejects an unrooted Supabase ignore that hides the browser client", () => {
    const root = createProject();
    writeFileSync(resolve(root, ".vercelignore"), "supabase\n");

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "does not exclude src/integrations/supabase",
    );
  });

  test("requires the backend directory to remain excluded from browser deploys", () => {
    const root = createProject();
    writeFileSync(resolve(root, ".vercelignore"), "docs\n");

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "must exclude the root /supabase backend directory",
    );
  });

  test.each([
    "GEMINI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ])("rejects browser deployment exposure of %s", (secretName) => {
    const root = createProject();
    const path = resolve(root, "vercel.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.env = { [secretName]: "unsafe" };
    writeJson(root, "vercel.json", config);

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${secretName} must not be configured`);
  });

  test("requires JWT verification for every user-facing function", () => {
    const root = createProject();
    const path = resolve(root, "supabase/config.toml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "[functions.chat-with-gemini]\nverify_jwt = true",
        "[functions.chat-with-gemini]\nverify_jwt = false",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("chat-with-gemini must verify JWTs");
  });

  test("rejects a localhost site URL for hosted authentication", () => {
    const root = createProject();
    const path = resolve(root, "supabase/config.toml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        'site_url = "https://study-up.vercel.app"',
        'site_url = "http://127.0.0.1:8080"',
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HTTPS Vercel site URL");
  });

  test("requires every supported local authentication redirect", () => {
    const root = createProject();
    const path = resolve(root, "supabase/config.toml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        '  "http://127.0.0.1:4173",\n',
        "",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("http://127.0.0.1:4173");
  });

  test("rejects weakened hosted email authentication controls", () => {
    const root = createProject();
    const path = resolve(root, "supabase/config.toml");
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace('max_frequency = "1m"', 'max_frequency = "1s"')
        .replace("otp_length = 8", "otp_length = 6"),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("one-minute throttle and eight-digit OTP");
  });

  test("requires TOTP enrollment and verification", () => {
    const root = createProject();
    const path = resolve(root, "supabase/config.toml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "verify_enabled = true",
        "verify_enabled = false",
      ),
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("TOTP enrollment and verification");
  });

  test("rejects malformed migration names", () => {
    const root = createProject();
    writeFileSync(
      resolve(root, "supabase/migrations/20260730-invalid.sql"),
      "select 1;\n",
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must use the <timestamp>_<name>.sql format");
  });

  test("rejects duplicate migration versions", () => {
    const root = createProject();
    writeFileSync(
      resolve(root, "supabase/migrations/20260730000000_duplicate.sql"),
      "select 1;\n",
    );

    const result = runVerifier(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Migration version prefixes must be unique");
  });
});
