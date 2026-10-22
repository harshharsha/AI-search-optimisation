"use server";

import { discoverMarket, Discovery } from "@/src/lib/discovery";

export async function discoverMarketAction(input: {
  brandName: string;
  website: string;
  model: string;
}): Promise<Discovery> {
  return discoverMarket(input);
}
