import { test, expect } from "@playwright/test";
test("create, edit, persist, search, trash and restore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "A little space for big ideas",
  );
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Browser smoke note");
  await page
    .getByRole("textbox", { name: "Cell 1 content" })
    .fill("# Persistent content\nA note that stays.");
  await expect(
    page.getByText("Saved on device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Browser smoke note" }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "Persistent content" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search notes" })
    .fill("Browser smoke");
  await expect(
    page.getByRole("heading", { name: "Browser smoke note" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move note to trash" }).click();
  await page
    .getByRole("button", { name: "Trash", exact: false })
    .first()
    .click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Browser smoke note" }) })
    .click();
  await page.getByRole("button", { name: "Restore note" }).click();
  await expect(
    page.getByText("Note restored.", { exact: false }),
  ).toBeVisible();
});
test("pair two isolated devices and transfer an edit", async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const mac = await a.newPage(),
    phone = await b.newPage();
  await mac.goto("/");
  await mac.getByRole("button", { name: "Sync devices", exact: true }).click();
  await mac.getByRole("button", { name: "Create a synced library" }).click();
  await expect(
    mac.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  const key = await mac
    .getByRole("textbox", { name: "Pairing key", exact: true })
    .inputValue();
  await mac.getByRole("button", { name: "Close dialog" }).click();
  await mac.getByRole("button", { name: "New note", exact: true }).click();
  await mac.getByRole("textbox", { name: "Note title" }).fill("Mac to phone");
  await mac
    .getByRole("textbox", { name: "Cell 1 content" })
    .fill("Encrypted round trip");
  await mac.getByRole("button", { name: "Sync devices", exact: true }).click();
  await mac.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    mac.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  await phone.goto("/");
  await phone
    .getByRole("button", { name: "Sync devices", exact: true })
    .click();
  await phone.getByRole("textbox", { name: "Enter pairing key" }).fill(key);
  await phone
    .getByRole("button", { name: "Connect & merge libraries" })
    .click();
  await expect(
    phone.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  await phone.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    phone.getByRole("heading", { name: "Mac to phone" }),
  ).toBeVisible();
  await a.close();
  await b.close();
});
test("mobile layout and offline cached app", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByRole("heading", { name: "A little space for big ideas" })
    .click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little space for big ideas" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png" });
  await context.close();
});

test("Quiver ZIP imports and exports without losing cells or attachment bytes", async ({
  page,
}) => {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("Original.qvlibrary/meta.json", "{}");
  zip.file(
    "Original.qvlibrary/b.qvnotebook/meta.json",
    JSON.stringify({ uuid: "b", name: "Imported research" }),
  );
  zip.file(
    "Original.qvlibrary/b.qvnotebook/n.qvnote/meta.json",
    JSON.stringify({
      uuid: "n",
      title: "Imported fixture",
      tags: ["fixture"],
      created_at: 10,
      updated_at: 20,
    }),
  );
  zip.file(
    "Original.qvlibrary/b.qvnotebook/n.qvnote/content.json",
    JSON.stringify({
      title: "Imported fixture",
      cells: [
        { type: "markdown", data: "# Imported content" },
        {
          type: "text",
          data: '<img src=x onerror="window.compromised=true"><p>Safe HTML</p>',
        },
        { type: "code", language: "python", data: "print(42)" },
      ],
    }),
  );
  zip.file(
    "Original.qvlibrary/b.qvnotebook/n.qvnote/resources/test.txt",
    "exact attachment bytes",
  );
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Quiver.zip",
      mimeType: "application/zip",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
  await expect(
    page.getByText("Import complete", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open my notes" }).click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Imported fixture",
  );
  await expect(
    page.getByRole("heading", { name: "Imported content" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.compromised)).toBeUndefined();
  await page
    .getByRole("button", { name: "Export library", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Quiver library (.zip)" })
    .click();
  const download = await downloading;
  const fs = await import("node:fs/promises");
  const exported = await JSZip.loadAsync(
    await fs.readFile(await download.path()),
  );
  expect(
    await exported
      .file("Folio.qvlibrary/b.qvnotebook/n.qvnote/resources/test.txt")
      .async("string"),
  ).toBe("exact attachment bytes");
});
