// Dev-only endpoint paired with app/dev-thumb-export/page.tsx — writes a
// captured catalog thumbnail PNG straight to public/module-thumbnails/.
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  // Writes to the app's own filesystem — must never be reachable once
  // deployed, unlike the page it's paired with (that one's just an inert
  // React tree with no effect if nobody opens it).
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available in production" }, { status: 404 });
  }
  const { type, dataUrl } = await req.json();
  if (!/^[a-z0-9_]+$/.test(type)) {
    return NextResponse.json({ error: "bad type" }, { status: 400 });
  }
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const filePath = path.join(process.cwd(), "public", "module-thumbnails", `${type}.png`);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return NextResponse.json({ ok: true, path: filePath });
}
