import { expect, test } from "@playwright/test";

const STORAGE_KEY = "zfl-14-repairs";

async function resetApp(page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(1);
}

async function addMaterial(page, card, { name = "", price, qty } = {}) {
  await card.locator("[data-material-add]").click();
  const row = card.locator(".material-row:not(.material-labels)").last();
  if (name) await row.locator('[data-field="name"]').fill(name);
  if (price !== undefined) await row.locator('[data-field="price"]').fill(String(price));
  if (qty !== undefined) await row.locator('[data-field="qty"]').fill(String(qty));
  return row;
}

async function addRepair(page, { location, title, cost = 0, status = "todo" }) {
  await page.fill('input[name="location"]', location);
  await page.fill('textarea[name="title"]', title);
  await page.fill('input[name="cost"]', String(cost));
  await page.selectOption('select[name="status"]', status);
  await page.click("#repair-form button[type='submit']");
}

test.beforeEach(async ({ page }) => {
  await resetApp(page);
});

test("新增耗材后自动计算每条小计与事项实际费用", async ({ page }) => {
  const card = page.locator(".repair").first();

  await addMaterial(page, card, { name: "水龙头", price: 25.5, qty: 2 });
  await expect(card.locator("[data-subtotal]").last()).toHaveText("51");
  await expect(card.locator("[data-actual]")).toHaveText("51");

  await addMaterial(page, card, { name: "密封胶", price: 10, qty: 3 });
  await expect(card.locator("[data-subtotal]").nth(1)).toHaveText("30");
  await expect(card.locator("[data-actual]")).toHaveText("81");

  // 未完成事项的预计费用仍取预计字段，不受耗材影响
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥260");
  await expect(page.locator('[data-stat="spent"]')).toHaveText("¥0");
});

test("编辑耗材单价或数量时小计和实际费用实时更新", async ({ page }) => {
  const card = page.locator(".repair").first();
  const row = await addMaterial(page, card, { name: "水管", price: 20, qty: 3 });
  await expect(card.locator("[data-actual]")).toHaveText("60");

  await row.locator('[data-field="qty"]').fill("5");
  await expect(card.locator("[data-subtotal]")).toHaveText("100");
  await expect(card.locator("[data-actual]")).toHaveText("100");

  await row.locator('[data-field="price"]').fill("8.5");
  await expect(card.locator("[data-subtotal]")).toHaveText("42.5");
  await expect(card.locator("[data-actual]")).toHaveText("42.5");
});

test("移除耗材后重新计算金额", async ({ page }) => {
  const card = page.locator(".repair").first();
  await addMaterial(page, card, { name: "水龙头", price: 25.5, qty: 2 });
  const second = await addMaterial(page, card, { name: "生料带", price: 2, qty: 5 });
  await expect(card.locator("[data-actual]")).toHaveText("61");

  await second.locator("[data-material-remove]").click();
  await expect(card.locator(".material-row:not(.material-labels)")).toHaveCount(1);
  await expect(card.locator("[data-actual]")).toHaveText("51");
});

test("已完成事项的耗材合计计入已完成支出，未完成事项仍按预计费用统计", async ({ page }) => {
  const card = page.locator(".repair").first();
  await addMaterial(page, card, { name: "软管", price: 100, qty: 1 });
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥260");
  await expect(page.locator('[data-stat="spent"]')).toHaveText("¥0");

  await card.locator("[data-status]").selectOption("done");
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥0");
  await expect(page.locator('[data-stat="spent"]')).toHaveText("¥100");

  await card.locator("[data-status]").selectOption("todo");
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥260");
  await expect(page.locator('[data-stat="spent"]')).toHaveText("¥0");

  await addRepair(page, { location: "卫生间", title: "更换门锁", cost: 500, status: "done" });
  const doneCard = page.locator(".repair", { hasText: "更换门锁" });
  await addMaterial(page, doneCard, { name: "锁芯", price: 60, qty: 2 });

  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥260");
  await expect(page.locator('[data-stat="spent"]')).toHaveText("¥120");
});

test("耗材明细和金额刷新后保持不变", async ({ page }) => {
  const card = page.locator(".repair").first();
  await addMaterial(page, card, { name: "水管", price: 20, qty: 3 });
  await addMaterial(page, card, { name: "阀门", price: 45.5, qty: 2 });
  await expect(card.locator("[data-actual]")).toHaveText("151");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs[0].materials).toHaveLength(2);
  expect(saved.repairs[0].materials[0]).toMatchObject({ name: "水管", price: 20, qty: 3 });

  await page.reload();
  const reloaded = page.locator(".repair").first();
  await expect(reloaded.locator(".material-row:not(.material-labels)")).toHaveCount(2);
  const rows = reloaded.locator(".material-row:not(.material-labels)");
  await expect(rows.nth(0).locator('[data-field="name"]')).toHaveValue("水管");
  await expect(rows.nth(0).locator('[data-field="price"]')).toHaveValue("20");
  await expect(rows.nth(0).locator('[data-field="qty"]')).toHaveValue("3");
  await expect(rows.nth(0).locator("[data-subtotal]")).toHaveText("60");
  await expect(rows.nth(1).locator("[data-subtotal]")).toHaveText("91");
  await expect(reloaded.locator("[data-actual]")).toHaveText("151");
});

test("原有功能回归：新增事项、状态切换、筛选、删除与本地保存", async ({ page }) => {
  await addRepair(page, { location: "卫生间", title: "门锁松动", cost: 300, status: "doing" });
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".stat").nth(1).locator("strong")).toHaveText("1");
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥560");

  await page.click('[data-filter="done"]');
  await expect(page.locator(".repairs")).toContainText("当前状态下没有维修事项");
  await page.click('[data-filter="doing"]');
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair")).toContainText("门锁松动");

  await page.click('[data-filter="all"]');
  await page.locator(".repair", { hasText: "水槽下方渗水" }).locator("[data-delete]").click();
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator('[data-stat="estimated"]')).toHaveText("¥300");

  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair")).toContainText("门锁松动");
});
