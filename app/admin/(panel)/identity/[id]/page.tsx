import type { Metadata } from "next";

import { Card } from "@heroui/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IdentityRunDetail } from "@/components/admin/identity-run-detail";
import { readRunDetail } from "@/lib/identity/reads";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin identity run",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function AdminIdentityRunPage({ params }: Params) {
  const { id } = await params;
  let storageError: string | null = null;
  let detail: Awaited<ReturnType<typeof readRunDetail>> = null;

  try {
    detail = await readRunDetail(await getDatabase(), id);
  } catch (error) {
    storageError =
      error instanceof Error ? error.message : "No database handle.";
  }

  if (!detail && !storageError) notFound();

  if (storageError) {
    return (
      <>
        <Link
          className="text-xs text-accent hover:underline"
          href="/admin/identity"
        >
          ← All identity checks
        </Link>
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Identity storage is not configured</Card.Title>
            <Card.Description>
              The run could not be read. No data has been changed.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
              {storageError}
            </p>
          </Card.Content>
        </Card>
      </>
    );
  }

  if (!detail) return null;

  return <IdentityRunDetail detail={detail} />;
}
