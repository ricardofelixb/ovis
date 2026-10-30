import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentMark, hasBrandColors, modelMark } from "./AgentMark.tsx";

describe("agent marks", () => {
  it("tells the marks with brand colors from those riding currentColor, for Mono to grey only the former", () => {
    expect(["claude", "omp", "opencode", "gjc", "omo", "amp", "gemini", "letta"].every(hasBrandColors)).toBe(true);
    expect(["codex", "cursor", "cline", "pi", "unknown-agent"].some(hasBrandColors)).toBe(false);
    expect(renderToStaticMarkup(createElement(AgentMark, { agent: "claude" }))).toContain('class="agent-mark claude is-brand"');
    expect(renderToStaticMarkup(createElement(AgentMark, { agent: "codex" }))).toContain('class="agent-mark codex"');
    expect(renderToStaticMarkup(createElement(AgentMark, { agent: "zed" }))).toContain('class="agent-mark zed"');
  });
});

describe("modelMark", () => {
  it("a model's maker comes from its name, whatever provider carries it", () => {
    expect(modelMark("claude-bridge/claude-opus-5-5")).toBe("claude");
    expect(modelMark("openrouter/anthropic/claude-sonnet-5-5")).toBe("claude");
    expect(modelMark("openai-codex/gpt-6.1-sol")).toBe("codex");
    expect(modelMark("google/gemini-3-pro")).toBe("gemini");
    expect(modelMark("local/llama-4")).toBeNull();
  });
});
