// Claude API integration — built out in Step 7 of the build order.
// See TRIPOLY_HANDOFF.md section 9 for the system prompt and JSON contract.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Not implemented yet — Step 7" }, { status: 501 });
}
