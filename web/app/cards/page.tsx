import type { Metadata } from "next";
import CardsApp from "@/components/cards/CardsApp";
import "./cards.css";

export const metadata: Metadata = {
  title: "Flashcards",
  appleWebApp: { capable: true, title: "Flashcards", statusBarStyle: "default" },
};

export default function CardsPage() {
  return <CardsApp />;
}
