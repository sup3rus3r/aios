"use client"

import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, Bot, Workflow, Cpu, Zap, Shield, MessageSquare } from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { useEffect, useRef } from "react"

/* ------------------------------------------------------------------ */
/*  Animated canvas background – network of orbiting connected nodes  */
/* ------------------------------------------------------------------ */
function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let width = 0
    let height = 0

    const nodes: { x: number; y: number; vx: number; vy: number; r: number; pulse: number; speed: number }[] = []
    const NODE_COUNT = 60
    const CONNECTION_DIST = 180

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const init = () => {
      resize()
      nodes.length = 0
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: Math.random() * 2 + 1,
          pulse: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.01,
        })
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      // Update positions
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        n.pulse += n.speed
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DIST) {
            const opacity = (1 - dist / CONNECTION_DIST) * 0.12
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const glow = Math.sin(n.pulse) * 0.3 + 0.7
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * glow, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(148, 163, 184, ${0.25 * glow})`
        ctx.fill()
      }

      animationId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener("resize", init)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", init)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Orbiting icon around center ring                                   */
/* ------------------------------------------------------------------ */
function OrbitingIcon({
  icon: Icon,
  delay,
  duration,
  radius,
  size = 36,
}: {
  icon: React.ComponentType<{ className?: string }>
  delay: number
  duration: number
  radius: number
  size?: number
}) {
  return (
    <motion.div
      className="absolute"
      style={{
        left: "50%",
        top: "50%",
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
      animate={{
        x: [
          Math.cos(0) * radius,
          Math.cos(Math.PI / 2) * radius,
          Math.cos(Math.PI) * radius,
          Math.cos((3 * Math.PI) / 2) * radius,
          Math.cos(Math.PI * 2) * radius,
        ],
        y: [
          Math.sin(0) * radius,
          Math.sin(Math.PI / 2) * radius,
          Math.sin(Math.PI) * radius,
          Math.sin((3 * Math.PI) / 2) * radius,
          Math.sin(Math.PI * 2) * radius,
        ],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <div
        className="flex items-center justify-center rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm shadow-lg"
        style={{ width: size, height: size }}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Hero                                                          */
/* ------------------------------------------------------------------ */
export function Hero() {
  const router = useRouter()

  return (
    <section className="relative min-h-dvh overflow-hidden flex items-center">
      {/* Animated network canvas */}
      <NetworkCanvas />

      {/* Coloured gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute left-1/2 top-1/4 -translate-x-1/2 h-[700px] w-[700px] rounded-full bg-chart-1/6 blur-[160px]"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-0 bottom-1/4 h-[500px] w-[500px] rounded-full bg-chart-5/6 blur-[140px]"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="absolute left-0 bottom-0 h-[400px] w-[400px] rounded-full bg-chart-2/5 blur-[120px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        />
      </div>

      {/* Radial vignette for depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_75%)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 sm:py-40 w-full">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left – Copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <Badge
                variant="outline"
                className="mb-6 gap-1.5 border-chart-1/30 bg-chart-1/5 px-3 py-1 text-xs font-medium text-chart-1"
              >
                <Sparkles className="h-3 w-3" />
                AI AGENT CONTROL PLANE
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl !leading-[1.1]"
            >
              Build, deploy &{" "}
              <span className="relative">
                <span className="bg-gradient-to-r from-chart-1 via-chart-5 to-chart-2 bg-clip-text text-transparent">
                  orchestrate
                </span>
                <motion.span
                  className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-gradient-to-r from-chart-1 via-chart-5 to-chart-2"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  style={{ transformOrigin: "left" }}
                />
              </span>
              <br />
              AI agents at scale
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              The unified control plane for your entire AI workforce. Connect any LLM,
              assemble multi-agent teams, automate complex workflows, and monitor
              everything from a single dashboard.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Button
                size="lg"
                className="cursor-pointer gap-2 px-8 text-base"
                onClick={() => router.push("/register")}
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="cursor-pointer px-8 text-base"
                onClick={() => router.push("/login")}
              >
                Sign In
              </Button>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> 2FA & RBAC
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Real-time streaming
              </span>
              <span className="flex items-center gap-1.5">
                <Workflow className="h-3.5 w-3.5" /> Workflow automation
              </span>
            </motion.div>
          </motion.div>

          {/* Right – Orbital visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative mx-auto hidden h-[420px] w-[420px] lg:block"
          >
            {/* Orbit rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-[320px] w-[320px] rounded-full border border-border/20" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-[220px] w-[220px] rounded-full border border-border/15" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-[120px] w-[120px] rounded-full border border-border/10" />
            </div>

            {/* Center logo */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/50 bg-card/80 shadow-2xl backdrop-blur-sm"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
              >
                <Cpu className="h-7 w-7 text-primary" />
              </motion.div>
            </div>

            {/* Orbiting icons – outer ring */}
            <OrbitingIcon icon={Bot} delay={0} duration={20} radius={160} />
            <OrbitingIcon icon={Workflow} delay={5} duration={20} radius={160} />
            <OrbitingIcon icon={MessageSquare} delay={10} duration={20} radius={160} />
            <OrbitingIcon icon={Shield} delay={15} duration={20} radius={160} />

            {/* Orbiting icons – inner ring */}
            <OrbitingIcon icon={Zap} delay={0} duration={14} radius={110} size={30} />
            <OrbitingIcon icon={Sparkles} delay={4.67} duration={14} radius={110} size={30} />
            <OrbitingIcon icon={ArrowRight} delay={9.33} duration={14} radius={110} size={30} />

            {/* Ambient glow behind the orbital */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <motion.div
                className="h-40 w-40 rounded-full bg-chart-1/15 blur-[60px]"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </div>

        {/* Bottom preview bar – live metrics strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 lg:mt-24"
        >
          <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-md p-1">
            <div className="flex items-center gap-2 border-b border-border/30 px-4 py-2">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
              </div>
              <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                AIos Dashboard
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {[
                { label: "Active Agents", value: "12", trend: "+3 this week", color: "bg-chart-1" },
                { label: "Agent Teams", value: "4", trend: "2 running now", color: "bg-chart-2" },
                { label: "Sessions Today", value: "1,247", trend: "+18% vs yesterday", color: "bg-chart-5" },
                { label: "Avg Response", value: "1.2s", trend: "Streaming enabled", color: "bg-primary" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
                  className="rounded-lg border border-border/20 bg-background/40 p-3"
                >
                  <div className={`mb-2 h-1.5 w-10 rounded-full ${stat.color}/25`} />
                  <div className="text-xl font-bold tracking-tight">{stat.value}</div>
                  <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground/60">{stat.trend}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
