import "server-only";
import { db } from "./db";

/** Figures for the admin overview. "Today" is the calendar day in India (IST). */
export async function getOverview() {
  const sql = db();
  const [[today], [queue], [stock], [products], recent] = await Promise.all([
    sql`
      select count(*)::int as orders,
             coalesce(sum(total) filter (where status in ('paid', 'cod_confirmed', 'shipped', 'delivered')), 0)::int as revenue
        from orders
       where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date`,
    sql`
      select count(*) filter (where status in ('paid', 'cod_confirmed'))::int as to_ship,
             count(*) filter (where status = 'pending_payment')::int as awaiting_payment,
             (select count(*)::int from returns where status = 'requested') as returns_requested,
             (select count(*)::int from refunds where status = 'failed'
                 and not exists (select 1 from refunds r2 where r2.order_id = refunds.order_id and r2.status <> 'failed')) as refunds_failed
        from orders`,
    sql`
      select count(*) filter (where i.quantity = 0)::int as sold_out,
             count(*) filter (where i.quantity > 0 and i.quantity <= i.low_stock_threshold)::int as low
        from inventory i join variants v on v.id = i.variant_id join products p on p.id = v.product_id
       where v.active and p.status = 'active'`,
    sql`
      select count(*) filter (where status = 'active')::int as active,
             count(*) filter (where status = 'draft')::int as draft
        from products`,
    sql`select id, number, name, status, total, created_at from orders order by created_at desc limit 6`,
  ]);
  return {
    today: { orders: today.orders as number, revenue: today.revenue as number },
    queue: {
      toShip: queue.to_ship as number,
      awaitingPayment: queue.awaiting_payment as number,
      returnsRequested: queue.returns_requested as number,
      refundsFailed: queue.refunds_failed as number,
    },
    stock: { soldOut: stock.sold_out as number, low: stock.low as number },
    products: { active: products.active as number, draft: products.draft as number },
    recentOrders: recent.map((r) => ({
      id: r.id as string,
      number: r.number as string,
      name: r.name as string,
      status: r.status as string,
      total: r.total as number,
      createdAt: r.created_at as Date,
    })),
  };
}
