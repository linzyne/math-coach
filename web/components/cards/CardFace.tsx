"use client";

import { useMemo } from "react";
import type { Card, Note } from "@/lib/cards/types";
import { renderCard } from "@/lib/cards/render";

export default function CardFace({ note, card, showBack, media }: { note: Note; card: Card; showBack: boolean; media?: Record<string, string> }) {
  const html = useMemo(() => renderCard(note, card, media), [note, note.modified, card, media]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="fc-face" dangerouslySetInnerHTML={{ __html: showBack ? html.back : html.front }} />;
}
