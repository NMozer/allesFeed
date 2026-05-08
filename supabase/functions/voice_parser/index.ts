// supabase/functions/voice_parser/index.ts
// TaskFeed Voice Parser – Transkript → strukturiertes Task-Objekt
// Version 1.0

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

Beispiele:
Input: "Morgen 10 Uhr Felix anrufen wegen Angebot"
Output: { "title": "Felix anrufen wegen Angebot", "due": "2026-05-09T10:00:00", "priority": "medium", "tags": ["Anruf"], "notes": null, "confidence": 0.95 }

Wichtige Hinweise:
- "Morgen", "nächste Woche" → berechne korrektes Datum (heutiges Datum wird mitgegeben)
- "Dringend", "wichtig" → priority = high
- Extrahiere immer ein klares Verb am Anfang des Titels`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transcript, userId } = await req.json();

    if (!transcript) {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    // Hier später: Aufruf an Lovable AI Gateway oder Gemini
    // Für jetzt simulieren wir die Antwort (später durch echten LLM-Call ersetzen)

    // === TEMPORÄRER MOCK (später durch echten LLM ersetzen) ===
    const mockParsed = {
      title: transcript.length > 60 ? transcript.substring(0, 57) + "..." : transcript,
      due: null,
      priority: "medium",
      tags: [],
      notes: null,
      confidence: 0.75,
    };

    // Später hier den echten Prompt + LLM-Call einfügen:
    /*
    const response = await fetch("https://lovable.ai/api/chat", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}` },
      body: JSON.stringify({
        system: SYSTEM_PROMPT.replace("{CURRENT_DATE}", currentDate),
        user: transcript,
        response_format: { type: "json_object" }
      })
    });
    const parsed = await response.json();
    */

    return new Response(
      JSON.stringify({
        success: true,
        parsed_task: mockParsed,
        original_transcript: transcript,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});