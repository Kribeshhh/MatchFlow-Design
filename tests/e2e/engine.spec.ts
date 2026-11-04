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
async function account(page: Page) {
  const tag = randomBytes(5).toString("hex");
  const response = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `engine_ui_${tag}`,
      email: `engine_ui_${tag}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return user.id as string;
}
async function entrants(eventId: string, n: number) {
  const tag = randomBytes(5).toString("hex");
  for (let i = 0; i < n; i++) {
    const p = await db.user.create({
      data: {
        role: "PLAYER",
        username: `engine_p_${tag}_${i}`,
        email: `engine_p_${tag}_${i}@test.invalid`,
      },
    });
    const team = await db.team.create({
      data: { name: `Engine team ${i + 1}`, game: "valorant", captainId: p.id },
    });
    await db.tournamentRegistration.create({
      data: {
        tournamentId: eventId,
        teamId: team.id,
        status: "APPROVED",
        roster: [{ id: p.id, username: p.username }],
      },
    });
  }
}
async function a11y(page: Page) {
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
test("native battle wizard, manual seeding, lobby confirmation and responsive standings", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await account(page);
  await page.goto("/organizer/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill("Battle points browser event");
  await page.getByLabel("Game", { exact: true }).selectOption("pubg");
  await page.getByLabel("Players per team", { exact: true }).fill("1");
  await page.getByLabel("Maximum teams", { exact: true }).fill("2");
  await page.getByLabel("Format", { exact: true }).selectOption("BATTLE_ROYALE");
  await page.getByLabel("Number of lobby rounds", { exact: true }).fill("1");
  await page.getByLabel("Placement points", { exact: true }).fill("10, 5");
  await page.getByLabel("Points per elimination", { exact: true }).fill("1");
  await page
    .getByLabel("Ordered tie-breakers", { exact: true })
    .fill("ELIMINATIONS, LAST_ROUND_PLACEMENT");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByLabel("Registration opens", { exact: true }).fill("2030-01-01T10:00");
  await page.getByLabel("Registration closes", { exact: true }).fill("2030-01-02T10:00");
  await page.getByLabel("Tournament start", { exact: true }).fill("2030-01-03T10:00");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Battle royale browser verification event.");
  await page
    .getByLabel("Rules", { exact: true })
    .fill("Placement points and elimination points determine the champion.");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByRole("button", { name: "PUBLISH TOURNAMENT", exact: true }).click();
  await expect(page).toHaveURL(/organizer\/tournaments\/c[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await entrants(id, 2);
  await page.reload();
  await page.getByRole("tab", { name: "Bracket", exact: true }).click();
  await page.getByLabel("Seeding method").selectOption("MANUAL");
  await page.getByRole("button", { name: "Move Engine team 2 up", exact: true }).click();
  await page.getByRole("button", { name: "GENERATE BRACKET", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "GENERATE BRACKET", exact: true })
    .click();
  await expect(page.getByText(/Lobby 1 · PENDING/)).toBeVisible();
  await page.getByText(/Lobby 1 · PENDING/).click();
  for (const [name, place, kills] of [
    ["Engine team 1", "1", "3"],
    ["Engine team 2", "2", "2"],
  ]) {
    await page.getByLabel(`${name} placement`, { exact: true }).fill(place);
    await page.getByLabel(`${name} eliminations`, { exact: true }).fill(kills);
  }
  await a11y(page);
  await page.getByRole("button", { name: "CONFIRM LOBBY RESULTS", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "CONFIRM LOBBY", exact: true })
    .click();
  await expect(page.getByText("TOURNAMENT CHAMPION", { exact: true })).toBeVisible();
  expect((await db.tournament.findUniqueOrThrow({ where: { id } })).phase).toBe("COMPLETED");
  await a11y(page);
  await page.screenshot({ path: info.outputPath("phase6-battle.png"), fullPage: true });
});
test("correction preview voids dependent results, replay restores champion, bracket zoom is keyboard accessible", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const owner = await account(page);
  const event = await db.tournament.create({
    data: {
      name: "Reviewed correction browser event",
      game: "valorant",
      description: "Reviewed correction workflow fixture.",
      rules: "Played results may only be corrected through review.",
      teamSize: 1,
      maxTeams: 4,
      organizerId: owner,
      opensAt: new Date("2030-01-01"),
      closesAt: new Date("2030-01-02"),
      startsAt: new Date("2030-01-03"),
    },
  });
  await entrants(event.id, 4);
  expect(
    (
      await page.request.post(`/api/tournaments/${event.id}/bracket`, {
        headers,
        data: { seeding: "REGISTRATION" },
      })
    ).ok(),
  ).toBe(true);
  for (let i = 0; i < 3; i++) {
    const match = await db.match.findFirstOrThrow({
      where: {
        tournamentId: event.id,
        status: { not: "COMPLETED" },
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: [{ round: "asc" }, { position: "asc" }],
    });
    expect(
      (
        await page.request.post(`/api/tournaments/${event.id}/matches/${match.id}/result`, {
          headers,
          data: { scoreA: 2, scoreB: 0 },
        })
      ).ok(),
    ).toBe(true);
  }
  const targetMatch = await db.match.findFirstOrThrow({
    where: { tournamentId: event.id, round: 1 },
    include: { teamA: true, teamB: true },
  });
  await page.goto(`/organizer/tournaments/${event.id}?tab=Results`);
  const dispute = page.locator("details").filter({
    has: page.locator("summary").filter({
      hasText: `Dispute / correct · ${targetMatch.teamA!.name} vs ${targetMatch.teamB!.name}`,
    }),
  });
  await dispute.locator("summary").click();
  await dispute
    .getByLabel("Dispute reason", { exact: true })
    .fill("Verified score was entered for the wrong side.");
  await dispute.getByRole("button", { name: "OPEN DISPUTE", exact: true }).click();
  await page.getByRole("button", { name: "PREVIEW CORRECTION", exact: true }).click();
  const preview = page.getByRole("region", { name: "Rollback preview" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/1 dependent completed results/)).toBeVisible();
  await preview.getByLabel(targetMatch.teamA!.name, { exact: true }).fill("0");
  await preview.getByLabel(targetMatch.teamB!.name, { exact: true }).fill("2");
  await preview
    .getByLabel("Correction reason", { exact: true })
    .fill("Organizer reviewed evidence and confirmed the corrected winner.");
  await preview.getByRole("checkbox").check();
  await a11y(page);
  await page.screenshot({ path: info.outputPath("phase6-rollback.png"), fullPage: true });
  await preview.getByRole("button", { name: "APPLY REVIEWED CORRECTION", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "VOID & REPLAY", exact: true })
    .click();
  await expect(page.getByText("CORRECTED ·", { exact: false })).toBeVisible();
  expect(
    (await db.tournament.findUniqueOrThrow({ where: { id: event.id } })).championId,
  ).toBeNull();
  const final = await db.match.findFirstOrThrow({ where: { tournamentId: event.id, round: 2 } });
  expect(final.status).not.toBe("COMPLETED");
  expect(
    (
      await page.request.post(`/api/tournaments/${event.id}/matches/${final.id}/result`, {
        headers,
        data: { scoreA: 2, scoreB: 0 },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/organizer/tournaments/${event.id}?tab=Bracket`);
  await page.getByRole("button", { name: "Zoom in bracket", exact: true }).click();
  await expect(page.getByText("125%", { exact: true })).toBeVisible();
  const viewport = page.getByRole("region", { name: /Tournament bracket/ });
  await viewport.focus();
  await page.keyboard.press("-");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await a11y(page);
  await page.screenshot({ path: info.outputPath("phase6-bracket.png"), fullPage: true });
});

test("league wizard keeps format rules separate and drawn matches produce real points", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await account(page);
  await page.goto("/organizer/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill("League browser season");
  await page.getByLabel("Game", { exact: true }).selectOption("valorant");
  await page.getByLabel("Players per team", { exact: true }).fill("1");
  await page.getByLabel("Format", { exact: true }).selectOption("GROUPS");
  await page.getByLabel("Number of groups", { exact: true }).selectOption("4");
  await page.getByLabel("Format", { exact: true }).selectOption("LEAGUE");
  await expect(page.getByLabel("Number of groups", { exact: true })).toHaveCount(0);
  await page.getByLabel("League cycles", { exact: true }).selectOption("2");
  await page.getByLabel("Allow drawn league matches", { exact: false }).check();
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByLabel("Registration opens", { exact: true }).fill("2030-01-01T10:00");
  await page.getByLabel("Registration closes", { exact: true }).fill("2030-01-02T10:00");
  await page.getByLabel("Tournament start", { exact: true }).fill("2030-01-03T10:00");
  await page
    .getByLabel("Description", { exact: true })
    .fill("League season with configured drawn games.");
  await page.getByLabel("Rules", { exact: true }).fill("Three points for a win, one for a draw.");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByRole("button", { name: "PUBLISH TOURNAMENT", exact: true }).click();
  await expect(page).toHaveURL(/organizer\/tournaments\/c[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await entrants(id, 2);
  expect(
    (await page.request.post(`/api/tournaments/${id}/bracket`, { headers, data: {} })).ok(),
  ).toBe(true);
  await page.goto(`/organizer/tournaments/${id}?tab=Matches`);
  const editor = page.locator(".mvp-match-editor").first();
  await editor.locator("summary").click();
  await editor.getByLabel("Result type", { exact: true }).selectOption("DRAW");
  await editor.getByLabel("Engine team 1", { exact: true }).fill("1");
  await editor.getByLabel("Engine team 2", { exact: true }).fill("1");
  for (const metric of ["kills", "deaths", "assists"])
    for (const team of ["Engine team 1", "Engine team 2"])
      await editor.getByLabel(`${metric} · ${team}`, { exact: true }).fill("10");
  await editor.getByLabel("Total match duration (seconds)", { exact: true }).fill("600");
  await editor.getByRole("button", { name: "SAVE RESULT & ADVANCE", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE & ADVANCE", exact: true })
    .click();
  await expect
    .poll(() =>
      db.match.count({ where: { tournamentId: id, outcome: "DRAW", status: "COMPLETED" } }),
    )
    .toBe(1);
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible();
  await expect(page.getByText(/Configured league points → score difference/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Draws", exact: true })).toBeVisible();
  const record = page
    .getByRole("region", { name: "Standings table" })
    .getByRole("row")
    .filter({ hasText: "Engine team 1" });
  await expect(record.locator("td").nth(1)).toHaveText("1");
  await expect(record.locator("td").nth(2)).toHaveText("1");
  await a11y(page);
  await page.screenshot({ path: info.outputPath("phase6-league.png"), fullPage: true });
});
