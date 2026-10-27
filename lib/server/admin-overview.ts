import "server-only";
import { db } from "./db";

/**
 * Figures for the admin overview. "Today" is the calendar day in India (IST).
 * One query, so the page waits for a single round trip to the database.
 */
export async function getOverview() {
  const [row] = await db()`
    select
      (select json_build_object(
                'orders', count(*)::int,
                'revenue', coalesce(sum(total) filter (where status in ('paid', 'cod_confirmed', 'shipped', 'delivered')), 0)::int)
         from orders
        where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as today,
      (select json_build_object(
                'toShip', count(*) filter (where status in ('paid', 'cod_confirmed'))::int,
                'awaitingPayment', count(*) filter (where status = 'pending_payment')::int)
         from orders) as queue,
      (select count(*)::int from returns where status = 'requested') as returns_requested,
      (select count(*)::int from refunds where status = 'failed'
          and not exists (select 1 from refunds r2 where r2.order_id = refunds.order_id and r2.status <> 'failed')) as refunds_failed,
      (select json_build_object(
                'soldOut', count(*) filter (where i.quantity = 0)::int,
                'low', count(*) filter (where i.quantity > 0 and i.quantity <= i.low_stock_threshold)::int)
         from inventory i join variants v on v.id = i.variant_id join products p on p.id = v.product_id
        where v.active and p.status = 'active') as stock,
      (select json_build_object(
                'active', count(*) filter (where status = 'active')::int,
                'draft', count(*) filter (where status = 'draft')::int)
         from products) as products,
      (select coalesce(json_agg(r), '[]')
         from (select id, number, name, status, total, created_at from orders order by created_at desc limit 6) r) as recent,
      (select coalesce(json_agg(e), '[]')
         from (select id, event, outcome, note, received_at from payment_events order by received_at desc limit 6) e) as events`;
  type Recent = { id: string; number: string; name: string; status: string; total: number; created_at: string };
  type Event = { id: string; event: string; outcome: string; note: string | null; received_at: string };
  return {
    today: row.today as { orders: number; revenue: number },
    queue: {
      ...(row.queue as { toShip: number; awaitingPayment: number }),
      returnsRequested: row.returns_requested as number,
      refundsFailed: row.refunds_failed as number,
    },
    stock: row.stock as { soldOut: number; low: number },
    products: row.products as { active: number; draft: number },
    recentOrders: (row.recent as Recent[]).map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      status: r.status,
      total: r.total,
      createdAt: new Date(r.created_at),
    })),
    paymentEvents: (row.events as Event[]).map((e) => ({
      id: e.id,
      event: e.event,
      outcome: e.outcome,
      note: e.note,
      receivedAt: new Date(e.received_at),
    })),
  };
}
