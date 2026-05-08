// supabase/functions/get_feed_tasks/index.ts
// TaskFeed - Smart Session Reset Edge Function
// Version: 1.0 | Ready for production

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Create Supabase client with user context
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 2. Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const now = new Date();

    // 3. Check if we need to trigger a Session Reset
    const { data: activeTasks, error: countError } = await supabaseClient
      .from("user_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("hidden_until", null)
      .neq("status", "done");

    if (countError) throw countError;

    const activeTaskCount = activeTasks?.length ?? 0;

    // Get last activity timestamp (we store it in a simple way for now)
    const { data: lastReset } = await supabaseClient
      .from("user_tasks")
      .select("session_reset_at")
      .eq("user_id", userId)
      .order("session_reset_at", { ascending: false })
      .limit(1)
      .single();

    const lastResetTime = lastReset?.session_reset_at 
      ? new Date(lastReset.session_reset_at) 
      : new Date(0);

    const minutesSinceLastActivity = (now.getTime() - lastResetTime.getTime()) / (1000 * 60);

    const isMorning = now.getHours() >= 6 && now.getHours() < 9;

    let shouldReset = false;
    let resetReason = "";

    // Trigger 1: Early Reset bei ≤ 6 aktiven Tasks
    if (activeTaskCount <= 6) {
      shouldReset = true;
      resetReason = "early_reset";
    }

    // Trigger 2: 30 Minuten Inaktivität
    else if (minutesSinceLastActivity >= 30) {
      shouldReset = true;
      resetReason = "inactivity_30min";
    }

    // Trigger 3: Morgen-Reset
    else if (isMorning && minutesSinceLastActivity > 60) {
      shouldReset = true;
      resetReason = "morning_reset";
    }

    // 4. Execute Reset if needed
    if (shouldReset) {
      const { error: resetError } = await supabaseClient
        .from("user_tasks")
        .update({
          hidden_until: null,
          session_reset_at: now.toISOString(),
        })
        .eq("user_id", userId)
        .not("hidden_until", "is", null);

      if (resetError) throw resetError;

      console.log(`[TaskFeed] Session Reset triggered for user ${userId} - Reason: ${resetReason}`);
    }

    // 5. Fetch current feed tasks (only visible ones)
    const { data: feedTasks, error: feedError } = await supabaseClient
      .from("user_tasks")
      .select(`
        id,
        title,
        notes,
        due,
        priority,
        status,
        assignee,
        url,
        source,
        source_id,
        created_at
      `)
      .eq("user_id", userId)
      .is("hidden_until", null)
      .neq("status", "done")
      .order("priority", { ascending: false })
      .order("due", { ascending: true })
      .limit(50);

    if (feedError) throw feedError;

    // 6. Return response
    return new Response(
      JSON.stringify({
        success: true,
        tasks: feedTasks,
        meta: {
          active_task_count: activeTaskCount,
          reset_triggered: shouldReset,
          reset_reason: resetReason || null,
          timestamp: now.toISOString(),
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[TaskFeed] Error in get_feed_tasks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});