import { expect, test } from "@playwright/test";

test("board renders grounded source metadata", async ({ page }) => {
  const concept = {
    id: "photosynthesis",
    label: "Photosynthesis",
    summary: "Plants convert light into stored chemical energy.",
    source_quote: "chlorophyll absorbs light energy",
    source_page: 3,
    source_span: {
      page: 3,
      start_char: 120,
      end_char: 153,
      quote: "chlorophyll absorbs light energy",
      verified: true,
    },
    kind: "process",
  };

  await page.route("**/config", (route) =>
    route.fulfill({
      json: {
        server_execution_enabled: false,
        max_upload_bytes: 26214400,
        max_prompt_chars: 12000,
        max_code_chars: 20000,
        provider: "mock",
        quality_model: "gemini-3.1-pro-preview",
        light_model: "gemini-3.1-flash-lite",
        privacy_boundary: "Mock privacy boundary",
      },
    }),
  );
  await page.route("**/boards", (route) =>
    route.fulfill({
      json: {
        boards: [
          {
            id: "default",
            title: "Default board",
            created_at: "2026-06-13T00:00:00Z",
            updated_at: "2026-06-13T00:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/documents", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  await page.route("**/board", (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        nodes: [
          {
            id: "node-1",
            type: "knowledge",
            position: { x: 120, y: 120 },
            data: { concept },
          },
        ],
        edges: [],
      },
    });
  });

  await page.goto("/");

  await expect(page.getByText("Photosynthesis")).toBeVisible();
  await expect(page.getByText("p3")).toBeVisible();
  await page.getByText("Photosynthesis").click();
  await expect(page.getByText("p3, chars 120-153")).toBeVisible();
  await expect(page.getByText("verified")).toBeVisible();
});

test("presentation route renders selected grounded nodes", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "miro-ai-presentation",
      JSON.stringify({
        createdAt: "2026-06-13T00:00:00Z",
        nodes: [
          {
            id: "photosynthesis",
            label: "Photosynthesis",
            summary: "Plants convert light into stored chemical energy.",
            source_quote: "chlorophyll absorbs light energy",
            source_page: 3,
            source_span: {
              page: 3,
              start_char: 120,
              end_char: 153,
              quote: "chlorophyll absorbs light energy",
              verified: true,
            },
            kind: "process",
          },
        ],
      }),
    );
  });

  await page.goto("/present");

  await expect(page.getByText("Miro-AI presentation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Photosynthesis" })).toBeVisible();
  await expect(page.getByText("p3")).toBeVisible();
  await expect(page.getByText("chlorophyll absorbs light energy")).toBeVisible();
});
