import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    console.log("[test-brevo] BREVO_KEY_PRESENT:", Boolean(apiKey));
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "BREVO_API_KEY is not configured" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const testEmail = body.email || "wheelingchabad@gmail.com";

    console.log(`[test-brevo] Sending test email to: ${testEmail}`);

    const payload = {
      sender: { name: "Wheeling Chabad", email: "rabbi@wheelingchabad.com" },
      to: [{ email: testEmail, name: "Test Recipient" }],
      subject: "Brevo Integration Test ✅",
      htmlContent: `
        <h2>Brevo Integration Test</h2>
        <p>This is a test email to verify the Brevo integration is working correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
        <p>If you received this email, the integration is working!</p>
      `,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log(`[test-brevo] Brevo response status: ${response.status}`);
    console.log(`[test-brevo] Brevo response body: ${responseText}`);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: response.status,
          error: responseData 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.messageId,
        sentTo: testEmail,
        brevoResponse: responseData
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[test-brevo] Unexpected error:", err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err instanceof Error ? err.message : String(err) 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
