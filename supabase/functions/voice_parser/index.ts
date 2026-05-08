// supabase/functions/voice_parser/index.ts
// TaskFeed Voice Parser – Transkript → strukturiertes Task-Objekt (mit echtem Gemini-Call)
// Version 1.1

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
    const fullPrompt = SYSTEM_PROMPT.replace("{CURRENT_DATE}", currentDate) + `\n\nTranskript: "${transcript}"`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    // === Echter Gemini API Call ===
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No response from Gemini");
    }

    // Parse the JSON response from Gemini
    let parsedTask;
    try {
      parsedTask = JSON.parse(rawText);
    } catch (parseError) {
      // Fallback: try to extract JSON from text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedTask = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse JSON from Gemini response");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        parsed_task: parsedTask,
        original_transcript: transcript,
        model: "gemini-2.5-flash",
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