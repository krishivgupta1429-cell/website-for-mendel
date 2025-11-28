import { supabase } from "@/integrations/supabase/client";
import { validateEmail } from "./emailValidation";

export interface MenorahEntryData {
  fullName: string;
  email: string;
  areaCode: string;
  phoneNumber: string;
  numberOfAdults: string;
  numberOfChildren: string;
  indoorCelebration: string;
  sponsorships: string[];
  otherDonationAmount?: number | null;
}

export interface MenorahEntryResponse {
  success: boolean;
  entryId?: string;
  error?: string;
  needsVerification?: boolean;
}

/**
 * Generates a secure random verification token
 */
function generateVerificationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Submits a form entry to the database
 * @param formData - The form data from the RaffleForm component
 * @returns Promise with success status and entry ID or error message
 */
export async function submitEntry(
  formData: MenorahEntryData
): Promise<MenorahEntryResponse> {
  try {
    // Validation
    if (!formData.fullName || !formData.fullName.trim()) {
      return {
        success: false,
        error: "Full name is required",
      };
    }

    if (!formData.email || !formData.email.trim()) {
      return {
        success: false,
        error: "Email address is required",
      };
    }

    // Enhanced email validation with disposable domain checking
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) {
      return {
        success: false,
        error: emailValidation.error,
      };
    }

    // Calculate sponsorship amounts
    const sponsorshipOptions = [
      { id: "doughnut", label: "DOUGHNUT SPONSOR", amount: 36 },
      { id: "doughnut-gold", label: "DOUGHNUT GOLD SPONSOR", amount: 72 },
      { id: "doughnut-platinum", label: "DOUGHNUT PLATINUM SPONSOR", amount: 108 },
      { id: "menorah", label: "MENORAH SPONSOR", amount: 180 },
      { id: "menorah-gold", label: "MENORAH GOLD SPONSOR", amount: 360 },
      { id: "menorah-platinum", label: "MENORAH PLATINUM SPONSOR", amount: 540 },
    ];

    const wantsToDonate = formData.sponsorships.length > 0 || (formData.otherDonationAmount && formData.otherDonationAmount > 0);

    // Generate verification token
    const verificationToken = generateVerificationToken();

    // Generate full phone in E.164 format if both parts are provided
    // Strip formatting from phone number (in case of US format)
    const cleanedPhoneNumber = formData.phoneNumber ? formData.phoneNumber.replace(/\D/g, '') : '';
    const fullPhone = formData.areaCode && cleanedPhoneNumber 
      ? `${formData.areaCode.trim()}${cleanedPhoneNumber}`
      : null;

    // Prepare the database entry
    const entry = {
      full_name: formData.fullName.trim(),
      email: formData.email.trim().toLowerCase(),
      area_code: formData.areaCode.trim() || null,
      phone_number: formData.phoneNumber ? formData.phoneNumber.replace(/\D/g, '').trim() : null,
      full_phone: fullPhone,
      number_of_adults: parseInt(formData.numberOfAdults, 10),
      number_of_children: formData.numberOfChildren ? parseInt(formData.numberOfChildren, 10) : 0,
      indoor_celebration: formData.indoorCelebration || null,
      sponsorships: formData.sponsorships,
      wants_to_donate: wantsToDonate,
      verification_token: verificationToken,
      verification_sent_at: new Date().toISOString(),
      other_donation_amount: formData.otherDonationAmount && formData.otherDonationAmount > 0 ? formData.otherDonationAmount : null,
    };

    // Insert via Edge Function to bypass RLS
    const { data: insertData, error: insertError } = await supabase.functions.invoke('submit-form-entry', {
      body: entry,
    });

    if (insertError || !insertData?.id) {
      console.error("Error inserting form submission via function:", insertError);
      return {
        success: false,
        error: "Failed to submit your entry. Please try again.",
      };
    }

    const data = { id: insertData.id as string };


    // Send verification email
    try {
      const { error: emailError } = await supabase.functions.invoke('send-verification-email', {
        body: {
          email: formData.email.trim().toLowerCase(),
          name: formData.fullName.trim(),
          token: verificationToken,
        },
      });

      if (emailError) {
        console.error("Error sending verification email:", emailError);
      }
    } catch (emailError) {
      console.error("Error invoking send-verification-email function:", emailError);
    }

    console.log("Created form_submissions row with id:", data.id);

    return {
      success: true,
      entryId: data.id,
      needsVerification: wantsToDonate,
    };
  } catch (error) {
    console.error("Unexpected error submitting entry:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    };
  }
}
