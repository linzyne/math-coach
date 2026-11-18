import type { Metadata } from "next";
import CardsApp from "@/components/cards/CardsApp";
import "./cards.css";

export const metadata: Metadata = {
  title: "Spanish",
  appleWebApp: { capable: true, title: "Spanish", statusBarStyle: "default" },
};

export default function CardsPage() {
  return <CardsApp />;
}
