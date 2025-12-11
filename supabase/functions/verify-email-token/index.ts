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
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 verification attempts per minute per IP

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

// Input validation schema - token must be exactly 64 hex characters
const verifyTokenSchema = z.object({
  token: z.string()
    .length(64, "Invalid token format")
    .regex(/^[a-f0-9]+$/i, "Invalid token format"),
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check
    const clientIp = getRateLimitKey(req);
    if (isRateLimited(clientIp)) {
      console.log(`[verify-email-token] Rate limited: ${clientIp}`);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Too many verification attempts. Please try again later." 
        }),
        { 
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const rawBody = await req.json();

    // Validate input with zod schema
    const parseResult = verifyTokenSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.log("[verify-email-token] Invalid token format");
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid verification token" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { token } = parseResult.data;

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the submission with this token
    const { data: submission, error: findError } = await supabase
      .from("form_submissions")
      .select("id, email, verification_sent_at")
      .eq("verification_token", token.toLowerCase())
      .single();

    if (findError || !submission) {
      console.error("Token not found:", findError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid or expired verification token" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if token already used (verification_token will be null)
    const { data: currentSubmission } = await supabase
      .from("form_submissions")
      .select("verification_token")
      .eq("id", submission.id)
      .single();

    if (!currentSubmission?.verification_token) {
      return new Response(
        JSON.stringify({ 
          success: true,
          alreadyVerified: true,
          message: "Email already verified"
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      );
    }

    // Check if token is expired (24 hours)
    const sentAt = new Date(submission.verification_sent_at);
    const now = new Date();
    const hoursSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSent > 24) {
      return new Response(
        JSON.stringify({ 
          success: false,
          expired: true,
          error: "Verification token has expired. Please request a new one." 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update the submission to mark as verified by clearing the token
    const { error: updateError } = await supabase
      .from("form_submissions")
      .update({
        verification_token: null, // Clear the token to mark as verified
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("Error updating submission:", updateError);
      throw new Error("Failed to verify email");
    }

    console.log("Email verified successfully for:", submission.email);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Email verified successfully" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in verify-email-token function:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Verification failed. Please try again." 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
