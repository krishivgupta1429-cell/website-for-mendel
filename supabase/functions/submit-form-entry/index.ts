import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitEntryBody {
  full_name: string;
  email: string;
  area_code?: string | null;
  phone_number?: string | null;
  full_phone?: string | null;
  number_of_adults: number;
  number_of_children?: number;
  indoor_celebration?: string | null;
  sponsorships: string[];
  wants_to_donate?: boolean;
  verification_token: string;
  verification_sent_at: string;
  other_donation_amount?: number | null;
}

async function sendRegistrationEmail(fullName: string, email: string): Promise<void> {
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) {
      throw new Error("Missing BREVO_API_KEY");
    }

    const htmlContent = `Hi ${fullName},<br/><br/>
      Thank you so much for signing up for Menorah in the Square—we can't wait to celebrate with you!<br/><br/>
      📍 <strong>Location:</strong> Rotary Square<br/>
      203 S Union St, Traverse City, MI 49684<br/>
      🕔 <strong>Event Start Time:</strong> 5:00 PM<br/>
      📅 <strong>Date:</strong> December 21st<br/><br/>
      Your participation helps bring warmth and light to our whole community.<br/><br/>
      To help spread the light even further, would you consider forwarding the event sign-up to five friends?<br/><br/>
      Here's the link: <a href="https://menorah.jewishtc.org/">https://menorah.jewishtc.org/</a><br/><br/>
      If you have any questions at all, feel free to reach out anytime.<br/>
      Looking forward to celebrating together!<br/><br/>
      Warmly,<br/>
      Rabbi Laibel & Chaya Shemtov<br/>
      Chabad Jewish Center of Traverse City<br/>
      <a href="https://JewishTC.org">JewishTC.org</a><br/><br/>
      <strong>P.S.</strong> Congratulations on being among the first 100 sign-ups!<br/>
      Please show this email when you arrive to receive your free beanie.<br/>
      Be sure to show it before 5:05 PM—after that time, we'll begin giving them out to everyone.<br/><br/>
      <strong>P.S.s</strong><br/>
      View the lamplighter wall:<br/>
      <a href="https://www.jewishtc.org/templates/articlecco_cdo/aid/7109138/jewish/Untitled.htm">https://www.jewishtc.org/templates/articlecco_cdo/aid/7109138/jewish/Untitled.htm</a>`;

    const payload = {
      sender: { name: "Rabbi Laibel Shemtov", email: "rabbi@jewishtc.org" },
      to: [{ email, name: fullName }],
      bcc: [{ email: "laibelswb@gmail.com", name: "Rabbi Laibel" }],
      subject: "You're Registered for Menorah in the Square!",
      htmlContent,
    };

    console.log(`[email] Attempting to send registration email to ${email}...`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
    }
    
    console.log(`[email] Sent successfully to ${email}`);
  } catch (error) {
    console.error(`[email] Error: ${error}`);
    // Don't throw - we don't want email failures to block form submission
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = (await req.json()) as Partial<SubmitEntryBody>;

    // Minimal validation of required fields
    if (!body.full_name || !body.email || !body.verification_token || !body.verification_sent_at || body.number_of_adults === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Compute full_phone if not provided but parts are
    let full_phone = body.full_phone ?? null;
    if (!full_phone && body.area_code && body.phone_number) {
      full_phone = `${body.area_code}${body.phone_number}`;
    }

    // Prepare insert payload
    const insertPayload = {
      full_name: body.full_name.trim(),
      email: body.email.trim().toLowerCase(),
      area_code: body.area_code?.trim() ?? null,
      phone_number: body.phone_number?.trim() ?? null,
      full_phone,
      number_of_adults: body.number_of_adults,
      number_of_children: body.number_of_children ?? 0,
      indoor_celebration: body.indoor_celebration ?? null,
      sponsorships: body.sponsorships ?? [],
      wants_to_donate: body.wants_to_donate ?? false,
      verification_token: body.verification_token,
      verification_sent_at: body.verification_sent_at,
      payment_status: body.wants_to_donate ? "pending" : "none",
      other_donation_amount: body.other_donation_amount && body.other_donation_amount > 0 ? body.other_donation_amount : null,
    };

    const { data, error } = await supabaseAdmin
      .from("form_submissions")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("[submit-form-entry] Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Insert failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Send registration confirmation email only for NON-donors
    // Donors will receive their combined email after payment success
    if (!body.wants_to_donate) {
      sendRegistrationEmail(body.full_name, body.email).catch(err => {
        console.error("[submit-form-entry] Email sending failed but continuing:", err);
      });
    }

    return new Response(JSON.stringify({ id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[submit-form-entry] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
