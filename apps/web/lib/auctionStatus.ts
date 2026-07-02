export type ComputedStatus = "UPCOMING" | "REGISTERING" | "REGISTRATION_CLOSED" | "LIVE" | "CLOSED" | "CANCELLED";

/**
 * Dynamically computes the current state of an auction based entirely on the current server time.
 */
export function getComputedStatus(auction: {
  status: string;
  regStartTime: Date | string;
  regEndTime: Date | string;
  startTime: Date | string;
  endTime: Date | string;
}): ComputedStatus {
  if (auction.status === "CANCELLED") return "CANCELLED";

  const now = new Date().getTime();
  const regStart = new Date(auction.regStartTime).getTime();
  const regEnd = new Date(auction.regEndTime).getTime();
  const start = new Date(auction.startTime).getTime();
  const end = new Date(auction.endTime).getTime();

  if (now < regStart) return "UPCOMING";
  if (now >= regStart && now < regEnd) return "REGISTERING";
  if (now >= regEnd && now < start) return "REGISTRATION_CLOSED";
  if (now >= start && now < end) return "LIVE";
  return "CLOSED";
}
