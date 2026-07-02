import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@bikeauction.dev" },
    update: {},
    create: { email: "admin@bikeauction.dev", passwordHash, role: "ADMIN" },
  });

  console.log("Seeded:");
  console.log("  admin:  admin@bikeauction.dev / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

