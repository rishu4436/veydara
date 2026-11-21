import { resolveCapabilities } from "@/lib/server/capabilities";
import { errorResponse, json, rateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimit(req, "capabilities", 20);
  if (limited) return limited;
  try {
    return json({ capabilities: await resolveCapabilities(), generatedAt: new Date().toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
