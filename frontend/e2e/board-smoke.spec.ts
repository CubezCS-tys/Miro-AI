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
        live_research_enabled: false,
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
            data: {
              concept,
              sourceDocumentId: "doc1",
              sourceDocumentName: "biology.pdf",
            },
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
  await page.route("**/documents/doc1/pages/3", (route) =>
    route.fulfill({
      json: {
        document_id: "doc1",
        filename: "biology.pdf",
        page: 3,
        page_count: 6,
        text: "The leaf stores sugars after chlorophyll absorbs light energy during photosynthesis.",
        start_char: 0,
        end_char: 83,
      },
    }),
  );
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Page 3 excerpt")).toBeVisible();
  await expect(
    page.locator("mark", { hasText: "chlorophyll absorbs light energy" }),
  ).toBeVisible();
});

test("frontier proposal can be accepted onto the board", async ({ page }) => {
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
  const proposal = {
    board_id: "default",
    query: "Photosynthesis",
    budget: "mock",
    sources: [
      {
        id: "src1",
        kind: "mock",
        title: "Mock research frontier",
        url: null,
        local_path: null,
        sha256: "abc123def456",
        content_text: "Mock source text",
        metadata: {},
      },
    ],
    claims: [
      {
        id: "claim1",
        source_id: "src1",
        text: "Additional evidence strengthens the selected claim.",
        quote: "Mock source argues that Photosynthesis needs stronger evidence from nearby literature.",
        page: 1,
        start_char: null,
        end_char: null,
        url_anchor: null,
        stance: "supports",
        confidence: 0.78,
      },
    ],
    nodes: [
      {
        id: "frontier-photosynthesis-support",
        label: "Frontier Evidence",
        summary: "Additional evidence can strengthen the selected claim.",
        source_quote:
          "Mock source argues that Photosynthesis needs stronger evidence from nearby literature.",
        source_page: 1,
        source_span: {
          page: 1,
          start_char: null,
          end_char: null,
          quote:
            "Mock source argues that Photosynthesis needs stronger evidence from nearby literature.",
          verified: true,
        },
        kind: "entity",
      },
    ],
    edges: [
      {
        source: "node-1",
        target: "frontier-photosynthesis-support",
        label: "supports",
        kind: "supports",
      },
    ],
  };

  await page.route("**/config", (route) =>
    route.fulfill({
      json: {
        server_execution_enabled: false,
        live_research_enabled: false,
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
  await page.route("**/research/frontier", (route) =>
    route.fulfill({
      json: { proposal_id: "proposal1", status: "pending", proposal },
    }),
  );
  await page.route("**/research/proposals/proposal1/accept", (route) =>
    route.fulfill({
      json: { proposal_id: "proposal1", status: "accepted", proposal },
    }),
  );

  await page.goto("/");
  await page.getByText("Photosynthesis").click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Expand frontier" }).click();
  await expect(page.getByText("Research frontier", { exact: true })).toBeVisible();
  await expect(page.getByText("Frontier Evidence")).toBeVisible();
  await page.getByRole("button", { name: "Accept nodes" }).click();
  await expect(page.getByText("Frontier Evidence")).toBeVisible();
});

test("arena route completes a mocked tutor session", async ({ page }) => {
  const selectedNode = {
    node_id: "node-1",
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
  await page.addInitScript((node) => {
    localStorage.setItem(
      "miro-ai-arena",
      JSON.stringify({
        board_id: "default",
        selected_nodes: [node],
      }),
    );
  }, selectedNode);
  await page.route("**/tutor/sessions", (route) =>
    route.fulfill({
      json: {
        session_id: "session1",
        status: "active",
        mode: "socratic",
        selected_nodes: [selectedNode],
        mastery: {
          "node-1": { label: "Photosynthesis", state: "unknown", score: 0.2 },
        },
        current_question: {
          id: "q1",
          kind: "source-check",
          node_id: "node-1",
          node_label: "Photosynthesis",
          question: "What does the cited quote prove about Photosynthesis?",
          source_page: 3,
          source_quote: "chlorophyll absorbs light energy",
        },
      },
    }),
  );
  await page.route("**/tutor/sessions/session1/answer", (route) =>
    route.fulfill({
      json: {
        session_id: "session1",
        evaluation: {
          verdict: "solid",
          score: 0.9,
          state: "solid",
          feedback: "Good: the answer tied the idea back to the cited source.",
          missing: [],
        },
        mastery: {
          "node-1": { label: "Photosynthesis", state: "solid", score: 0.9 },
        },
        next_question: null,
        complete: true,
      },
    }),
  );
  await page.route("**/tutor/sessions/session1/finish", (route) =>
    route.fulfill({
      json: {
        session_id: "session1",
        status: "complete",
        flashcards: [
          {
            front: "What source supports Photosynthesis?",
            back: "chlorophyll absorbs light energy",
            node_id: "node-1",
          },
        ],
        presentation_path: [
          { step: 1, node_id: "node-1", title: "Photosynthesis", source_page: 3 },
        ],
        graph_revision: {
          summary: "Review pack ready.",
          weak_node_ids: [],
          proposed_edges: [],
        },
      },
    }),
  );

  await page.goto("/arena");
  await expect(page.getByText("Graph Tutor Arena")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "What does the cited quote prove about Photosynthesis?",
    }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Answer from the source first, then reason from it.")
    .fill("chlorophyll absorbs light energy proves the light capture step.");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("heading", { name: "Review pack ready" })).toBeVisible();
  await expect(page.getByText("What source supports Photosynthesis?")).toBeVisible();
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
