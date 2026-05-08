// supabase/functions/voice_parser/index.ts
// TaskFeed Voice Parser – Transkript → strukturiertes Task-Objekt
// Version 1.2 – Lovable AI Gateway

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein extrem präziser und intelligenter Task-Parser für die App "TaskFeed".

Deine Aufgabe: Wandle ein gesprochenes Transkript in ein sauberes, strukturiertes Task-Objekt um.

Regeln:
- Antworte AUSSCHLIESSLICH mit validem JSON (kein Markdown, kein zusätzlicher Text)
- Verwende immer Deutsch für Titel und Notes
- Extrahiere so viele Informationen wie möglich
- Wenn etwas nicht klar ist, lass das Feld weg oder setze einen vernünftigen Default

Ausgabe-Schema (genau einhalten):
{
  "title": "string (max 80 Zeichen, klar und handlungsorientiert)",
  "due": "ISO 8601 Datum+Zeit oder null",
  "priority": "low | medium | high | null",
  "tags": ["string"],
  "notes": "string oder null",
  "confidence": 0.0 bis 1.0
}

Wichtige Hinweise:
- "Morgen", "nächste Woche", "übermorgen" → berechne das korrekte Datum (heutiges Datum wird mitgegeben)
- "Dringend", "wichtig", "asap" → priority = high
- "Mal schauen", "irgendwann" → priority = low
- Extrahiere immer ein klares Verb am Anfang des Titels`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

    if (!transcript) {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY environment variable is not set");
    }

    // === Lovable AI Gateway Call ===
    const lovableResponse = await fetch("https://api.lovable.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT.replace("{CURRENT_DATE}", currentDate),
          },
          {
            role: "user",
            content: transcript,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!lovableResponse.ok) {
      const errorText = await lovableResponse.text();
      throw new Error(`Lovable AI error: ${lovableResponse.status} - ${errorText}`);
    }

    const lovableData = await lovableResponse.json();
    const rawContent = lovableData.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("No response from Lovable AI Gateway");
    }

    // Parse JSON
    let parsedTask;
    try {
      parsedTask = JSON.parse(rawContent);
    } catch (parseError) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedTask = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse JSON from Lovable response");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        parsed_task: parsedTask,
        original_transcript: transcript,
        model: "gemini-3-flash-preview (via Lovable AI Gateway)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[VoiceParser] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});