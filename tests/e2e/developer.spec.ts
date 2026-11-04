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
const headers = { Origin: "http://localhost:4175", "X-MatchFlow": "1" };
test("developer workspace creates scoped credentials, revokes them and preserves responsive accessibility", async ({
  page,
}, info) => {
  const tag = randomBytes(5).toString("hex");
  const registered = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `api_ui_${tag}`,
      email: `api_ui_${tag}@test.invalid`,
      password: randomBytes(24).toString("hex"),
      role: "ORGANIZER",
    },
  });
  expect(registered.status()).toBe(201);
  const { user } = await registered.json();
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  const organization = await page.request.post("/api/organizations", {
    headers,
    data: {
      name: "MatchFlow Integration Lab",
      description: "Connected tournament operations",
      region: "Nepal",
      website: "",
      publicProfile: false,
    },
  });
  expect(organization.status()).toBe(201);
  const org = await organization.json();
  const event = await db.tournament.create({
    data: {
      organizationId: org.id,
      organizerId: user.id,
      name: "Developer Championship",
      game: "valorant",
      description: "Integration fixture",
      rules: "Confirmed results",
      teamSize: 1,
      maxTeams: 4,
      visibility: "PRIVATE",
      opensAt: new Date("2030-01-01"),
      closesAt: new Date("2030-01-02"),
      startsAt: new Date("2030-01-03"),
    },
  });
  await page.goto(`/organizations/${org.id}`);
  await page.getByRole("tab", { name: "Developers", exact: true }).click();
  await page.getByLabel("Integration name", { exact: true }).fill("Club website");
  await page.getByLabel("Developer Championship", { exact: true }).check();
  await page.getByRole("button", { name: "CREATE INTEGRATION", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Club website", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "GENERATE CREDENTIAL Club website", exact: true }).click();
  const box = page.getByRole("region", { name: "New secret" });
  await expect(box).toBeVisible();
  const secret = await box.locator("code").innerText();
  expect(secret).toMatch(/^mf_live_[a-f0-9]{64}$/);
  const read = await page.request.get(`/api/v1/tournaments/${event.id}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(read.status()).toBe(200);
  await page.getByRole("button", { name: "I HAVE SAVED IT", exact: true }).click();
  await expect(box).toHaveCount(0);
  await page
    .getByRole("button", { name: "VIEW USAGE AND DELIVERIES Club website", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "API access log", exact: true })).toBeVisible();
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
  await page.screenshot({ path: info.outputPath("phase9-developers.png"), fullPage: true });
  await page.getByRole("button", { name: /^REVOKE mf_live_/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "CONFIRM", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  expect(
    (
      await page.request.get(`/api/v1/tournaments/${event.id}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
    ).status(),
  ).toBe(401);
});
test("interactive API documentation executes real public reads", async ({ page }, info) => {
  await page.goto("/developers");
  await page.getByRole("button", { name: "SEND READ REQUEST", exact: true }).click();
  await expect(page.getByLabel("API response")).toContainText('"data"');
  expect((await page.request.get("/api/v1/openapi.json")).status()).toBe(200);
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
  await page.screenshot({ path: info.outputPath("phase9-api-docs.png"), fullPage: true });
});
