import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const correlationId = randomUUID();
  const log = withCorrelation(correlationId);

  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid registration data.", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately generic message — don't leak which emails are registered.
    return NextResponse.json(
      { error: { code: "EMAIL_IN_USE", message: "Could not register with these details." } },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "BUYER" },
    select: { id: true, email: true, role: true },
  });

  log.info({ userId: user.id }, "user registered");
  return NextResponse.json({ user }, { status: 201 });
}
