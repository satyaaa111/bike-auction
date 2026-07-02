import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin access required." } }, { status: 403 });
  }

  const entityType = req.nextUrl.searchParams.get("entityType") ?? undefined;
  const entityId = req.nextUrl.searchParams.get("entityId") ?? undefined;

  const logs = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    include: { actor: { select: { id: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ logs });
}
