import { z } from "zod";

export const MotorcycleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  mileageKm: z.number().int().min(0),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "NEEDS_WORK"]),
  imageUrls: z.array(z.string().url()).min(1).max(8),
});

export const AuctionSchema = z
  .object({
    motorcycleId: z.string().cuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    startingBidPaise: z.coerce.bigint().positive(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  })
  .refine((data) => data.startTime > new Date(), {
    message: "startTime must be in the future",
    path: ["startTime"],
  });
