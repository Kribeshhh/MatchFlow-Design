import { expect, test } from "@playwright/test";
test("preserved game dialog stays centered and keyboard dismissal restores focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("searchbox", { name: "Search games or tournaments" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search games or tournaments" })).toBeVisible();
  await page.getByRole("button", { name: "PAUSE AMBIENT MOTION", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "RESUME AMBIENT MOTION", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const bubble = page.getByRole("button", { name: "Explore Valorant", exact: true });
  await bubble.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const rect = await dialog.boundingBox();
      const viewport = page.viewportSize()!;
      return rect ? Math.abs(rect.x + rect.width / 2 - viewport.width / 2) : 999;
    })
    .toBeLessThan(3);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(bubble).toBeFocused();
  const loaded = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/tournaments" && r.request().method() === "GET",
  );
  await page.goto("/tournaments");
  expect((await loaded).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Tournaments.", exact: true })).toBeVisible();
  await expect(page.getByText("The API returned an unexpected response.")).toHaveCount(0);
});

test("account settings preserve both workspaces and support explicit anonymizing deletion", async ({
  page,
}) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill(`web_${suffix}`);
  await page.getByLabel("Email", { exact: true }).fill(`web_${suffix}@test.invalid`);
  await page.getByLabel(/^Password/).fill(`Unique_${suffix}_${suffix}`);
  await page.getByRole("button", { name: "CREATE ACCOUNT", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Account & security." })).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Browser player");
  await page.getByLabel("Bio", { exact: true }).fill("A player and organizer.");
  await page.getByLabel("Default dashboard", { exact: false }).selectOption("ORGANIZER");
  await page.getByRole("button", { name: "SAVE PROFILE", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My teams", exact: true })).toBeVisible();
  await page
    .getByLabel("I understand that deletion is permanent and tournament history is retained.")
    .check();
  await page.getByRole("button", { name: "DELETE & ANONYMIZE ACCOUNT", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
