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
const headers = { Origin: "http://localhost:4175", "X-MatchFlow": "1" };
async function signIn(page: Page) {
  const tag = randomBytes(5).toString("hex");
  const response = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `org_ui_${tag}`,
      email: `org_ui_${tag}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return user;
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    outside: Array.from(document.querySelectorAll("main *"))
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        className: el.className,
        right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width,
      })),
  }));
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width + 1);
}
test("organization creation, real analytics, branding settings and public profile preserve responsive design", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto("/organizations");
  await page.getByLabel("Organization name", { exact: true }).fill("Valley Esports Club");
  await page
    .getByLabel("About your organization")
    .fill("Community competition, coordinated together.");
  await page.getByLabel("Organization region").fill("Nepal");
  await page.getByLabel("Publish organization profile and public tournament history").check();
  await page.getByRole("button", { name: "CREATE ORGANIZATION", exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/c[a-z0-9]+$/);
  const id = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Workspace overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No eligible data", { exact: true })).toHaveCount(2);
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase8-workspace.png"), fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "EXPORT ANALYTICS CSV" }).click();
  expect((await download).suggestedFilename()).toBe("matchflow-organization.csv");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("About your organization")
    .fill("Our school and community competition workspace.");
  await page.getByRole("button", { name: "SAVE ORGANIZATION", exact: true }).click();
  await expect(page.getByText("Organization settings saved.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "PUBLIC PROFILE ↗" }).click();
  await expect(page).toHaveURL(new RegExp(`/communities/${id}`));
  await expect(
    page.getByRole("heading", { name: "No published tournaments yet", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "Our school and community competition workspace." }),
  ).toBeVisible();
  await accessible(page);
  await page.goto(`/organizations/${id}`);
  await page.getByRole("link", { name: "CREATE ORGANIZATION TOURNAMENT", exact: true }).click();
  await expect(page.getByLabel("Organizing workspace")).toHaveValue(id);
});
test("staff accept invitations, receive explicit assignments and lose private access on removal", async ({
  page,
  browser,
}, info) => {
  const owner = await signIn(page);
  const context = await browser.newContext({
    baseURL: "http://localhost:4175",
    viewport: page.viewportSize()!,
    reducedMotion: "reduce",
  });
  const staffPage = await context.newPage();
  const staff = await signIn(staffPage);
  try {
    const created = await page.request.post("/api/organizations", {
      headers,
      data: {
        name: "Nightfall Operators",
        description: "Collaborative test organization",
        region: "Nepal",
        website: "",
        publicProfile: false,
      },
    });
    expect(created.status()).toBe(201);
    const org = await created.json();
    const event = await db.tournament.create({
      data: {
        organizationId: org.id,
        organizerId: owner.id,
        name: "Private organization cup",
        game: "valorant",
        description: "Private staff collaboration fixture",
        rules: "Organizer confirms results",
        teamSize: 1,
        maxTeams: 4,
        visibility: "PRIVATE",
        opensAt: new Date("2030-01-01"),
        closesAt: new Date("2030-01-02"),
        startsAt: new Date("2030-01-03"),
      },
    });
    await page.goto(`/organizations/${org.id}`);
    await page.getByRole("tab", { name: "People", exact: true }).click();
    await page.getByLabel("Username or email").fill(staff.username);
    await page.getByLabel("Invitation role", { exact: true }).selectOption("MEMBER");
    await page.getByRole("button", { name: "SEND INVITATION", exact: true }).click();
    await expect(
      page
        .getByRole("table", { name: "Invitations · latest 100" })
        .getByRole("cell", { name: staff.username, exact: true }),
    ).toBeVisible();
    expect(
      await db.organizationMember.count({ where: { organizationId: org.id, userId: staff.id } }),
    ).toBe(0);
    await staffPage.goto("/organizations");
    await staffPage
      .getByRole("button", { name: "ACCEPT Nightfall Operators", exact: true })
      .click();
    await staffPage.getByRole("link", { name: /Nightfall Operators/ }).click();
    await expect(
      staffPage.getByRole("heading", { name: "No event assignments", exact: true }),
    ).toBeVisible();
    await page.goto(`/organizations/${org.id}`);
    await page.getByRole("tab", { name: "People", exact: true }).click();
    await page.getByLabel("Tournament assignment", { exact: true }).selectOption(event.id);
    await page.getByLabel("Staff member", { exact: true }).selectOption(staff.id);
    await page.getByRole("button", { name: "SAVE ASSIGNMENT", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await db.tournamentPermission.findUnique({
              where: { tournamentId_userId: { tournamentId: event.id, userId: staff.id } },
            })
          )?.canManage,
      )
      .toBe(true);
    await staffPage.goto(`/organizer/tournaments/${event.id}`);
    await expect(
      staffPage.getByRole("heading", { name: "Private organization cup.", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("phase8-staff.png"), fullPage: true });
    await accessible(page);
    await page.getByRole("button", { name: `REMOVE ${staff.username}`, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "REMOVE ACCESS", exact: true })
      .click();
    await expect
      .poll(async () =>
        db.organizationMember.count({ where: { organizationId: org.id, userId: staff.id } }),
      )
      .toBe(0);
    expect((await staffPage.request.get(`/api/tournaments/${event.id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
});
