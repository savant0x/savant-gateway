import { Card } from "@heroui/react";

export function QuickStartCard() {
  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Quick start</Card.Title>
        <Card.Description>
          The verified path, from provider key to a live completion.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4 text-sm">
        <div className="flex gap-3">
          <span className="step-number">1</span>
          <p className="text-muted">
            Put <code className="mono text-foreground">PROVIDER_KEY</code> in{" "}
            <code className="mono text-foreground">.env.local</code>.
          </p>
        </div>
        <div className="flex gap-3">
          <span className="step-number">2</span>
          <p className="text-muted">
            Sync the catalog, then create a key below.
          </p>
        </div>
        <div className="flex gap-3">
          <span className="step-number">3</span>
          <p className="text-muted">
            Call{" "}
            <code className="mono text-foreground">/v1/chat/completions</code>{" "}
            with{" "}
            <code className="mono text-foreground">
              Authorization: Bearer sk-…
            </code>
            .
          </p>
        </div>
        <pre className="scroll-shell rounded-xl bg-black/30 p-3 text-xs leading-5 text-muted">
          <code>{`curl http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-…" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"free/gpt-6-luna","messages":[{"role":"user","content":"Hello"}]}'`}</code>
        </pre>
      </Card.Content>
    </Card>
  );
}
