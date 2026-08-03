// Dev-only endpoint paired with app/dev-thumb-export/page.tsx — writes a
// captured catalog thumbnail PNG straight to public/module-thumbnails/.
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const { type, dataUrl } = await req.json();
  if (!/^[a-z0-9_]+$/.test(type)) {
    return NextResponse.json({ error: "bad type" }, { status: 400 });
  }
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const filePath = path.join(process.cwd(), "public", "module-thumbnails", `${type}.png`);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return NextResponse.json({ ok: true, path: filePath });
}
