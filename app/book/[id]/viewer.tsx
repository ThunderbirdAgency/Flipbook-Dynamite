"use client";

import { useSyncExternalStore } from "react";
import FlipbookViewer from "@/components/FlipbookViewer";
import type { Branding, Overlay, Visibility } from "@/lib/types";

const noopSubscribe = () => () => {};

// Share/embed URLs need window.location.origin, which only exists client-side,
// so this thin wrapper computes them and feeds the viewer.
export default function BookViewer({
  id,
  title,
  isOwner,
  visibility,
  hasPassword,
  branding,
  overlays,
}: {
  id: string;
  title: string;
  isOwner: boolean;
  visibility: Visibility;
  hasPassword: boolean;
  branding: Branding;
  overlays: Overlay[];
}) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );

  return (
    <FlipbookViewer
      pdfUrl={`/api/books/${id}/pdf`}
      title={title}
      downloadUrl={`/api/books/${id}/pdf?download=1`}
      shareUrl={origin ? `${origin}/book/${id}` : undefined}
      embedUrl={origin ? `${origin}/embed/${id}` : undefined}
      bookId={id}
      isOwner={isOwner}
      visibility={visibility}
      hasPassword={hasPassword}
      branding={branding}
      overlays={overlays}
    />
  );
}
