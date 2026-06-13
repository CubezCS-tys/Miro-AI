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
        host_terminal_enabled: false,
        terminal_runtime: "disabled",
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
        host_terminal_enabled: false,
        terminal_runtime: "disabled",
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

test("terminal node renders disabled backend policy state", async ({ page }) => {
  await page.route("**/config", (route) =>
    route.fulfill({
      json: {
        server_execution_enabled: false,
        host_terminal_enabled: false,
        terminal_runtime: "disabled",
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
            id: "term-1",
            type: "terminal",
            position: { x: 120, y: 120 },
            data: { title: "Terminal", runtime: "host" },
            style: { width: 560, height: 360 },
          },
        ],
        edges: [],
      },
    });
  });

  await page.goto("/");

  await expect(page.getByText("Terminal", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Host terminal locked by backend policy").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
});

test("settings page controls host terminal browser consent", async ({ page }) => {
  await page.route("**/config", (route) =>
    route.fulfill({
      json: {
        server_execution_enabled: false,
        host_terminal_enabled: true,
        terminal_runtime: "host",
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

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Runtime controls" })).toBeVisible();
  const toggle = page.getByRole("checkbox", { name: "Host terminal" });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();

  await toggle.check();

  await expect(toggle).toBeChecked();
  await expect(page.getByText("Enabled on this browser")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("miro-ai-host-terminal-consent"),
      ),
    )
    .toBe("true");
});

test("terminal node connects to mocked websocket runtime", async ({ page }) => {
  const received: string[] = [];
  let terminalInput = "";
  await page.addInitScript(() => {
    localStorage.setItem("miro-ai-host-terminal-consent", "true");
  });
  await page.routeWebSocket("ws://localhost:8000/terminal/sessions*", (ws) => {
    let readySent = false;
    const sendReady = () => {
      if (readySent) return;
      readySent = true;
      ws.send(
        JSON.stringify({
          type: "ready",
          session_id: "session1",
          cwd: "/tmp/miro-ai-terminal-test",
          shell: "/bin/bash",
        }),
      );
    };
    ws.onMessage((message) => {
      const text = String(message);
      received.push(text);
      const body = JSON.parse(text) as { type?: string; data?: string };
      sendReady();
      if (body.type === "input") {
        terminalInput += body.data ?? "";
      }
      if (body.type === "input" && body.data?.includes("\r")) {
        ws.send(JSON.stringify({ type: "output", data: "mock-ok\r\n" }));
      }
      if (body.type === "kill") {
        ws.send(JSON.stringify({ type: "exit", exit_code: 0 }));
      }
    });
  });
  await page.route("**/config", (route) =>
    route.fulfill({
      json: {
        server_execution_enabled: false,
        host_terminal_enabled: true,
        terminal_runtime: "host",
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
        nodes: [],
        edges: [],
      },
    });
  });

  await page.goto("/");
  await page.getByTitle("Host terminal (B)").click();
  await expect(page.getByText("Terminal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).dispatchEvent("click");

  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(page.getByText("/tmp/miro-ai-terminal-test")).toBeVisible();

  await page.getByRole("textbox", { name: "Terminal input" }).focus();
  await page.keyboard.type("echo mock");
  await page.keyboard.press("Enter");

  await expect.poll(() => terminalInput.includes("echo mock")).toBe(true);
  await expect
    .poll(() => received.some((item) => item.includes('"type":"resize"')))
    .toBe(true);

  await page
    .getByRole("button", { name: "Disconnect" })
    .dispatchEvent("click");
  await expect
    .poll(() => received.some((item) => item.includes('"type":"kill"')))
    .toBe(true);
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
