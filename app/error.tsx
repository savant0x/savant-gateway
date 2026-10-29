"use client";

import { Button, Card } from "@heroui/react";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <Card.Header>
          <Card.Title>Something went wrong</Card.Title>
          <Card.Description>
            The page could not load. Check the server logs, then retry.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <pre className="mono max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-danger">
            {error.message}
          </pre>
        </Card.Content>
        <Card.Footer>
          <Button variant="primary" onPress={reset}>
            Try again
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
