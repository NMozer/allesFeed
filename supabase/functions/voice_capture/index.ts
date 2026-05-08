// supabase/functions/voice_capture/index.ts
// TaskFeed – Vollständiger Voice Capture Flow
// ElevenLabs Transcription + Lovable AI Parsing
// Version 1.0

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { audioBase64, userId } = await req.json();

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. ElevenLabs Transcription
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY not set");
    }

    const audioBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

    const elevenResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "audio/mpeg",
      },
      body: audioBuffer,
    });

    if (!elevenResponse.ok) {
      const err = await elevenResponse.text();
      throw new Error(`ElevenLabs error: ${elevenResponse.status} - ${err}`);
    }

    const elevenData = await elevenResponse.json();
    const transcript = elevenData.text;

    if (!transcript || transcript.trim().length < 3) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Kein verständlicher Text erkannt" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Lovable AI Parsing (Voice Parser)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not set");
    }

    const SYSTEM_PROMPT = `Du bist ein extrem präziser Task-Parser für TaskFeed. Wandle das Transkript in JSON um.`;

    const lovableResponse = await fetch("https://api.lovable.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!lovableResponse.ok) {
      throw new Error(`Lovable error: ${lovableResponse.status}`);
    }

    const lovableData = await lovableResponse.json();
    const parsedTask = JSON.parse(lovableData.choices[0].message.content);

    // 3. Return final result
    return new Response(
      JSON.stringify({
        success: true,
        transcript: transcript,
        parsed_task: parsedTask,
        model: "ElevenLabs + Lovable AI (gemini-3-flash-preview)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[VoiceCapture] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});