import { createClient } from "@/lib/supabase/server";
export async function getDashboard() { const db=await createClient(); const [{data:cases,error},{data:clients},{data:reminders}]=await Promise.all([db.from("cases").select("*, clients(company_name), app_users(name)").order("created_at",{ascending:false}),db.from("clients").select("*").order("company_name"),db.from("reminders").select("*").eq("status","scheduled").order("due_at")]); if(error) throw error; return {cases:cases??[],clients:clients??[],reminders:reminders??[]}; }
export async function audit(
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  const db = await createClient();

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required for audit logging");
  }

  const { data: actor, error: actorError } = await db
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .single();

  if (actorError || !actor) {
    throw new Error("Authorized audit actor not found");
  }

  const { data: auditId, error: auditError } = await db.rpc(
  "record_operational_audit",
  {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_details: details,
  },
);

  if (auditError) {
  throw auditError;
}

if (
  typeof auditId !== "string" ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    auditId,
  )
) {
  throw new Error(
    "Audit outcome is unknown. Check the audit log before repeating the action.",
  );
}
}
export async function getOperations(){const db=await createClient();const names=["travellers","quotations","bookings","payments","tickets","service_cases","audit_logs"] as const;const results=await Promise.all(names.map(n=>db.from(n).select("*").order("created_at",{ascending:false})));return Object.fromEntries(names.map((n,i)=>[n,results[i].data??[]])) as Record<(typeof names)[number],any[]>}
