import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Local test database required");
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
const headers = { "X-MatchFlow": "1", Origin: "http://localhost:4175" };
async function signIn(page: Page) {
  const tag = randomBytes(5).toString("hex");
  const response = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `live_ui_${tag}`,
      email: `live_ui_${tag}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return user;
}
async function fixture(ownerId: string) {
  const event = await db.tournament.create({
    data: {
      name: "Real-time browser cup",
      description: "Shared live tournament browser fixture.",
      rules: "Only confirmed results advance participants.",
      game: "valorant",
      teamSize: 1,
      maxTeams: 2,
      organizerId: ownerId,
      opensAt: new Date("2030-01-01"),
      closesAt: new Date("2030-01-02"),
      startsAt: new Date("2030-01-03"),
    },
  });
  for (let i = 0; i < 2; i++) {
    const tag = randomBytes(4).toString("hex");
    const p = await db.user.create({
      data: {
        username: `live_player_${tag}`,
        email: `live_player_${tag}@test.invalid`,
        role: "PLAYER",
      },
    });
    const t = await db.team.create({
      data: { name: `Live team ${i + 1}`, game: "valorant", captainId: p.id },
    });
    await db.tournamentRegistration.create({
      data: {
        tournamentId: event.id,
        teamId: t.id,
        status: "APPROVED",
        roster: [{ id: p.id, username: p.username }],
      },
    });
  }
  return event;
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}
test("two viewers receive provisional scores, confirmation and reconnect recovery without refreshing", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const host = await signIn(page),
    event = await fixture(host.id);
  expect(
    (await page.request.post(`/api/tournaments/${event.id}/bracket`, { headers, data: {} })).ok(),
  ).toBe(true);
  const viewer = await browser.newContext({
    baseURL: "http://localhost:4175",
    viewport: page.viewportSize()!,
    reducedMotion: "reduce",
  });
  const second = await viewer.newPage();
  await signIn(second);
  try {
    await page.goto(`/organizer/tournaments/${event.id}?tab=Matches`);
    await second.goto(`/tournaments/${event.id}?tab=Bracket`);
    await expect(
      second.getByRole("status").filter({ hasText: "Live updates connected" }),
    ).toBeVisible();
    await page.locator(".mvp-match-editor > summary").click();
    await page.getByLabel("Live score · Live team 1", { exact: true }).fill("1");
    await page.getByLabel("Live score · Live team 2", { exact: true }).fill("0");
    const beforeEdit = await db.match.findFirstOrThrow({ where: { tournamentId: event.id } });
    expect(
      (
        await page.request.patch(
          `/api/tournaments/${event.id}/matches/${beforeEdit.id}/live-score`,
          {
            headers,
            data: { scoreA: 0, scoreB: 1, expectedVersion: beforeEdit.version },
          },
        )
      ).ok(),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "LOAD LATEST SCORES", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "PUBLISH LIVE SCORE", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "LOAD LATEST SCORES", exact: true }).click();
    await expect(page.getByLabel("Live score · Live team 2", { exact: true })).toHaveValue("1");
    await page.getByLabel("Live score · Live team 1", { exact: true }).fill("1");
    await page.getByLabel("Live score · Live team 2", { exact: true }).fill("0");
    const published = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/matches/${beforeEdit.id}/live-score`) &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "PUBLISH LIVE SCORE", exact: true }).click();
    expect((await published).ok()).toBe(true);
    await expect(second.getByText("LIVE · PROVISIONAL", { exact: true })).toBeVisible();
    expect(await db.matchResult.count({ where: { match: { tournamentId: event.id } } })).toBe(0);
    await viewer.setOffline(true);
    const match = await db.match.findFirstOrThrow({ where: { tournamentId: event.id } });
    expect(
      (
        await page.request.post(`/api/tournaments/${event.id}/matches/${match.id}/result`, {
          headers,
          data: { scoreA: 2, scoreB: 0, expectedVersion: match.version },
        })
      ).ok(),
    ).toBe(true);
    await viewer.setOffline(false);
    await expect(second.getByText("TOURNAMENT CHAMPION", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(second.getByText("LIVE · PROVISIONAL", { exact: true })).toHaveCount(0);
    await accessible(second);
    await second.screenshot({ path: info.outputPath("phase7-live-bracket.png"), fullPage: true });
  } finally {
    await viewer.close();
  }
});
test("notification inbox receives announcements, unread updates and persisted preferences", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const host = await signIn(page),
    event = await fixture(host.id);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Stay in the loop.", exact: true })).toBeVisible();
  expect(
    (
      await page.request.post(`/api/tournaments/${event.id}/announcements`, {
        headers,
        data: {
          title: "Server is ready",
          body: "Join your assigned match server at the scheduled time.",
        },
      })
    ).ok(),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Tournament announcement", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: /Notifications, .* unread/ })).toBeVisible();
  await page.getByRole("button", { name: "MARK ALL READ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "0 unread", exact: true })).toBeVisible();
  await page.getByText("Notification preferences", { exact: true }).click();
  await page.getByLabel("Important tournament emails", { exact: true }).uncheck();
  await page.getByRole("button", { name: "SAVE PREFERENCES", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.notificationPreference.findUniqueOrThrow({ where: { userId: host.id } })).email,
    )
    .toBe(false);
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase7-notifications.png"), fullPage: true });
});
