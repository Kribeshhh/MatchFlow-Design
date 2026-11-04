import { TOTP } from "otpauth";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw new Error("UI fixtures require local test database");
const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
async function accessibility(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}
async function signedIn(page: Page) {
  const suffix = randomBytes(5).toString("hex");
  const response = await page.request.post("/api/auth/register", {
    headers: { "X-MatchFlow": "1", Origin: "http://localhost:4175" },
    data: {
      username: `ui_${suffix}`,
      email: `ui_${suffix}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return user.id as string;
}
test("public design has accessible forms and search uses real discovery", async ({ page }) => {
  test.setTimeout(60000);
  for (const path of ["/", "/tournaments", "/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await page.locator("h1").first().waitFor();
    await accessibility(page);
    await noOverflow(page);
  }
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search games or tournaments" }).fill("Valorant");
  await page.getByRole("button", { name: "SEARCH", exact: true }).click();
  await expect(page).toHaveURL(/tournaments\?game=valorant/);
  await expect(page.getByLabel("Game", { exact: true })).toHaveValue("valorant");
});
test("wizard publishes a real event, keyboard tabs and unavailable workspaces remain honest", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await signedIn(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await accessibility(page);
  await noOverflow(page);
  await page.getByRole("button", { name: "PLAYER VIEW", exact: true }).click();
  await expect(page.getByRole("link", { name: "CREATE TEAM", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "ORGANIZER VIEW", exact: true }).click();
  await expect(page.getByRole("link", { name: "CREATE TOURNAMENT", exact: true })).toBeVisible();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("dashboard.png"), fullPage: true });
  await page.getByRole("link", { name: "CREATE TOURNAMENT", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Identity & format", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Identity & format", exact: true })).toBeVisible();
  await page.getByLabel("Tournament name", { exact: true }).fill("UI Test — Signal Open");
  await page.getByLabel("Players per team", { exact: true }).fill("1");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByLabel("Registration opens", { exact: true }).fill("2030-01-01T10:00");
  await page.getByLabel("Registration closes", { exact: true }).fill("2030-01-02T10:00");
  await page.getByLabel("Tournament start", { exact: true }).fill("2030-01-03T10:00");
  await page.getByLabel("Description", { exact: true }).fill("A browser test competition.");
  await page.getByLabel("Rules", { exact: true }).fill("Single elimination with decisive results.");
  await accessibility(page);
  await noOverflow(page);
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review & publish", exact: true })).toBeVisible();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("wizard.png"), fullPage: true });
  await page.getByRole("button", { name: "PUBLISH TOURNAMENT", exact: true }).click();
  await expect(page).toHaveURL(/organizer\/tournaments\/c[a-z0-9]+$/);
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Registrations", exact: true })).toBeFocused();
  await accessibility(page);
  await noOverflow(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("tournament.png"), fullPage: true });
  for (const [path, heading] of [
    ["/organizations", "No organization workspace yet"],
    ["/schedule", "On the schedule."],
    ["/results", "The scorebook."],
    ["/account", "Account & security."],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await accessibility(page);
    await noOverflow(page);
  }
});

test("score confirmation cancels safely, advances the bracket and exposes real organization/admin views", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const owner = await signedIn(page);
  const suffix = randomBytes(4).toString("hex");
  const opponent = await db.user.create({
    data: { username: `opp_${suffix}`, email: `opp_${suffix}@test.invalid`, role: "PLAYER" },
  });
  const a = await db.team.create({
    data: { name: "UI Fixture — Signal", game: "valorant", captainId: owner },
  });
  const b = await db.team.create({
    data: { name: "UI Fixture — Summit", game: "valorant", captainId: opponent.id },
  });
  const event = await db.tournament.create({
    data: {
      name: "UI Fixture — Final",
      game: "valorant",
      description: "An isolated browser fixture.",
      rules: "Single elimination fixture rules.",
      teamSize: 1,
      maxTeams: 2,
      opensAt: new Date("2030-01-01"),
      closesAt: new Date("2030-01-02"),
      startsAt: new Date("2030-01-03"),
      phase: "ONGOING",
      organizerId: owner,
      matches: { create: { round: 1, position: 0, teamAId: a.id, teamBId: b.id } },
    },
  });
  await page.goto(`/organizer/tournaments/${event.id}?tab=Matches`);
  await page.locator(".mvp-match-editor > summary").click();
  await page.getByLabel(a.name, { exact: true }).fill("2");
  await page.getByLabel(b.name, { exact: true }).fill("1");
  const save = page.getByRole("button", { name: "SAVE RESULT & ADVANCE" });
  await save.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "CANCEL", exact: true })).toBeFocused();
  await accessibility(page);
  await page.keyboard.press("Escape");
  await expect(save).toBeFocused();
  expect((await db.match.findFirstOrThrow({ where: { tournamentId: event.id } })).status).toBe(
    "PENDING",
  );
  await save.click();
  await page.getByRole("button", { name: "SAVE & ADVANCE", exact: true }).click();
  await expect(page.getByText(/All matches are complete/)).toBeVisible();
  await page.getByRole("tab", { name: "Bracket", exact: true }).click();
  await expect(page.getByRole("button", { name: `${a.name}, winner` })).toBeVisible();
  await accessibility(page);
  await noOverflow(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("completed-bracket.png"), fullPage: true });
  const org = await db.organization.create({
    data: {
      name: "UI Fixture — Organization",
      ownerId: owner,
      members: { create: { userId: owner, role: "OWNER" } },
    },
  });
  await db.user.update({ where: { id: owner }, data: { platformRole: "ADMIN" } });
  await page.goto("/organizations");
  await page.getByRole("link", { name: /UI Fixture — Organization/ }).click();
  await expect(page).toHaveURL(new RegExp(org.id));
  await accessibility(page);
  await noOverflow(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("organization.png"), fullPage: true });
  const staffHeaders = { Origin: "http://localhost:4175", "X-MatchFlow": "1" };
  const factor = await page.request.post("/api/account/staff-factor/enroll", {
    headers: staffHeaders,
    data: {},
  });
  expect(factor.status()).toBe(200);
  const activation = await page.request.post("/api/account/staff-factor/activate", {
    headers: staffHeaders,
    data: { otp: new TOTP({ secret: (await factor.json()).secret }).generate() },
  });
  expect(activation.status()).toBe(200);
  await page.goto("/administration");
  await expect(page.getByRole("table")).toBeVisible();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("administration.png"), fullPage: true });
  await accessibility(page);
  await noOverflow(page);
});

test("team creation and confirmed member removal work without losing keyboard focus", async ({
  page,
}, info) => {
  test.setTimeout(45000);
  await signedIn(page);
  await page.goto("/teams/new");
  await page.getByLabel("Team name", { exact: true }).fill("UI Fixture — New Team");
  await page.getByRole("button", { name: "CREATE TEAM", exact: true }).click();
  await expect(page).toHaveURL(/teams\/c[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const suffix = randomBytes(4).toString("hex");
  const member = await db.user.create({
    data: { username: `mate_${suffix}`, email: `mate_${suffix}@test.invalid`, role: "PLAYER" },
  });
  await db.teamMember.create({ data: { userId: member.id, teamId: id } });
  await page.reload();
  const remove = page.getByRole("button", { name: `Remove ${member.username}`, exact: true });
  await remove.click();
  await expect(page.getByRole("dialog", { name: "Remove this teammate?" })).toBeVisible();
  await accessibility(page);
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  await remove.click();
  await page.getByRole("button", { name: "REMOVE MEMBER", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await accessibility(page);
  await noOverflow(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path: info.outputPath("team.png"), fullPage: true });
});
