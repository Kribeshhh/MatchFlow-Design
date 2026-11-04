import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { TOTP } from "otpauth";
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Disposable local test database required");
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
const headers = { Origin: "http://localhost:4175", "X-MatchFlow": "1" };
async function user(page: Page, staff = false) {
  const tag = randomBytes(6).toString("hex"),
    password = randomBytes(24).toString("hex");
  const r = await page.request.post("/api/auth/register", {
    headers,
    data: {
      username: `modui_${tag}`,
      email: `modui_${tag}@test.invalid`,
      password,
      role: "ORGANIZER",
    },
  });
  expect(r.status()).toBe(201);
  const { user } = await r.json();
  await db.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), platformRole: staff ? "ADMIN" : "NONE" },
  });
  return { ...user, password };
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
test("staff enroll TOTP, review a real report, suspend and restore without reactivating old sessions", async ({
  page,
  browser,
}, info) => {
  const _staff = await user(page, true),
    context = await browser.newContext(),
    player = await context.newPage();
  const target = await user(player);
  const c = await player.request.post("/api/support/cases", {
    headers,
    data: {
      targetType: "USER",
      targetId: target.id,
      category: "ABUSE",
      description: `Review fixture ${target.username} abusive conduct.`,
    },
  });
  expect(c.status()).toBe(201);
  await page.goto("/administration");
  await expect(
    page.getByRole("heading", { name: "Staff authentication", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SET UP AUTHENTICATOR", exact: true }).click();
  const key = await page.locator("code").textContent();
  expect(key).toMatch(/^[A-Z2-7]+$/);
  await page
    .getByLabel("Authenticator or recovery code")
    .fill(new TOTP({ secret: key!.trim() }).generate());
  await page.getByRole("button", { name: "VERIFY STAFF ACCESS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await page.getByRole("button", { name: "I HAVE SAVED MY CODES", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("tab", { name: "Cases", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: `Review fixture ${target.username}` });
  await row.getByRole("button", { name: "REVIEW CASE", exact: true }).click();
  const review = page.getByRole("region", { name: "Case review" });
  await review.getByLabel("Moderation action").selectOption("SUSPEND");
  await review
    .getByLabel("Internal moderation reason")
    .fill("Validated moderation evidence requires temporary suspension.");
  await review
    .getByLabel("Resolution for reporter")
    .fill("We reviewed the report and restricted the account.");
  await review.getByRole("button", { name: "SAVE MODERATION ACTION" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "CONFIRM MODERATION", exact: true })
    .click();
  await expect.poll(async () => (await player.request.get("/api/account")).status()).toBe(401);
  await page.getByLabel("Case status", { exact: true }).selectOption("REVIEWING");
  await page
    .getByRole("row")
    .filter({ hasText: `Review fixture ${target.username}` })
    .getByRole("button", { name: "REVIEW CASE", exact: true })
    .click();
  await expect(
    page.getByText("Validated moderation evidence requires temporary suspension.", {
      exact: false,
    }),
  ).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase11-moderation.png"), fullPage: true });
  await review.getByLabel("Moderation action").selectOption("RESTORE_ACCOUNT");
  await review
    .getByLabel("Internal moderation reason")
    .fill("Appeal reviewed and access can now be restored.");
  await review
    .getByLabel("Resolution for reporter")
    .fill("The account can sign in again following review.");
  await review.getByRole("button", { name: "SAVE MODERATION ACTION" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "CONFIRM MODERATION", exact: true })
    .click();
  await expect
    .poll(async () => (await db.user.findUniqueOrThrow({ where: { id: target.id } })).status)
    .toBe("ACTIVE");
  expect((await player.request.get("/api/account")).status()).toBe(401);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Platform operations" })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase11-operations.png"), fullPage: true });
  await db.user.update({ where: { id: target.id }, data: { profilePublic: false } });
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await page.getByLabel("Search users", { exact: true }).fill(target.username);
  await page.getByRole("button", { name: "SEARCH", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: target.username })
    .getByRole("button", { name: "OPEN CASE", exact: true })
    .click();
  await page
    .getByLabel("Case evidence summary")
    .fill("Verified support requested a follow-up private account review.");
  await page.getByRole("button", { name: "CREATE MODERATION CASE", exact: true }).click();
  await expect(
    page.getByText("Moderation case created. Open the Cases tab to review it."),
  ).toBeVisible();
  await context.close();
});
test("players submit support requests, see only their cases and export their account", async ({
  page,
}, info) => {
  const person = await user(page);
  await page.goto("/support");
  await page
    .getByLabel("What happened?")
    .fill("I need help understanding my tournament registration status.");
  await page.getByRole("button", { name: "SUBMIT CASE", exact: true }).click();
  await expect(
    page.getByText("Your case was submitted. You can follow its resolution below."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "SUPPORT · OPEN" })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath("phase11-support.png"), fullPage: true });
  expect((await page.request.get("/api/admin/cases")).status()).toBe(403);
  await page.goto("/account");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD EXPORT PAGE 1", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("matchflow-account-1.json");
  await expect(page.getByText("All export pages downloaded.")).toBeVisible();
  const json = await page.request.get("/api/account/export");
  expect((await json.json()).user.id).toBe(person.id);
});
