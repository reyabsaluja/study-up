import { existsSync, readFileSync, readdirSync } from "node:fs";

const fail = (message) => {
  throw new Error(`Infrastructure validation failed: ${message}`);
};

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
const staging = JSON.parse(
  readFileSync("infra/environments/staging.json", "utf8"),
);
const production = JSON.parse(
  readFileSync("infra/environments/production.json", "utf8"),
);
const pnpmWorkspace = readFileSync("pnpm-workspace.yaml", "utf8");
const qualityWorkflow = readFileSync(".github/workflows/quality.yml", "utf8");
const stagingWorkflow = readFileSync(
  ".github/workflows/staging-gate.yml",
  "utf8",
);
const deployWorkflow = readFileSync(
  ".github/workflows/deploy-vercel.yml",
  "utf8",
);
const workflowFiles = readdirSync(".github/workflows")
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({
    name,
    text: readFileSync(`.github/workflows/${name}`, "utf8"),
  }));
const vercelIgnore = readFileSync(".vercelignore", "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

if (packageManifest.packageManager !== "pnpm@12.4.1") {
  fail("package.json must pin the approved pnpm release.");
}
if (!pnpmWorkspace.includes('packages:\n  - "."')) {
  fail("pnpm-workspace.yaml must declare the project root.");
}
if (!existsSync("pnpm-lock.yaml") || existsSync("package-lock.json")) {
  fail("The repository must use only the committed pnpm lockfile.");
}
for (const sectionName of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(
    packageManifest[sectionName] ?? {},
  )) {
    if (/^[~^]/.test(version)) {
      fail(`${sectionName}.${name} must use an exact version.`);
    }
  }
}
for (const requiredScript of [
  "test:ci:static",
  "test:ci:unit",
  "test:ci:functions",
  "test:ci:e2e",
  "test:suite",
]) {
  if (!packageManifest.scripts?.[requiredScript]) {
    fail(`package.json is missing the ${requiredScript} test entry point.`);
  }
}
if (vercel.framework !== "vite") fail("vercel.json must use the Vite framework.");
if ("installCommand" in vercel) {
  fail("Vercel must detect pnpm from pnpm-lock.yaml instead of overriding installation.");
}
if (vercel.buildCommand !== "pnpm build") fail("Unexpected Vercel build command.");
if (vercel.outputDirectory !== "dist") fail("Vercel output directory must be dist.");
if (
  vercel.git?.deploymentEnabled?.["*"] !== false ||
  vercel.git?.deploymentEnabled?.main !== true ||
  vercel.git?.deploymentEnabled?.staging !== true ||
  Object.keys(vercel.git.deploymentEnabled).length !== 3
) {
  fail("Vercel Git deployments must be limited to main and staging.");
}
const globalHeaders = vercel.headers?.find(({ source }) => source === "/(.*)")
  ?.headers ?? [];
const headerValue = (key) =>
  globalHeaders.find((header) => header.key === key)?.value;
for (const requiredHeader of [
  "Content-Security-Policy",
  "Cross-Origin-Opener-Policy",
  "Permissions-Policy",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
]) {
  if (!headerValue(requiredHeader)) {
    fail(`Vercel must set the ${requiredHeader} security header.`);
  }
}
const contentSecurityPolicy = headerValue("Content-Security-Policy");
for (const directive of [
  "default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
]) {
  if (!contentSecurityPolicy.includes(directive)) {
    fail(`Content Security Policy is missing: ${directive}.`);
  }
}
if (vercelIgnore.includes("supabase")) {
  fail(
    ".vercelignore must root the Supabase backend pattern as /supabase so it does not exclude src/integrations/supabase.",
  );
}
if (!vercelIgnore.includes("/supabase")) {
  fail(".vercelignore must exclude the root /supabase backend directory.");
}
if (
  !vercel.rewrites?.some(
    ({ source, destination }) =>
      source === "/(.*)" && destination === "/index.html",
  )
) {
  fail("The SPA deep-link rewrite is missing.");
}

const expectedChecks = [
  "static-analysis",
  "unit",
  "edge-functions",
  "browser-e2e",
  "performance",
  "database",
  "integration-e2e",
];
if (
  staging.name !== "staging" ||
  staging.git?.repository !== "vicdenz/study-up" ||
  staging.git?.branch !== "staging" ||
  staging.git?.productionBranch !== "main"
) {
  fail("The staging declaration must target vicdenz/study-up staging -> main.");
}
if (staging.git.requiredChecks.length !== 0 || !staging.git.directPushesAllowed) {
  fail("Staging must allow direct ordinary Git operations without PR checks.");
}
if (staging.git.forcePushesAllowed || staging.git.deletionAllowed) {
  fail("Staging must reject force pushes and branch deletion.");
}
if (
  staging.github?.environment !== "staging" ||
  staging.github?.branchPolicy !== "selected" ||
  staging.github?.requiredPullRequestApprovals !== 0 ||
  staging.github?.requireConversationResolution !== false
) {
  fail("The staging GitHub environment must not require PR approval.");
}
if (
  staging.vercel?.target !== "preview" ||
  staging.vercel?.customEnvironment !== false ||
  !/^https:\/\/study-up-git-staging-[a-z0-9-]+\.vercel\.app$/.test(
    staging.vercel?.branchAlias ?? "",
  )
) {
  fail("Staging must use its permanent branch-specific Vercel Preview alias.");
}
for (const job of expectedChecks) {
  if (!new RegExp(`^  ${job}:`, "m").test(qualityWorkflow)) {
    fail(`Quality workflow is missing the independent ${job} job.`);
  }
}
if (
  !/^\s{2}deployment_status:\s*$/m.test(qualityWorkflow) ||
  !qualityWorkflow.includes("github.event.deployment.creator.login == 'vercel[bot]'")
) {
  fail("Quality checks must run for successful Vercel deployment statuses.");
}
if (
  !qualityWorkflow.includes("github.event_name") ||
  !qualityWorkflow.includes("github.event.deployment.id") ||
  !qualityWorkflow.includes("github.event.deployment_status.state")
) {
  fail("Push and deployment quality runs must use isolated concurrency groups.");
}
for (const workflow of workflowFiles) {
  for (const match of workflow.text.matchAll(/\buses:\s*([^\s#]+)/g)) {
    const action = match[1];
    if (!/@[0-9a-f]{40}$/.test(action)) {
      fail(
        `.github/workflows/${workflow.name} must pin ${action} to a full commit SHA.`,
      );
    }
  }

  const checkoutCount = [...workflow.text.matchAll(/actions\/checkout@[0-9a-f]{40}/g)]
    .length;
  const hardenedCheckoutCount = [
    ...workflow.text.matchAll(/actions\/checkout@[0-9a-f]{40}[\s\S]{0,160}?persist-credentials:\s*false/g),
  ].length;
  if (checkoutCount !== hardenedCheckoutCount) {
    fail(
      `.github/workflows/${workflow.name} must disable persisted checkout credentials.`,
    );
  }
}
if (
  !deployWorkflow.includes("Require main for production deployments") ||
  !deployWorkflow.includes('"$SOURCE_REF" != refs/heads/main') ||
  !deployWorkflow.includes("needs: validate-target")
) {
  fail("Manual production deployment must be restricted to main.");
}
if (
  !/^\s{6}- staging\s*$/m.test(stagingWorkflow) ||
  !/^\s{4}environment:\s*$/m.test(stagingWorkflow) ||
  !stagingWorkflow.includes("name: staging")
) {
  fail("The staging gate must target only the protected staging environment.");
}
if (
  production.name !== "production" ||
  production.git?.repository !== "vicdenz/study-up" ||
  production.git?.branch !== "main" ||
  JSON.stringify(production.git.requiredChecks) !== JSON.stringify(expectedChecks) ||
  production.git.directPushesAllowed !== false ||
  production.github?.requirePullRequest !== true ||
  production.github?.requiredPullRequestApprovals !== 0 ||
  production.github?.requireUpToDateBranch !== true ||
  production.git.forcePushesAllowed ||
  production.git.deletionAllowed
) {
  fail("Production must own the seven checks and protected branch controls.");
}
if (
  staging.supabase?.strategy !== "persistent-branch" ||
  staging.supabase?.branch !== "staging" ||
  staging.supabase?.withProductionData !== true ||
  staging.supabase?.resetOnProductionMerge !== true ||
  staging.supabase?.requiresPlan !== "pro"
) {
  fail("Staging must declare its isolated production-data branch lifecycle.");
}

const vercelText = JSON.stringify(vercel);
for (const forbiddenName of [
  "GEMINI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
]) {
  if (vercelText.includes(forbiddenName)) {
    fail(`${forbiddenName} must not be configured in the browser deployment.`);
  }
}

const config = readFileSync("supabase/config.toml", "utf8");
if (!/site_url\s*=\s*"https:\/\/[^"]+\.vercel\.app"/.test(config)) {
  fail("Hosted Supabase Auth must use an HTTPS Vercel site URL.");
}
for (const redirectUrl of [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:4173",
]) {
  if (!config.includes(`"${redirectUrl}"`)) {
    fail(`Supabase Auth must preserve the local redirect ${redirectUrl}.`);
  }
}
if (!/max_frequency\s*=\s*"1m"/.test(config) || !/otp_length\s*=\s*8/.test(config)) {
  fail("Hosted email Auth must retain the one-minute throttle and eight-digit OTP.");
}
const totpSection = config.match(
  /\[auth\.mfa\.totp\]([\s\S]*?)(?=\n\[|$)/,
)?.[1];
if (
  !totpSection ||
  !/enroll_enabled\s*=\s*true/.test(totpSection) ||
  !/verify_enabled\s*=\s*true/.test(totpSection)
) {
  fail("Hosted Supabase Auth must keep TOTP enrollment and verification enabled.");
}
for (const functionName of ["chat-with-gemini", "generate-study-plan"]) {
  const header = `[functions.${functionName}]`;
  const sectionStart = config.indexOf(header);
  const sectionRemainder = config.slice(sectionStart + header.length);
  const nextSection = sectionRemainder.search(/\r?\n\[/);
  const section = nextSection === -1
    ? sectionRemainder
    : sectionRemainder.slice(0, nextSection);
  if (sectionStart === -1 || !/verify_jwt\s*=\s*true/.test(section)) {
    fail(`${functionName} must verify JWTs.`);
  }
}

const migrationNames = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"));
for (const name of migrationNames) {
  if (!/^\d{14}_.+\.sql$/.test(name)) {
    fail(`Migration ${name} must use the <timestamp>_<name>.sql format.`);
  }
}
const migrationVersions = migrationNames.map((name) => name.split("_")[0]);
if (new Set(migrationVersions).size !== migrationVersions.length) {
  fail("Migration version prefixes must be unique.");
}

console.log("Vercel, Supabase, function-auth, and migration invariants are valid.");
