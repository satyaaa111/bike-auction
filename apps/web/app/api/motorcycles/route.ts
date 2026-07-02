import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MotorcycleSchema } from "@/lib/validation";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";

export async function GET() {
  const motorcycles = await prisma.motorcycle.findMany({
    include: { auction: { select: { id: true, status: true, startTime: true, endTime: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ motorcycles });
}

export async function POST(req: NextRequest) {
  const correlationId = randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin access required." } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = MotorcycleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid motorcycle data.", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const motorcycle = await prisma.motorcycle.create({
    data: { ...parsed.data, createdByAdminId: session.user.id },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "MOTORCYCLE_CREATED",
      entityType: "Motorcycle",
      entityId: motorcycle.id,
    },
  });

  log.info({ motorcycleId: motorcycle.id }, "motorcycle created");
  return NextResponse.json({ motorcycle }, { status: 201 });
}
