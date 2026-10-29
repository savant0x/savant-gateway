import { Card } from "@heroui/react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg text-center">
        <Card.Header className="items-center">
          <Card.Title>Not found</Card.Title>
          <Card.Description>
            The page you requested does not exist.
          </Card.Description>
        </Card.Header>
        <Card.Footer className="justify-center">
          <Link className="button button--primary button--md" href="/">
            Back to home
          </Link>
        </Card.Footer>
      </Card>
    </div>
  );
}
