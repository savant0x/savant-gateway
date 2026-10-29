"use client";

import type { ModelSummary } from "@/lib/types";

import { Button, Card, Input, Spinner, TextArea } from "@heroui/react";
import { useState } from "react";

import { formatUsage, responseError } from "./format";

export function TesterCard({ freeModels }: { freeModels: ModelSummary[] }) {
  const [testKey, setTestKey] = useState("");
  const [testModel, setTestModel] = useState("");
  const [prompt, setPrompt] = useState(
    "Answer in one short sentence: what is 2 + 2?",
  );
  const [stream, setStream] = useState(true);
  const [testing, setTesting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [testUsage, setTestUsage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const defaultFreeModel =
    freeModels.find((model) => model.id === "free/gpt-6-luna")?.id ??
    freeModels[0]?.id ??
    "";
  const selectedModel =
    testModel && freeModels.some((model) => model.id === testModel)
      ? testModel
      : defaultFreeModel;

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    setAnswer("");
    setTestUsage(null);

    try {
      if (!testKey.trim()) throw new Error("Paste a consumer key first.");
      if (!selectedModel)
        throw new Error("Sync the provider and choose a free model first.");

      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testKey.trim()}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: prompt }],
          stream,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
        }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      if (!stream) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: unknown;
        };

        setAnswer(
          data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2),
        );
        setTestUsage(formatUsage(data.usage));

        return;
      }

      const reader = response.body?.getReader();

      if (!reader) throw new Error("The response body was empty.");

      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      const consume = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) return;

        const raw = trimmed.slice(5).trim();

        if (!raw || raw === "[DONE]") return;

        try {
          const parsed = JSON.parse(raw) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: unknown;
          };
          const delta = parsed.choices?.[0]?.delta?.content;

          if (typeof delta === "string" && delta) {
            text += delta;
            setAnswer(text);
          }

          const usage = formatUsage(parsed.usage);

          if (usage) setTestUsage(usage);
        } catch {
          // Ignore malformed SSE frames while forwarding the stream.
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");

        while (newline >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }

      if (buffer) consume(buffer);
    } catch (reason) {
      setTestError(
        reason instanceof Error ? reason.message : "Gateway request failed",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Gateway tester</Card.Title>
        <Card.Description>
          Sends a real request to{" "}
          <code className="mono">/v1/chat/completions</code> with the consumer
          key.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3">
        <div className="block">
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="gateway-key"
          >
            Consumer key
          </label>
          <Input
            autoComplete="off"
            className="mono w-full text-xs"
            id="gateway-key"
            placeholder="sk-…"
            spellCheck={false}
            value={testKey}
            onChange={(event) => setTestKey(event.target.value)}
          />
        </div>

        <div className="block">
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="gateway-model"
          >
            Free model
          </label>
          <select
            className="h-10 w-full rounded-xl border border-black/10 bg-surface px-3 text-sm outline-none focus:border-accent dark:border-white/10"
            disabled={freeModels.length === 0}
            id="gateway-model"
            value={selectedModel}
            onChange={(event) => setTestModel(event.target.value)}
          >
            {freeModels.length === 0 ? (
              <option value="">Sync the provider first</option>
            ) : (
              freeModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.id}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="block">
          <label
            className="mb-1 block text-xs font-medium text-muted"
            htmlFor="gateway-prompt"
          >
            Prompt
          </label>
          <TextArea
            className="w-full"
            id="gateway-prompt"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              checked={stream}
              className="h-4 w-4 accent-[var(--accent)]"
              type="checkbox"
              onChange={(event) => setStream(event.target.checked)}
            />
            Stream response
          </label>
          <Button
            isDisabled={testing || freeModels.length === 0}
            variant="primary"
            onPress={handleTest}
          >
            {testing ? <Spinner size="sm" /> : null}
            {testing ? "Running" : "Ask the model"}
          </Button>
        </div>

        {testError ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {testError}
          </p>
        ) : null}

        <div className="min-h-[9rem] rounded-xl border border-black/10 bg-black/20 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>Response</span>
            <span>{testUsage ?? "usage appears here"}</span>
          </div>
          <pre className="mono whitespace-pre-wrap break-words text-xs leading-5">
            {answer ||
              (testing ? "Waiting for the provider…" : "No request yet.")}
          </pre>
        </div>
      </Card.Content>
    </Card>
  );
}
