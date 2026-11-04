import { test, expect } from "@playwright/test";
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
test("private draft wizard, real publication, sharing, announcement and responsive organizer tools", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const suffix = randomBytes(5).toString("hex");
  const registered = await page.request.post("/api/auth/register", {
    headers: { "X-MatchFlow": "1", Origin: "http://localhost:4175" },
    data: {
      username: `phase5_${suffix}`,
      email: `phase5_${suffix}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(registered.status()).toBe(201);
  const { user } = await registered.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await page.goto("/organizer/tournaments/new");
  await page.getByLabel("Tournament name", { exact: true }).fill("Signal Swiss Private");
  await page.getByLabel("Game", { exact: true }).selectOption("valorant");
  await page.getByLabel("Players per team", { exact: true }).fill("1");
  await page.getByLabel("Format", { exact: true }).selectOption("SWISS");
  await page.getByLabel("Competition", { exact: true }).selectOption("INDIVIDUAL");
  await page.getByLabel("Visibility", { exact: true }).selectOption("PRIVATE");
  await page.getByLabel("Enable waitlist", { exact: false }).check();
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByLabel("Registration opens", { exact: true }).fill("2030-01-01T10:00");
  await page.getByLabel("Registration closes", { exact: true }).fill("2030-01-02T10:00");
  await page.getByLabel("Tournament start", { exact: true }).fill("2030-01-03T10:00");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Private individual Swiss tournament.");
  await page
    .getByLabel("Rules", { exact: true })
    .fill("KDA totals and duration determine tie-breaks.");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByLabel("Save as draft instead of publishing").check();
  await page.getByRole("button", { name: "PUBLISH TOURNAMENT", exact: true }).click();
  await expect(page).toHaveURL(/organizer\/tournaments\/c[a-z0-9]+$/);
  await expect(page.getByRole("button", { name: "PUBLISH EVENT", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PUBLISH EVENT", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "CREATE / ROTATE SHARE LINK", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "CREATE / ROTATE SHARE LINK", exact: true }).click();
  await page.getByRole("button", { name: "CREATE LINK", exact: true }).click();
  await expect(page.getByLabel("Secret event link", { exact: true })).toHaveValue(
    /#access=[a-f0-9]{64}$/,
  );
  const link = await page.getByLabel("Secret event link", { exact: true }).inputValue();
  await page.getByText("Publish an announcement", { exact: true }).click();
  await page.getByLabel("Announcement title", { exact: true }).fill("Check your roster");
  await page
    .getByLabel("Announcement message", { exact: true })
    .fill("Please review your entry before registration closes.");
  await page.getByRole("button", { name: "PUBLISH ANNOUNCEMENT", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your roster", exact: true })).toBeVisible();
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
  // Never capture the secret share link in a screenshot artifact.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Event operations", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("phase5-organizer.png"), fullPage: true });
  const browser = page.context().browser()!;
  const guest = await browser.newContext({ viewport: page.viewportSize()! });
  const guestPage = await guest.newPage();
  await guestPage.goto(link.split("#")[0]);
  await expect(guestPage.getByText("Tournament not found.", { exact: true })).toBeVisible();
  await guestPage.goto(link);
  await expect(
    guestPage.getByRole("heading", { name: "Signal Swiss Private.", exact: true }),
  ).toBeVisible();
  expect(new URL(guestPage.url()).hash).toBe("");
  await guest.close();
});

test("individual entry, waitlist withdrawal and check-in use real server state", async ({
  page,
}) => {
  const suffix = randomBytes(5).toString("hex");
  const signed = await page.request.post("/api/auth/register", {
    headers: { "X-MatchFlow": "1", Origin: "http://localhost:4175" },
    data: {
      username: `entry_${suffix}`,
      email: `entry_${suffix}@test.invalid`,
      password: randomBytes(24).toString("hex"),
    },
  });
  expect(signed.status()).toBe(201);
  const { user } = await signed.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  const event = await db.tournament.create({
    data: {
      name: "Individual entry fixture",
      game: "valorant",
      description: "Real browser entry workflow.",
      rules: "Check in before tournament start.",
      teamSize: 1,
      maxTeams: 2,
      competitionType: "INDIVIDUAL",
      organizerId: user.id,
      waitlistEnabled: true,
      checkInRequired: true,
      opensAt: new Date(Date.now() - 60000),
      closesAt: new Date(Date.now() + 3600000),
      startsAt: new Date(Date.now() + 7200000),
    },
  });
  for (let i = 0; i < 2; i++) {
    const reserved = await db.user.create({
      data: {
        username: `reserved_${suffix}_${i}`,
        email: `reserved_${suffix}_${i}@test.invalid`,
        passwordHash: null,
        role: "PLAYER",
      },
    });
    const team = await db.team.create({
      data: {
        name: `Reserved ${suffix} ${i}`,
        game: "valorant",
        captainId: reserved.id,
        competitionType: "INDIVIDUAL",
        individualUserId: reserved.id,
      },
    });
    await db.tournamentRegistration.create({
      data: {
        tournamentId: event.id,
        teamId: team.id,
        roster: [{ id: reserved.id, username: reserved.username }],
        status: "APPROVED",
      },
    });
  }
  await page.goto(`/tournaments/${event.id}`);
  await page.getByRole("button", { name: "REGISTER AS A PLAYER", exact: true }).click();
  await expect(
    page.getByText(
      "Waitlisted. Eligible entries move to review in arrival order when space opens.",
      { exact: true },
    ),
  ).toBeVisible();
  const entry = await db.tournamentRegistration.findFirstOrThrow({
    where: { tournamentId: event.id, status: "WAITLISTED" },
  });
  expect((entry.roster as { id: string }[])[0].id).toBe(user.id);
  await page.getByRole("button", { name: "WITHDRAW ENTRY", exact: true }).click();
  await page.getByRole("button", { name: "WITHDRAW", exact: true }).click();
  await expect(page.getByText("Entry withdrawn.", { exact: true })).toBeVisible();
  await db.tournamentRegistration.deleteMany({
    where: { tournamentId: event.id, status: "APPROVED" },
  });
  await page.getByRole("button", { name: "REGISTER AS A PLAYER", exact: true }).click();
  await expect(
    page.getByText("Your roster was submitted. Waiting for organizer approval.", { exact: true }),
  ).toBeVisible();
  await db.tournamentRegistration.update({ where: { id: entry.id }, data: { status: "APPROVED" } });
  await db.tournament.update({
    where: { id: event.id },
    data: { phase: "CHECK_IN", closesAt: new Date(Date.now() - 1000) },
  });
  await page.reload();
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByRole("button", { name: "CHECKED IN", exact: true })).toBeDisabled();
  expect(
    (await db.tournamentRegistration.findUniqueOrThrow({ where: { id: entry.id } })).checkedInAt,
  ).not.toBeNull();
});
