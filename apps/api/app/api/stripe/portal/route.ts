import { NextRequest } from "next/server";
import { createCustomerPortal } from "@/lib/billing";
import { billingAction } from "@/lib/billing-route";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) { return billingAction(req, createCustomerPortal); }
