import { useEffect, useState } from "react";
import FloatingParticles from "@/components/FloatingParticles";
import RaffleForm from "@/components/RaffleForm";
import MenorahCandles from "@/components/MenorahCandles";
import { usePerformanceLogger } from "@/hooks/use-performance-logger";
import wheelingTownCenterLogo from "@/assets/wheeling-town-center-logo.jpeg";
import walmartLogo from "@/assets/walmart-logo.png";
const GoldenFlameIcon = ({
  className = ""
}: {
  className?: string;
}) => <span className="inline-flex items-center justify-center">
    <svg className={`golden-flame-icon ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <path d="M12 21c-3.55 0-6.5-2.86-6.5-6.22 0-2.44 1.32-4.04 2.82-5.63 1.25-1.31 2.41-2.7 2.41-4.47 1.73 1.43 3.3 3.45 3.66 5.45 1.57.93 3.11 2.61 3.11 4.94C17.5 18.14 15.08 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 17.5c-1.6 0-2.9-1.26-2.9-2.86 0-1.02.54-1.93 1.34-2.68.63-.6 1.2-1.29 1.2-2.27 1.34.97 2.3 2.44 2.3 3.92 0 1.62-1.28 2.89-2.94 2.89Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
const Index = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Performance logging (dev only)
  usePerformanceLogger();
  useEffect(() => {
    // Check if mobile (≤768px)
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    checkMobile();
    mediaQuery.addEventListener('change', handleReducedMotionChange);

    // Debounced resize handler with requestAnimationFrame batching
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        requestAnimationFrame(checkMobile);
      }, 100);
    };
    window.addEventListener('resize', handleResize, {
      passive: true
    });

    // Debounced scroll handler (16ms = 60fps)
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Scroll handling logic if needed
      }, 16);
    };
    window.addEventListener('scroll', handleScroll, {
      passive: true
    });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      mediaQuery.removeEventListener('change', handleReducedMotionChange);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, []);
  return <div className="min-h-screen relative overflow-hidden">
      {/* Rich Dark Gradient Background with Animated Shimmer */}
      <div className="fixed inset-0 bg-shimmer -z-20" />
      
      {/* Additional depth layers - candle light gradients radiating from center */}
      <div className="fixed inset-0 -z-10">
        {/* Central glow behind menorah area - static on mobile, animated on desktop */}
        {isMobile ? <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-amber/15 via-gold/8 to-transparent opacity-50 mobile-glow-static" /> : <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-amber/20 via-gold/10 to-transparent blur-3xl opacity-60 ${!prefersReducedMotion ? 'animate-gentle-pulse' : ''}`} />}
        {/* Secondary warm glows - reduced on mobile */}
        {isMobile ? <>
            <div className="absolute top-1/3 left-1/4 w-[500px] h-[400px] bg-gradient-radial from-amber/10 via-transparent to-transparent opacity-25 mobile-glow-static" />
            <div className="absolute top-1/3 right-1/4 w-[500px] h-[400px] bg-gradient-radial from-gold/10 via-transparent to-transparent opacity-25 mobile-glow-static" />
          </> : <>
            <div className="absolute top-1/3 left-1/4 w-[500px] h-[400px] bg-gradient-radial from-amber/15 via-transparent to-transparent blur-3xl opacity-40" />
            <div className="absolute top-1/3 right-1/4 w-[500px] h-[400px] bg-gradient-radial from-gold/15 via-transparent to-transparent blur-3xl opacity-40" />
          </>}
        {/* Edge amber warmth */}
        <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-amber/10 via-transparent to-transparent" />
      </div>
      
      {/* Floating Particles - hidden on mobile */}
      {!isMobile && <FloatingParticles />}

      {/* Content */}
      <div className="relative z-10 container max-w-2xl mx-auto px-4 py-12 md:py-16">
        {/* B"H - Top Left Corner */}
        <div className="absolute top-4 left-4 md:top-6 md:left-6">
          <span className="text-white/90 text-sm md:text-base font-light tracking-wide">B"H</span>
        </div>

        {/* Hosted by banner */}
        <div className="text-center mb-6 animate-fade-in">
          <div className="inline-flex items-center gap-3 px-8 py-2 rounded-full bg-gradient-to-r from-gold/10 via-amber/10 to-gold/10 border border-gold/30 backdrop-blur-sm">
            <GoldenFlameIcon className="w-5 h-5 md:w-6 md:h-6" />
            <span className="text-sm font-medium text-foreground/90 tracking-wider">CHABAD OF WHEELING INVITES YOU TO</span>
            <GoldenFlameIcon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
        </div>


        {/* Hero Section */}
        <div className="hero-section text-center mb-12 animate-fade-in">
          {/* Menorah with Blended Candle Effect */}
          <div className="mb-8 flex justify-center">
            <div className={`relative w-full max-w-[400px] md:max-w-[500px] ${!isMobile && !prefersReducedMotion ? 'animate-float' : ''}`}>
              <MenorahCandles isMobile={isMobile} prefersReducedMotion={prefersReducedMotion} />
            </div>
          </div>

          {/* Title with Golden Gradient */}
          <h1 className={`text-4xl md:text-6xl font-bold mb-4 text-gold-gradient bg-[length:200%_auto] drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] ${!isMobile && !prefersReducedMotion ? 'animate-shimmer' : ''}`}>Chanukah Celebration</h1>

          {/* Date, Time and Location */}
          <div className="flex flex-col items-center my-4 md:my-6">
            <p className={`text-2xl md:text-3xl text-gold-gradient font-medium tracking-wide bg-[length:200%_auto] ${!isMobile && !prefersReducedMotion ? 'animate-shimmer' : ''}`}>Sunday, December 14 • 4:00 PM</p>
            <p className={`text-lg md:text-xl text-gold-gradient font-light tracking-wide bg-[length:200%_auto] mt-1 opacity-90 ${!isMobile && !prefersReducedMotion ? 'animate-shimmer' : ''}`}>
          </p>
          </div>

          {/* Subtitle */}
          <p className={`text-xl md:text-2xl text-gold-gradient font-light tracking-wide bg-[length:200%_auto] ${!isMobile && !prefersReducedMotion ? 'animate-shimmer' : ''}`}>Public Menorah Lighting At Wheeling Town Center.</p>

          {/* Weather Update Banner */}
          <div className="mt-6 mx-auto max-w-xl">
            <div className="px-5 py-4 rounded-2xl bg-background/40 backdrop-blur-sm border border-gold/40 shadow-[0_0_15px_rgba(255,215,0,0.15)]">
              <p className="text-sm md:text-base text-ivory/90 leading-relaxed text-center">
                <span className="font-bold text-gold">⚠️ Weather Update:</span>{' '}
                If cold, snow, or wind prevent an outdoor lighting, we will seamlessly move the menorah lighting indoors. All RSVPs will receive a quick update if anything changes.
              </p>
            </div>
          </div>
        </div>

        {/* Form Card with Glassmorphism */}
        <div className="relative animate-fade-in animation-delay-200">
          {/* Multiple glow layers behind card for depth - simplified on mobile */}
          {isMobile ? <div className="absolute -inset-4 bg-gradient-to-br from-gold/20 via-amber/15 to-gold/15 rounded-3xl opacity-30 mobile-glow-static" /> : <>
              <div className={`absolute -inset-6 bg-gradient-to-br from-gold/30 via-amber/20 to-gold/20 rounded-3xl blur-3xl opacity-40 ${!prefersReducedMotion ? 'animate-gentle-pulse' : ''}`} />
              <div className="absolute -inset-4 bg-gradient-to-br from-gold/20 via-amber/15 to-transparent rounded-3xl blur-2xl opacity-30" />
            </>}
          
          {/* Main Glass Card */}
          <div className="relative glass-card glass-card-mobile rounded-3xl shadow-2xl shadow-mobile p-8 md:p-12 border border-gold/20">
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-gold/5 via-transparent to-amber/5 pointer-events-none" />
            
            {/* Decorative top accent */}
            <div className="flex justify-center mb-8 relative z-10">
              <div className={`text-3xl ${!isMobile && !prefersReducedMotion ? 'animate-candle-flicker' : ''}`}>✨</div>
            </div>

            <div className="relative z-10">
              <RaffleForm />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center animate-fade-in space-y-6 py-6 content-offscreen">
          {/* Location */}
          <div className="space-y-4">
            <div>
              <p className="text-lg text-gold font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]">The Menorah Lighting will take place at:</p>
              <p className="text-lg text-gold font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]">375 W Dundee Rd, Wheeling, IL 60090</p>
            </div>
            <div>
              <p className="text-lg text-gold font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]">
                The Indoor Celebration will take place at:
              </p>
              <p className="text-lg text-gold font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]">
                100 Community Blvd., Rooms 204–205, Wheeling, IL 60090
              </p>
            </div>
          </div>
          
          {/* Powered by Techrupt */}
          <div className="mb-4">
            <div className="relative inline-block">
              <p className="text-xl font-semibold tracking-wide" style={{
              color: '#FFC670',
              textShadow: '0 0 12px rgba(255, 200, 100, 0.45)'
            }}>
                Powered by Techrupt Innovations
              </p>
              {/* Elegant underline accent */}
              <div className="mx-auto mt-2 w-3/5 h-px" style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 198, 112, 0.4) 50%, transparent)',
              boxShadow: '0 0 4px rgba(255, 200, 100, 0.3)'
            }}></div>
            </div>
          </div>
          
          {/* Main message */}
          <p className="text-lg text-gold font-light tracking-wide drop-shadow-[0_0_10px_rgba(255,215,0,0.3)] text-center md:text-lg">
            May the lights of Chanukah bring warmth and joy to your home
          </p>
          
          {/* Sponsor credit */}
          <p className="text-sm md:text-base font-semibold text-ivory/90 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] tracking-wide">
            Made by Techrupt Innovations. Need tech for your idea?{' '}
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSf1d7_AmmXfYFQ1U47oAYKWS-AM_BIbbV-IBUpnCAKhSCo0IQ/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer" className="text-gold-light hover:underline transition-all duration-200">
              Click here
            </a>.
          </p>

          {/* Chanukah Logo */}
          <div className="mt-8 flex justify-center">
            <img src="/chanukah-logo-mendel.jpeg" alt="Chanukah Logo" className="w-32 h-auto md:w-40 rounded-lg opacity-90" />
          </div>

          {/* Sponsors Strip */}
          <div className="mt-12 pt-8 border-t border-gold/20">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12">
              {/* Platinum Sponsor - Wheeling Town Center */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-32 sm:w-40 sm:h-40 bg-white rounded-lg flex items-center justify-center p-3 shadow-lg">
                  <img 
                    src={wheelingTownCenterLogo} 
                    alt="Wheeling Town Center" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-xs sm:text-sm font-semibold tracking-widest text-ivory/80 uppercase">
                  Platinum Sponsor
                </span>
              </div>

              {/* Gold Sponsor - Walmart */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-32 sm:w-40 sm:h-40 bg-white rounded-lg flex items-center justify-center p-4 shadow-lg">
                  <img 
                    src={walmartLogo} 
                    alt="Walmart" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-xs sm:text-sm font-semibold tracking-widest text-ivory/80 uppercase">
                  Gold Sponsor
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>;
};
export default Index;