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
async function setup(page: Page) {
  const tag = randomBytes(5).toString("hex");
  const r = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `portal_ui_${tag}`,
      email: `portal_ui_${tag}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(r.status()).toBe(201);
  const { user } = await r.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  const org = await db.organization.create({
    data: {
      name: "Kathmandu Arena",
      ownerId: user.id,
      description: "Competition belongs to the community.",
    },
  });
  const event = await db.tournament.create({
    data: {
      organizationId: org.id,
      organizerId: user.id,
      name: "Valley Invitational",
      description: "A focused championship for local competitors.",
      rules: "Play fairly. Results are confirmed by organizers.",
      game: "valorant",
      teamSize: 1,
      maxTeams: 4,
      opensAt: new Date("2030-01-01"),
      closesAt: new Date("2030-01-02"),
      startsAt: new Date("2030-01-03"),
    },
  });
  return { org, event, tag };
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
test("owners publish a branded portal and reserve a domain without simulated TLS", async ({
  page,
}, info) => {
  const f = await setup(page);
  await page.goto(`/organizations/${f.org.id}`);
  await page.getByRole("tab", { name: "Portal", exact: true }).click();
  await page.getByLabel("Portal address slug").fill(`arena-${f.tag}`);
  await page.getByLabel("Portal headline", { exact: true }).fill("Your city. Your arena.");
  await page
    .getByLabel("Portal introduction")
    .fill("Discover our competitions, follow the bracket, and celebrate every result.");
  await page.getByLabel("Publish portal", { exact: true }).check();
  await page.getByRole("button", { name: "SAVE PORTAL", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "PUBLISH PORTAL", exact: true })
    .click();
  await expect(page.getByText("Portal settings saved.")).toBeVisible();
  await page.getByLabel("Custom hostname", { exact: true }).fill(`arena-${f.tag}.example.org`);
  await page.getByRole("button", { name: "CONNECT DOMAIN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `arena-${f.tag}.example.org`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "CHECK DNS AND TLS", exact: true })).toBeDisabled();
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase10-portal-settings.png"), fullPage: true });
  await page.getByRole("link", { name: "VIEW PUBLIC PORTAL ↗", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your city. Your arena" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Valley Invitational", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Powered by MatchFlow ↗" })).toHaveAttribute(
    "href",
    "http://localhost:4175",
  );
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase10-portal.png"), fullPage: true });
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Valley Invitational", exact: true }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "About this tournament", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PARTICIPATE ON MATCHFLOW ↗" })).toHaveAttribute(
    "href",
    `http://localhost:4175/tournaments/${f.event.id}`,
  );
  await page.getByRole("link", { name: "BRACKET", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tournament bracket", exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page.getByRole("link", { name: "RESULTS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirmed results", exact: true })).toBeVisible();
  await accessible(page);
});
test("public portal search excludes private events and account links ignore attacker redirect parameters", async ({
  page,
}) => {
  const f = await setup(page),
    slug = `public-${f.tag}`;
  await db.portal.create({
    data: {
      organizationId: f.org.id,
      slug,
      enabled: true,
      title: "Arena competition",
      intro: "Community esports",
      navigation: [],
      accent: "#D3F45D",
    },
  });
  await db.tournament.update({ where: { id: f.event.id }, data: { visibility: "PRIVATE" } });
  await page.goto(`/portals/${slug}?returnTo=https://attacker.example`);
  await expect(page.getByText("No published tournaments match this view.")).toBeVisible();
  await expect(page.getByRole("link", { name: "SIGN IN ON MATCHFLOW ↗" })).toHaveAttribute(
    "href",
    "http://localhost:4175/login",
  );
  await page.goto(`/portals/${slug}/tournaments/${f.event.id}`);
  await expect(page.getByRole("alert")).toHaveText("Tournament not found.");
});
