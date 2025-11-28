import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { submitEntry } from "@/lib/submitEntry";
import { validateEmail } from "@/lib/emailValidation";
import { supabase } from "@/integrations/supabase/client";
const RaffleForm = () => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    areaCode: "+1",
    phoneNumber: "",
    numberOfAdults: "",
    numberOfChildren: "",
    indoorCelebration: "",
    sponsorships: [] as string[],
    otherDonationAmount: null as number | null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string>("");
  const [areaCodeError, setAreaCodeError] = useState<string>("");
  const [phoneNumberError, setPhoneNumberError] = useState<string>("");

  // Phone format mapping for different countries
  const phoneFormats: Record<string, {
    placeholder: string;
    digits: number;
  }> = {
    '+1': {
      placeholder: '(123) 456-7890',
      digits: 10
    },
    // US/Canada
    '+44': {
      placeholder: '7123 456789',
      digits: 10
    },
    // UK
    '+91': {
      placeholder: '98765 43210',
      digits: 10
    },
    // India
    '+61': {
      placeholder: '412 345 678',
      digits: 9
    } // Australia
  };

  // Get current format based on area code
  const currentFormat = phoneFormats[formData.areaCode] || {
    placeholder: 'Phone number',
    digits: 15
  };

  // Sponsorship options with amounts
  const sponsorshipOptions = [{
    id: "doughnut",
    label: "DOUGHNUT SPONSOR",
    amount: 36
  }, {
    id: "doughnut-gold",
    label: "DOUGHNUT GOLD SPONSOR",
    amount: 72
  }, {
    id: "doughnut-platinum",
    label: "DOUGHNUT PLATINUM SPONSOR",
    amount: 108
  }, {
    id: "menorah",
    label: "MENORAH SPONSOR",
    amount: 180
  }, {
    id: "menorah-gold",
    label: "MENORAH GOLD SPONSOR",
    amount: 360
  }, {
    id: "menorah-platinum",
    label: "MENORAH PLATINUM SPONSOR",
    amount: 540
  }];

  // Calculate total sponsorship amount including other donation
  const sponsorshipTotal = formData.sponsorships.reduce((total, sponsorshipId) => {
    const option = sponsorshipOptions.find(opt => opt.id === sponsorshipId);
    return total + (option?.amount || 0);
  }, 0) + (formData.otherDonationAmount || 0);

  // Handle other donation amount change
  const handleOtherDonationChange = (value: string) => {
    // Remove any non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '');
    // Parse as number, allow empty to set to null
    if (cleaned === '' || cleaned === '.') {
      setFormData({ ...formData, otherDonationAmount: null });
    } else {
      const numValue = parseFloat(cleaned);
      // Only set if it's a valid positive number
      if (!isNaN(numValue) && numValue >= 0) {
        setFormData({ ...formData, otherDonationAmount: Math.round(numValue) });
      }
    }
  };

  // Handle sponsorship checkbox change
  const handleSponsorshipChange = (sponsorshipId: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        sponsorships: [...formData.sponsorships, sponsorshipId]
      });
    } else {
      const newSponsorships = formData.sponsorships.filter(id => id !== sponsorshipId);
      setFormData({
        ...formData,
        sponsorships: newSponsorships
      });
    }
  };

  // Handle email validation
  const handleEmailChange = (email: string) => {
    setFormData({
      ...formData,
      email
    });
    if (email.trim()) {
      const validation = validateEmail(email);
      if (!validation.valid) {
        setEmailError(validation.error || "");
      } else {
        setEmailError("");
      }
    } else {
      setEmailError("");
    }
  };

  // Handle area code validation
  const handleAreaCodeChange = (value: string) => {
    // Only allow + at the beginning and digits, max 4 characters
    const cleaned = value.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+') || cleaned === '') {
      const areaCode = cleaned.slice(0, 4);
      setFormData({
        ...formData,
        areaCode
      });
      if (areaCode && areaCode.length < 2) {
        setAreaCodeError("Area code must be at least 2 characters");
      } else if (areaCode && !areaCode.startsWith('+')) {
        setAreaCodeError("Area code must start with +");
      } else {
        setAreaCodeError("");
      }

      // Clear phone number error when area code changes (format may have changed)
      if (phoneNumberError) {
        setPhoneNumberError("");
      }
    }
  };

  // Handle phone number validation with US formatting
  const handlePhoneNumberChange = (value: string) => {
    // Strip all non-digit characters
    const digitsOnly = value.replace(/\D/g, '');

    // For US/Canada (+1), limit to exactly 10 digits and format as (XXX) XXX-XXXX
    if (formData.areaCode === '+1') {
      // Limit to 10 digits max
      const limited = digitsOnly.slice(0, 10);
      let formatted = limited;
      const len = limited.length;
      if (len <= 2) {
        // 1-2 digits: show as-is (e.g., "4", "43")
        formatted = limited;
      } else if (len === 3) {
        // 3 digits: add parentheses (e.g., "(434)")
        formatted = `(${limited})`;
      } else if (len <= 6) {
        // 4-6 digits: (XXX) X... (e.g., "(434) 3", "(434) 334")
        formatted = `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
      } else {
        // 7-10 digits: (XXX) XXX-X... (e.g., "(434) 334-3", "(434) 334-3456")
        formatted = `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
      }
      setFormData({
        ...formData,
        phoneNumber: formatted
      });
      setPhoneNumberError("");
    } else {
      // For other countries, enforce max length based on current format
      if (digitsOnly.length <= currentFormat.digits) {
        setFormData({
          ...formData,
          phoneNumber: digitsOnly
        });
        setPhoneNumberError("");
      }
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!formData.email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Email validation
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) {
      setEmailError(emailValidation.error);
      toast.error("Invalid email", {
        description: emailValidation.error
      });
      return;
    }

    // Phone validation with format-specific rules
    if (formData.phoneNumber) {
      const cleanedNumber = formData.phoneNumber.replace(/\D/g, "");

      // Special validation for US numbers
      if (formData.areaCode === '+1') {
        if (cleanedNumber.length !== 10) {
          setPhoneNumberError("Please enter a valid 10-digit US phone number.");
          toast.error("Invalid Phone Number", {
            description: "Please enter a valid 10-digit US phone number."
          });
          return;
        }
      } else {
        // Validate based on current format for other countries
        if (cleanedNumber.length < 6) {
          setPhoneNumberError("Phone number must be at least 6 digits");
          toast.error("Invalid Phone Number", {
            description: "Phone number must be at least 6 digits"
          });
          return;
        }
        if (cleanedNumber.length > currentFormat.digits) {
          setPhoneNumberError(`Phone number must be at most ${currentFormat.digits} digits for ${formData.areaCode}`);
          toast.error("Invalid Phone Number", {
            description: `Phone number must be at most ${currentFormat.digits} digits for ${formData.areaCode}`
          });
          return;
        }
      }
    }

    // Validate area code if provided
    if (formData.areaCode && !formData.areaCode.startsWith('+')) {
      setAreaCodeError("Area code must start with +");
      toast.error("Invalid Area Code", {
        description: "Area code must start with + (e.g., +1, +44, +91)"
      });
      return;
    }

    // If both area code and phone number are provided together or both empty, that's ok
    // But if only one is provided, show error
    if (formData.areaCode && !formData.phoneNumber || !formData.areaCode && formData.phoneNumber) {
      if (!formData.phoneNumber) {
        setPhoneNumberError("Please enter a phone number");
        toast.error("Incomplete Phone Number", {
          description: "Please enter both area code and phone number"
        });
      }
      if (!formData.areaCode) {
        setAreaCodeError("Please enter an area code");
        toast.error("Incomplete Phone Number", {
          description: "Please enter both area code and phone number"
        });
      }
      return;
    }

    // Validate number of adults
    if (!formData.numberOfAdults) {
      toast.error("Please select number of adults attending");
      return;
    }

    // Validate indoor celebration selection
    if (!formData.indoorCelebration) {
      toast.error("Please select if you will attend the indoor celebration");
      return;
    }

    // Set submitting state
    setIsSubmitting(true);
    try {
      // Prepare sponsorships array - add OTHER_DONATION if applicable
      const sponsorshipsToSubmit = [...formData.sponsorships];
      if (formData.otherDonationAmount && formData.otherDonationAmount > 0) {
        sponsorshipsToSubmit.push('OTHER_DONATION');
      }

      // Check if user has sponsorships or other donation (wants to donate)
      const hasDonation = sponsorshipsToSubmit.length > 0;
      if (hasDonation) {
        // STRIPE PAYMENT FLOW
        // First, save form submission to get an ID
        const response = await submitEntry({
          fullName: formData.fullName,
          email: formData.email,
          areaCode: formData.areaCode,
          phoneNumber: formData.phoneNumber,
          numberOfAdults: formData.numberOfAdults,
          numberOfChildren: formData.numberOfChildren,
          indoorCelebration: formData.indoorCelebration,
          sponsorships: sponsorshipsToSubmit,
          otherDonationAmount: formData.otherDonationAmount
        });
        if (!response.success || !response.entryId) {
          toast.error("Submission failed", {
            description: response.error || "Please try again."
          });
          return;
        }

        // Calculate total amount
        const totalAmount = sponsorshipTotal;

        // Create Stripe checkout session
        const {
          data: checkoutData,
          error: checkoutError
        } = await supabase.functions.invoke("create-checkout-session", {
          body: {
            formSubmissionId: response.entryId,
            amount: totalAmount,
            email: formData.email,
            fullName: formData.fullName
          }
        });
        if (checkoutError || !checkoutData?.url) {
          console.error("Checkout error:", checkoutError);
          toast.error("Payment setup failed", {
            description: "Unable to create payment session. Please try again."
          });
          return;
        }

        // Redirect to Stripe checkout
        window.location.href = checkoutData.url;
      } else {
        // DIRECT SUBMISSION (NO PAYMENT)
        const response = await submitEntry({
          fullName: formData.fullName,
          email: formData.email,
          areaCode: formData.areaCode,
          phoneNumber: formData.phoneNumber,
          numberOfAdults: formData.numberOfAdults,
          numberOfChildren: formData.numberOfChildren,
          indoorCelebration: formData.indoorCelebration,
          sponsorships: sponsorshipsToSubmit,
          otherDonationAmount: formData.otherDonationAmount
        });
        if (response.success) {
          toast.success("Success! ✨", {
            description: "Thank you for being part of our community celebration."
          });

          // Reset form
          setFormData({
            fullName: "",
            email: "",
            areaCode: "+1",
            phoneNumber: "",
            numberOfAdults: "",
            numberOfChildren: "",
            indoorCelebration: "",
            sponsorships: [],
            otherDonationAmount: null
          });
          setEmailError("");
          setAreaCodeError("");
          setPhoneNumberError("");
        } else {
          toast.error("Submission failed", {
            description: response.error || "Please try again."
          });
        }
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Submission failed", {
        description: "An unexpected error occurred. Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  return <form onSubmit={handleSubmit} className="space-y-8 md:space-y-8 w-full form-mobile">
      <div className="space-y-4 md:space-y-6">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-foreground font-medium text-base">
            Full Name <span className="text-gold">*</span>
          </Label>
          <Input id="fullName" placeholder="Enter your full name" value={formData.fullName} onChange={e => setFormData({
          ...formData,
          fullName: e.target.value
        })} required className="bg-input/80 backdrop-blur-sm border-border/60 text-foreground placeholder:text-foreground/50 focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)]" />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground font-medium text-base">
            Email Address <span className="text-gold">*</span>
          </Label>
          <Input id="email" type="email" placeholder="your.email@example.com" value={formData.email} onChange={e => handleEmailChange(e.target.value)} required className={`bg-input/80 backdrop-blur-sm border-border/60 text-foreground placeholder:text-foreground/50 focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)] ${emailError ? "border-red-500 focus:border-red-500 focus:ring-red-500/40" : ""}`} />
          {emailError && <p className="text-sm text-red-500 mt-1">{emailError}</p>}
        </div>

        {/* Phone - Area Code and Number */}
        <div className="space-y-2">
          <Label className="text-foreground font-medium text-base">
            Phone Number <span className="text-gold">*</span>
          </Label>
          <div className="flex flex-row gap-3">
            {/* Area Code */}
            <div className="w-24 flex-shrink-0">
              <Label htmlFor="areaCode" className="text-xs text-foreground/70 mb-1 block">
                Country Code
              </Label>
              <Input id="areaCode" type="text" placeholder="+1" value={formData.areaCode} onChange={e => handleAreaCodeChange(e.target.value)} required maxLength={4} className={`bg-input/80 backdrop-blur-sm border-border/60 text-foreground placeholder:text-foreground/50 focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)] ${areaCodeError ? "border-red-500 focus:border-red-500 focus:ring-red-500/40" : ""}`} />
              {areaCodeError && <p className="text-xs text-red-500 mt-1">{areaCodeError}</p>}
            </div>
            {/* Phone Number */}
            <div className="flex-1">
              <Label htmlFor="phoneNumber" className="text-xs text-foreground/70 mb-1 block">
                Number
              </Label>
              <Input id="phoneNumber" type="tel" placeholder={currentFormat.placeholder} value={formData.phoneNumber} onChange={e => handlePhoneNumberChange(e.target.value)} required inputMode="numeric" className={`bg-input/80 backdrop-blur-sm border-border/60 text-foreground placeholder:text-foreground/50 focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)] ${phoneNumberError ? "border-red-500 focus:border-red-500 focus:ring-red-500/40" : ""}`} />
              {phoneNumberError && <p className="text-xs text-red-500 mt-1">{phoneNumberError}</p>}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center justify-center py-4">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
          <div className="mx-4 text-2xl animate-candle-flicker">✨</div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>

        {/* Attendance Section */}
        <div className="space-y-4">
          <Label className="text-foreground font-medium text-base">
            How many people will be attending?
          </Label>
          
          {/* Number of Adults */}
          <div className="space-y-2">
            <Label htmlFor="numberOfAdults" className="text-foreground font-medium text-sm">
              Number of Adults <span className="text-gold">*</span>
            </Label>
            <Select value={formData.numberOfAdults} onValueChange={value => setFormData({
            ...formData,
            numberOfAdults: value
          })} required>
              <SelectTrigger id="numberOfAdults" className="bg-input/80 backdrop-blur-sm border-border/60 text-foreground focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)]">
                <SelectValue placeholder="Select number of adults" />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-sm border-border/60 z-50">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => <SelectItem key={num} value={num.toString()}>
                    {num}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Number of Children */}
          <div className="space-y-2">
            <Label htmlFor="numberOfChildren" className="text-foreground font-medium text-sm">
              Number of Children (Optional)
            </Label>
            <Select value={formData.numberOfChildren} onValueChange={value => setFormData({
            ...formData,
            numberOfChildren: value
          })}>
              <SelectTrigger id="numberOfChildren" className="bg-input/80 backdrop-blur-sm border-border/60 text-foreground focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)]">
                <SelectValue placeholder="Select number of children" />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-sm border-border/60 z-50">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => <SelectItem key={num} value={num.toString()}>
                    {num}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center justify-center py-4">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
          <div className="mx-4 text-2xl animate-candle-flicker">✨</div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>

        {/* Indoor Chanukah Celebration Section */}
        <div className="space-y-5">
          {/* Heading - Centered above the 3-column block */}
          <h3 className="text-foreground font-semibold text-lg text-center md:text-center mb-2">
            Indoor Chanukah Celebration
          </h3>
          
          {/* Mobile: Heading → Text → Images stacked | Desktop: 3-column layout */}
          
          {/* Mobile layout: Text first, then images */}
          <div className="md:hidden space-y-4">
            {/* Description text */}
            <p className="text-foreground/90 text-sm leading-relaxed text-center px-2">
              After the lighting, join us at the Wheeling Park District for a juggling & comedy show, caricature drawings, hot latkes, fresh donuts, and chocolate gelt — fun for the whole family.
            </p>
            
            {/* Andy Head */}
            <div className="flex flex-col items-center">
              <img 
                src="/Andy-Head.jpg" 
                alt="Andy Head - Juggling & Comedy Show" 
                className="w-24 h-24 object-cover rounded-xl border border-gold/30"
              />
              <p className="text-center text-xs mt-2 leading-tight" style={{ color: '#FFCC66' }}>
                Juggling & comedy show with Andy Head
              </p>
            </div>
            
            {/* Marlene Goodman */}
            <div className="flex flex-col items-center">
              <img 
                src="/Marlene-goodman.jpg" 
                alt="Marlene Goodman - Caricature Drawing" 
                className="w-24 h-24 object-cover rounded-xl border border-gold/30"
              />
              <p className="text-center text-xs mt-2 leading-tight" style={{ color: '#FFCC66' }}>
                Caricature drawing by Marlene Goodman
              </p>
            </div>
          </div>
          
          {/* Desktop layout: 3-column grid */}
          <div className="hidden md:grid md:grid-cols-[1fr_2fr_1fr] md:gap-6 md:items-start">
            {/* Column 1: Andy Head - Left side */}
            <div className="flex flex-col items-center">
              <img 
                src="/Andy-Head.jpg" 
                alt="Andy Head - Juggling & Comedy Show" 
                className="w-28 h-28 object-cover rounded-xl border border-gold/30"
              />
              <p className="text-center text-xs mt-2 leading-tight" style={{ color: '#FFCC66' }}>
                Juggling & comedy show with Andy Head
              </p>
            </div>
            
            {/* Column 2: Description text - Center */}
            <div className="flex items-start justify-center h-full pt-1">
              <p className="text-foreground/90 text-sm leading-relaxed text-left max-w-[480px]">
                After the lighting, join us at the Wheeling Park District for a juggling & comedy show, caricature drawings, hot latkes, fresh donuts, and chocolate gelt — fun for the whole family.
              </p>
            </div>
            
            {/* Column 3: Marlene Goodman - Right side */}
            <div className="flex flex-col items-center">
              <img 
                src="/Marlene-goodman.jpg" 
                alt="Marlene Goodman - Caricature Drawing" 
                className="w-28 h-28 object-cover rounded-xl border border-gold/30"
              />
              <p className="text-center text-xs mt-2 leading-tight" style={{ color: '#FFCC66' }}>
                Caricature drawing by Marlene Goodman
              </p>
            </div>
          </div>
          
          <div className="space-y-2 pt-2">
            <Label className="text-foreground font-medium text-base">
              Please select one option: <span className="text-gold">*</span>
            </Label>
            <RadioGroup
              value={formData.indoorCelebration}
              onValueChange={(value) => setFormData({ ...formData, indoorCelebration: value })}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 group">
                <RadioGroupItem 
                  value="attending" 
                  id="indoor-attending"
                  className="border-gold/60 text-gold data-[state=checked]:border-gold data-[state=checked]:bg-gold focus-visible:ring-2 focus-visible:ring-gold/40"
                />
                <Label 
                  htmlFor="indoor-attending" 
                  className="font-normal cursor-pointer text-foreground/90 group-hover:text-gold transition-colors duration-200"
                >
                  We will attend the indoor celebration.
                </Label>
              </div>
              <div className="flex items-center space-x-3 group">
                <RadioGroupItem 
                  value="not-attending" 
                  id="indoor-not-attending"
                  className="border-gold/60 text-gold data-[state=checked]:border-gold data-[state=checked]:bg-gold focus-visible:ring-2 focus-visible:ring-gold/40"
                />
                <Label 
                  htmlFor="indoor-not-attending" 
                  className="font-normal cursor-pointer text-foreground/90 group-hover:text-gold transition-colors duration-200"
                >
                  Sorry, we can't make it.
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center justify-center py-4">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
          <div className="mx-4 text-2xl animate-candle-flicker">✨</div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        </div>

        {/* Support */}
        <div className="space-y-4">
          {/* Intro line */}
          <p className="text-foreground font-medium text-base text-left">This free community event is made possible by community friends who believe in sharing joy and light. Please consider taking part.</p>
          
          {/* Sponsorship Section */}
          <div id="sponsorship-section" className="space-y-4 mt-4 pt-4 border-t border-gold/20 content-offscreen" role="region" aria-labelledby="sponsorship-label">
              {/* Label and Checkboxes Layout */}
              <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6 sponsorship-container">
                {/* Left Label */}
                <Label id="sponsorship-label" className="text-foreground font-semibold text-base md:text-base whitespace-nowrap pt-1 sponsorship-label">
                  I would like to be a
          </Label>
                
                {/* Right: Vertical List of Checkboxes */}
                <div className="flex-1 space-y-2 md:space-y-2.5 w-full sponsorship-list">
                  {sponsorshipOptions.map(option => {
                const isChecked = formData.sponsorships.includes(option.id);
                return <div key={option.id} className={`flex items-center space-x-3 group sponsorship-card transition-opacity duration-200 ${isChecked ? "border-gold bg-gold/15" : "border-gold/30 bg-gold/5"}`}>
                        <Checkbox id={`sponsorship-${option.id}`} checked={isChecked} onCheckedChange={checked => {
                    handleSponsorshipChange(option.id, checked as boolean);
                  }} className="border-gold/60 data-[state=checked]:bg-gold data-[state=checked]:border-gold ring-offset-background focus-visible:ring-2 focus-visible:ring-gold/40 transition-opacity duration-200 shrink-0 sponsorship-checkbox" aria-label={`${option.label} - $${option.amount}`} />
                        <Label htmlFor={`sponsorship-${option.id}`} className="font-normal cursor-pointer text-foreground/90 group-hover:text-gold transition-colors duration-200 flex-1 flex items-center justify-between sponsorship-label-text min-h-[44px]">
                          <span className={`${isChecked ? "text-gold font-medium" : ""} sponsorship-title`}>{option.label}</span>
                          <span className={`font-semibold ml-4 whitespace-nowrap ${isChecked ? "text-gold" : "text-gold/80"} sponsorship-price`}>
                            ${option.amount}
                          </span>
              </Label>
                      </div>;
              })}
                </div>
              </div>
              
              {/* Other Donation Input */}
              <div className="space-y-2 pt-4">
                <Label className="text-foreground font-semibold text-base tracking-wide">
                  OTHER DONATION
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold font-semibold text-lg">
                    $
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter other amount"
                    value={formData.otherDonationAmount !== null ? formData.otherDonationAmount.toString() : ''}
                    onChange={(e) => handleOtherDonationChange(e.target.value)}
                    className="pl-8 bg-input/80 backdrop-blur-sm border-border/60 text-foreground placeholder:text-foreground/50 focus:border-gold focus:ring-2 focus:ring-gold/40 transition-all duration-300 hover:border-gold/60 hover:shadow-[0_0_15px_rgba(255,215,0,0.2)] h-12 rounded-xl"
                  />
                </div>
              </div>
              
              {/* Total Charge Row */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-gold/30">
                <span className="text-foreground font-semibold text-base md:text-lg">Total Charge</span>
                <span className="text-gold font-bold text-lg md:text-xl">
                  ${sponsorshipTotal.toFixed(2)} USD
                </span>
              </div>
              
              {/* Hidden inputs for form submission */}
              <input type="hidden" name="selected_sponsorships" value={formData.sponsorships.map(id => sponsorshipOptions.find(opt => opt.id === id)?.label).filter(Boolean).join(", ")} />
              <input type="hidden" name="sponsorship_total_usd" value={sponsorshipTotal.toFixed(2)} />
            </div>
        </div>
      </div>

      {/* Submit */}
      <div className="pt-4">
        <Button type="submit" disabled={isSubmitting} className="w-full relative overflow-hidden bg-gradient-to-r from-gold via-amber to-gold text-background font-semibold text-lg py-6 rounded-xl shadow-lg hover:shadow-[0_0_40px_rgba(255,215,0,0.6)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border border-gold/30 group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
          <span className="relative z-10">
            {isSubmitting ? "Processing..." : (formData.sponsorships.length > 0 || (formData.otherDonationAmount && formData.otherDonationAmount > 0)) ? "Pay Now" : "Submit Entry"}
          </span>
          {/* Ripple effect on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </Button>
      </div>
    </form>;
};
export default RaffleForm;