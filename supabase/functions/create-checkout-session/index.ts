import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: simple in-memory store (resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 checkout sessions per minute per IP

function getRateLimitKey(req: Request): string {
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
const checkoutSessionSchema = z.object({
  formSubmissionId: z.string()
    .uuid("Invalid form submission ID format"),
  amount: z.number()
    .positive("Amount must be positive")
    .min(1, "Minimum donation is $1")
    .max(100000, "Maximum donation is $100,000"),
  email: z.string()
    .trim()
    .email("Invalid email format")
    .max(254, "Email must be less than 254 characters"),
  fullName: z.string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name must be less than 200 characters"),
});

// Helper logging function
const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT-LIVE] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check
    const clientIp = getRateLimitKey(req);
    if (isRateLimited(clientIp)) {
      logStep("Rate limited", { ip: clientIp });
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    logStep("Starting checkout session creation");

    // Verify Stripe key is available
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("ERROR: STRIPE_SECRET_KEY not configured");
      throw new Error("Stripe not configured");
    }

    logStep("Using LIVE mode Stripe key");

    const rawBody = await req.json();

    // Validate input with zod schema
    const parseResult = checkoutSessionSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
      logStep("Validation error", { errors: errorMessages });
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errorMessages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { formSubmissionId, amount, email, fullName } = parseResult.data;

    logStep("Request data validated", { formSubmissionId, amount, email: email.substring(0, 3) + "***" });

    // Verify the form submission exists before creating Stripe session
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("form_submissions")
      .select("id, email")
      .eq("id", formSubmissionId)
      .single();

    if (fetchError || !submission) {
      logStep("ERROR: Form submission not found", { formSubmissionId });
      return new Response(
        JSON.stringify({ error: "Form submission not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Initialize Stripe with live key
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    logStep("Creating Stripe checkout session", { amountInCents });

    // Create Stripe checkout session in LIVE mode
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountInCents,
            product_data: {
              name: "Light the Way Glow Sponsorship",
              description: "Sponsorship and donations for Light the Way Glow event",
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/payment-result?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/payment-result?session_id={CHECKOUT_SESSION_ID}&canceled=1`,
      customer_email: email,
      metadata: {
        form_submission_id: formSubmissionId,
        full_name: fullName,
      },
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      livemode: session.livemode
    });

    logStep("Updating form_submissions with session ID", { formSubmissionId });

    const { error: updateError } = await supabaseAdmin
      .from("form_submissions")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_customer_id: session.customer as string || null,
        payment_status: "pending",
      })
      .eq("id", formSubmissionId);

    if (updateError) {
      logStep("ERROR: Failed to update form_submissions", { error: updateError });
      throw updateError;
    }

    logStep("Successfully updated form_submissions", { 
      formSubmissionId, 
      sessionId: session.id 
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logStep("ERROR: Failed to create checkout session", { 
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
