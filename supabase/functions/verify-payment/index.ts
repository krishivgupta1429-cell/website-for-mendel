import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-PAYMENT-LIVE] ${step}${detailsStr}`);
};

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

  return lines.join("<br>");
}

// Send combined confirmation + donation receipt email via Brevo API
async function sendDonorConfirmationEmail(
  fullName: string,
  email: string,
  donationData: {
    amountCents: number;
    sponsorships: string[];
    donationDate: string;
    transactionId: string;
  },
  attendeeData: {
    numAdults: number;
    numChildren: number;
    indoorCelebration: string | null;
  }
): Promise<void> {
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) {
      throw new Error("Missing BREVO_API_KEY");
    }

    // Format amount from cents to dollars
    const amountDollars = donationData.amountCents / 100;
    const formattedAmount = Number.isInteger(amountDollars)
      ? `$${amountDollars}`
      : `$${amountDollars.toFixed(2)}`;

    // Format donation date in America/Chicago timezone
    const date = new Date(donationData.donationDate);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    });

    // Build sponsorships string
    const sponsorshipsText = donationData.sponsorships && donationData.sponsorships.length > 0
      ? donationData.sponsorships.join(", ")
      : "";

    // Build donation details line
    let donationDetailsLine = `• ${formattedAmount}`;
    if (sponsorshipsText) {
      donationDetailsLine += ` — ${sponsorshipsText}`;
    }

    // Build attendee block
    const attendeeBlock = buildAttendeeBlock(
      attendeeData.numAdults,
      attendeeData.numChildren,
      attendeeData.indoorCelebration
    );

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

<p><strong>Donation Acknowledgment</strong><br>
Your kindness truly adds to the warmth and spirit of this celebration.</p>

<p><strong>Donation Details:</strong><br>
${donationDetailsLine}<br>
• Date: ${formattedDate}<br>
• Reference: ${donationData.transactionId}</p>

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

    console.log(`[donor-confirmation-email] Attempting to send to ${email}...`);

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
    
    console.log(`[donor-confirmation-email] Sent successfully to ${email}`);
  } catch (error) {
    console.error(`[donor-confirmation-email] Error: ${error}`);
    // Don't throw - we don't want email failures to block payment verification
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    logStep("Starting payment verification", { sessionId: session_id });

    if (!session_id) {
      logStep("ERROR: Missing session_id parameter");
      throw new Error("Missing session_id parameter");
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("ERROR: STRIPE_SECRET_KEY not configured");
      throw new Error("Stripe not configured");
    }

    logStep("Using LIVE mode Stripe key");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    logStep("Retrieved session from Stripe", {
      id: session.id,
      payment_status: session.payment_status,
      status: session.status,
      amount_total: session.amount_total,
      livemode: session.livemode,
    });

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find the form submission by checkout session ID
    const { data: submission, error: findError } = await supabaseAdmin
      .from("form_submissions")
      .select("id, wants_to_donate, payment_status, full_name, email, sponsorships, created_at, number_of_adults, number_of_children, indoor_celebration")
      .eq("stripe_checkout_session_id", session_id)
      .maybeSingle();

    if (findError) {
      logStep("ERROR: Failed to find form submission", { error: findError });
      throw findError;
    }

    if (!submission) {
      logStep("ERROR: No form submission found", { sessionId: session_id });
      throw new Error("Form submission not found");
    }

    logStep("Found form submission", { 
      submissionId: submission.id,
      wantsToDonate: submission.wants_to_donate,
      currentStatus: submission.payment_status
    });

    // Only update if wants_to_donate is true
    if (!submission.wants_to_donate) {
      logStep("Submission does not want to donate, skipping update", { 
        submissionId: submission.id 
      });
      return new Response(
        JSON.stringify({
          payment_status: "none",
          message: "No donation requested",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Get payment intent details if available
    let paymentIntentId = null;
    if (session.payment_intent) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent as string
        );
        paymentIntentId = paymentIntent.id;
        logStep("Payment intent retrieved", { 
          paymentIntentId, 
          status: paymentIntent.status 
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logStep("ERROR: Failed to retrieve payment intent", { error });
      }
    }

    // Determine payment status
    let paymentStatus = "pending";
    if (session.payment_status === "paid") {
      paymentStatus = "success";
    } else if (session.payment_status === "unpaid") {
      paymentStatus = "failed";
    }

    const amountInCents = session.amount_total || 0;

    logStep("Preparing to update form submission", {
      submissionId: submission.id,
      paymentStatus,
      amountInCents,
      paymentIntentId,
    });

    // Update the form submission
    const { error: updateError } = await supabaseAdmin
      .from("form_submissions")
      .update({
        is_donor: paymentStatus === "success",
        stripe_customer_id: session.customer as string || null,
        stripe_payment_intent_id: paymentIntentId,
        payment_amount_cents: amountInCents,
        payment_status: paymentStatus,
      })
      .eq("id", submission.id);

    if (updateError) {
      logStep("ERROR: Failed to update form submission", { 
        submissionId: submission.id,
        error: updateError 
      });
      throw updateError;
    }

    logStep("Successfully updated form submission", { 
      submissionId: submission.id,
      paymentStatus 
    });

    // Send combined confirmation + donation receipt email if payment was successful
    if (paymentStatus === "success") {
      logStep("Payment successful, sending combined donor confirmation email", {
        email: submission.email,
        amount: amountInCents
      });
      
      sendDonorConfirmationEmail(
        submission.full_name,
        submission.email,
        {
          amountCents: amountInCents,
          sponsorships: submission.sponsorships || [],
          donationDate: submission.created_at,
          transactionId: paymentIntentId || session_id,
        },
        {
          numAdults: submission.number_of_adults || 0,
          numChildren: submission.number_of_children || 0,
          indoorCelebration: submission.indoor_celebration,
        }
      ).catch(err => {
        logStep("ERROR: Donor confirmation email failed but continuing", { error: err });
      });
    }

    return new Response(
      JSON.stringify({
        payment_status: paymentStatus,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_email,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    logStep("ERROR: Payment verification failed", { 
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
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
