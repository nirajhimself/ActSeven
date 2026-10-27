import { getCurrentCustomer } from "@/lib/server/auth";
import { listAddresses } from "@/lib/server/customers";

/**
 * The signed-in shopper's email, name, phone and saved addresses for
 * prefilling checkout, or null for guests. A Route Handler rather than a
 * Server Action so it loads in parallel with the page's other requests
 * (actions run one at a time). Private: never cached.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return Response.json(null, { headers });
  const addresses = await listAddresses(customer.id);
  return Response.json({ email: customer.email, name: customer.name, phone: customer.phone, addresses }, { headers });
}
