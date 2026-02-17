"use client"

import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { HowItWorks } from "@/components/landing/how-it-works"
import { BentoGrid } from "@/components/landing/bento-grid"
import { Integrations } from "@/components/landing/integrations"
import { Stats } from "@/components/landing/stats"
import { CTA } from "@/components/landing/cta"
import { Footer } from "@/components/landing/footer"

export default function Landing() {
  return (
    <div className="min-h-screen overflow-y-auto">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <BentoGrid />
        <Integrations />
        <Stats />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
