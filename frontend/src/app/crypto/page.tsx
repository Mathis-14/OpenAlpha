import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  redirect("/crypto/BTC-PERPETUAL");
}
