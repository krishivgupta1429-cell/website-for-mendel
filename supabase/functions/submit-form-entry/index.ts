import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: simple in-memory store (resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per minute per IP

function getRateLimitKey(req: Request): string {
  // Try to get client IP from various headers
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  return cfConnectingIp || realIp || forwarded?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  
  record.count++;
  return false;
}

// Input validation schema with strict constraints
const submitEntrySchema = z.object({
  full_name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name must be less than 200 characters")
    .regex(/^[a-zA-Z\s\-'.]+$/, "Name contains invalid characters"),
  email: z.string()
    .trim()
    .email("Invalid email format")
    .max(254, "Email must be less than 254 characters")
    .toLowerCase(),
  area_code: z.string()
    .trim()
    .max(5, "Area code too long")
    .regex(/^[0-9]*$/, "Area code must be numeric")
    .optional()
    .nullable(),
  phone_number: z.string()
    .trim()
    .max(15, "Phone number too long")
    .regex(/^[0-9\-\s]*$/, "Phone number contains invalid characters")
    .optional()
    .nullable(),
  full_phone: z.string()
    .trim()
    .max(20, "Phone number too long")
    .regex(/^[0-9\-\s\(\)\+]*$/, "Phone contains invalid characters")
    .optional()
    .nullable(),
  number_of_adults: z.number()
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(100, "Maximum 100 adults"),
  number_of_children: z.number()
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(100, "Maximum 100 children")
    .optional()
    .default(0),
  indoor_celebration: z.enum(["attending", "not-attending"])
    .optional()
    .nullable(),
  sponsorships: z.array(
    z.string()
      .max(100, "Sponsorship name too long")
      .regex(/^[a-zA-Z0-9_\-\s]+$/, "Invalid sponsorship format")
  )
    .max(10, "Maximum 10 sponsorships")
    .default([]),
  wants_to_donate: z.boolean().optional().default(false),
  verification_token: z.string()
    .length(64, "Invalid verification token format")
    .regex(/^[a-f0-9]+$/, "Invalid verification token format"),
  verification_sent_at: z.string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  other_donation_amount: z.number()
    .min(0, "Amount cannot be negative")
    .max(100000, "Maximum donation amount is $100,000")
    .optional()
    .nullable(),
});

function buildAttendeeBlock(
  numAdults: number,
  numChildren: number,
  indoorCelebration: string | null
): string {
  const lines: string[] = [];

  if (numAdults > 0) {
    lines.push(`Number of adults: ${numAdults}`);
  }

  if (numChildren > 0) {
    lines.push(`Number of children: ${numChildren}`);
  }

  const indoorStatusLabel = indoorCelebration === "attending" ? "Attending" : "Not attending";
  lines.push(`Indoor Chanukah Celebration: ${indoorStatusLabel}`);

  return lines.join("<br/>");
}

async function sendRegistrationEmail(
  fullName: string,
  email: string,
  numAdults: number,
  numChildren: number,
  indoorCelebration: string | null
): Promise<void> {
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) {
      throw new Error("Missing BREVO_API_KEY");
    }

    const attendeeBlock = buildAttendeeBlock(numAdults, numChildren, indoorCelebration);

    const htmlContent = `<p>BH</p>

<p>Dear ${fullName}</p>

<p>Thank you for signing up for the Chanukah Celebration! We're so glad you'll be joining us as our community gathers to bring light, joy, and Jewish pride to the heart of Wheeling.</p>

<p><strong>Public Menorah Lighting</strong><br>
📍 Wheeling Town Center – 375 W. Dundee Rd.<br>
🕔 Event Start: 4:00 PM<br>
📅 Sunday, December 14</p>

<p><strong>Indoor Celebration</strong><br>
📍 Wheeling Park District – Rooms 204–205<br>
100 Community Blvd.</p>

<p><strong>Share the Light</strong><br>
Invite friends to join: <a href="https://chanukah.wheelingchabad.com">https://chanukah.wheelingchabad.com</a></p>

<p>Warmly,<br>
Rabbi Mendel and Mushky Shmotkin</p>

<p><strong>Attendees:</strong><br>
${attendeeBlock}</p>`;

    const payload = {
      sender: { name: "Wheeling Chabad", email: "rabbi@wheelingchabad.com" },
      to: [{ email, name: fullName }],
      bcc: [{ email: "wheelingchabad@gmail.com" }],
      subject: "Welcome to the Chanukah Celebration! ✨",
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
    // Rate limiting check
    const clientIp = getRateLimitKey(req);
    if (isRateLimited(clientIp)) {
      console.log(`[submit-form-entry] Rate limited: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const rawBody = await req.json();

    // Validate input with zod schema
    const parseResult = submitEntrySchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
      console.error("[submit-form-entry] Validation error:", errorMessages);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errorMessages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const body = parseResult.data;

    // Compute full_phone if not provided but parts are
    let full_phone = body.full_phone ?? null;
    if (!full_phone && body.area_code && body.phone_number) {
      full_phone = `${body.area_code}${body.phone_number}`;
    }

    // Prepare insert payload with validated and sanitized data
    const insertPayload = {
      full_name: body.full_name,
      email: body.email,
      area_code: body.area_code ?? null,
      phone_number: body.phone_number ?? null,
      full_phone,
      number_of_adults: body.number_of_adults,
      number_of_children: body.number_of_children,
      indoor_celebration: body.indoor_celebration ?? null,
      sponsorships: body.sponsorships,
      wants_to_donate: body.wants_to_donate,
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
      sendRegistrationEmail(
        body.full_name,
        body.email,
        body.number_of_adults,
        body.number_of_children,
        body.indoor_celebration ?? null
      ).catch(err => {
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
