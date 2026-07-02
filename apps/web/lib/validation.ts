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
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    regStartTime: z.coerce.date(),
    regEndTime: z.coerce.date(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    startingBidPaise: z.coerce.bigint().positive("Starting bid must be positive"),
    reservePricePaise: z.coerce.bigint().positive().optional().nullable(),
  })
  .refine((data) => data.regStartTime < data.regEndTime, {
    message: "Registration end time must be after registration start time",
    path: ["regEndTime"],
  })
  .refine((data) => data.regEndTime <= data.startTime, {
    message: "Auction start time must be at or after registration close time",
    path: ["startTime"],
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Auction end time must be after auction start time",
    path: ["endTime"],
  });

