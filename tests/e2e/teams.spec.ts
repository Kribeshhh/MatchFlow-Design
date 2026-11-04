import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Disposable local database required");
const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
async function signIn(page: Page) {
  const username = `roster_${randomBytes(5).toString("hex")}`;
  const r = await page.request.post("/api/auth/register", {
    headers: { "X-MatchFlow": "1", Origin: "http://localhost:4175" },
    data: {
      username,
      email: `${username}@test.invalid`,
      password: randomBytes(24).toString("hex"),
    },
  });
  expect(r.status()).toBe(201);
  const { user } = await r.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return user;
}
test("players accept invitations before joining, then accept captain ownership", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60000);
  await signIn(page);
  const otherContext = await browser.newContext({
    baseURL: "http://localhost:4175",
    viewport: page.viewportSize(),
    reducedMotion: "reduce",
  });
  const other = await otherContext.newPage();
  try {
    const player = await signIn(other);
    await page.goto("/teams/new");
    await page.getByLabel("Team name", { exact: true }).fill("Consent crew");
    await page.getByRole("button", { name: "CREATE TEAM", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/c[a-z0-9]+$/);
    const teamUrl = page.url();
    const teamId = teamUrl.split("/").pop();
    const headers = { "X-MatchFlow": "1", Origin: "http://localhost:4175" };
    const eventResponse = await page.request.post("/api/tournaments", {
      headers,
      data: {
        name: "Roster review cup",
        game: "pubg",
        description: "A test tournament for explicit roster review.",
        rules: "Roster amendments require organizer approval before close.",
        teamSize: 1,
        maxTeams: 2,
        opensAt: new Date(Date.now() - 60000).toISOString(),
        closesAt: new Date(Date.now() + 600000).toISOString(),
        startsAt: new Date(Date.now() + 1200000).toISOString(),
      },
    });
    expect(eventResponse.status()).toBe(201);
    const event = await eventResponse.json();
    const regResponse = await page.request.post(`/api/tournaments/${event.id}/registrations`, {
      headers,
      data: { teamId },
    });
    expect(regResponse.status()).toBe(201);
    const entry = await regResponse.json();
    expect(
      (
        await page.request.patch(`/api/tournaments/${event.id}/registrations/${entry.id}`, {
          headers,
          data: { status: "APPROVED" },
        })
      ).status(),
    ).toBe(200);
    await page.getByLabel("Search players by username").fill(player.username);
    await page.getByRole("button", { name: "SEARCH", exact: true }).click();
    await page.getByRole("button", { name: "INVITE", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
    await other.goto("/teams");
    await other.getByRole("button", { name: "ACCEPT INVITATION", exact: true }).click();
    await expect(other.getByRole("link", { name: /Consent crew/ })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "OFFER CAPTAIN TRANSFER" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "OFFER TRANSFER", exact: true })
      .click();
    await other.goto(teamUrl);
    await other.getByRole("button", { name: "ACCEPT CAPTAIN OWNERSHIP", exact: true }).click();
    await expect(other.getByRole("button", { name: "ARCHIVE TEAM", exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page: other })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await other.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await other.screenshot({ path: testInfo.outputPath("team-management.png"), fullPage: true });
    expect(
      (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).roster,
    ).toEqual(entry.roster);
    await other.getByRole("button", { name: "MAKE SUBSTITUTE", exact: true }).click();
    await other.goto(`/tournaments/${event.id}`);
    await other.getByRole("button", { name: "REQUEST ROSTER CHANGE", exact: true }).click();
    await other
      .getByRole("dialog")
      .getByRole("button", { name: "REQUEST CHANGE", exact: true })
      .click();
    await expect(other.getByText(/Proposed roster:/)).toBeVisible();
    await page.goto(`/organizer/tournaments/${event.id}`);
    await page.getByRole("tab", { name: "Registrations", exact: true }).click();
    await page.getByRole("button", { name: "APPROVE ROSTER CHANGE", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "APPROVE CHANGE", exact: true })
      .click();
    await expect(page.getByText(/Proposed roster:/)).toHaveCount(0);
    expect(
      (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).roster,
    ).toEqual([{ id: player.id, username: player.username }]);
    await page.goto(teamUrl);
    await expect(page.getByRole("button", { name: "LEAVE TEAM", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ARCHIVE TEAM", exact: true })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("player profile settings publish safe basics and enforce private history", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const user = await signIn(page);
  await page.goto("/account");
  await page.getByLabel("Display name", { exact: true }).fill("Mountain player");
  await page.getByLabel("Region", { exact: true }).fill("Nepal");
  await page.getByRole("checkbox", { name: "Valorant", exact: true }).check();
  await page.getByLabel("Public social links", { exact: true }).fill("https://example.com/player");
  await page.getByRole("checkbox", { name: "Show tournament history and statistics" }).uncheck();
  await page.getByRole("checkbox", { name: "Show team memberships" }).uncheck();
  await page.getByRole("button", { name: "SAVE PROFILE", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Uploads are unavailable until S3 storage is configured."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.goto(`/players/${user.username}`);
  await expect(page.getByRole("heading", { name: /Mountain player/ })).toBeVisible();
  await expect(page.getByText("Team memberships are private.")).toBeVisible();
  await expect(
    page.getByText(/This player’s tournament history and statistics are private/),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("player-profile.png"), fullPage: true });
});
