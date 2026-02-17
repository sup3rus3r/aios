"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { MessageBubble } from "./message-bubble"
import { ScrollButton } from "@/components/ai-elements/scroll-button"
import type { Message, ToolCall, AgentStep, ToolRound } from "@/types/playground"

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  streamingReasoning: string
  streamingToolCalls: ToolCall[]
  streamingAgentStep?: AgentStep | null
  streamingToolRound?: ToolRound | null
  isStreaming: boolean
}

export function MessageList({
  messages,
  streamingContent,
  streamingReasoning,
  streamingToolCalls,
  streamingAgentStep,
  streamingToolRound,
  isStreaming,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Track whether user is near bottom using intersection observer
  useEffect(() => {
    const bottom = bottomRef.current
    if (!bottom) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting
        setIsAtBottom(atBottom)
        setShowScrollButton(!atBottom)
      },
      { root: scrollRef.current, threshold: 0.1 }
    )

    observer.observe(bottom)
    return () => observer.disconnect()
  }, [])

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [messages, streamingContent, streamingToolCalls, streamingReasoning, streamingAgentStep, isAtBottom])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // Show the streaming bubble when there's any streaming activity
  const hasStreamingActivity =
    isStreaming &&
    (streamingContent || streamingToolCalls.length > 0 || streamingReasoning)

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto min-h-0">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Agent step indicator (team mode) */}
        {isStreaming && streamingAgentStep && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">
              {streamingAgentStep.step === "routing" && "Routing query..."}
              {streamingAgentStep.step === "responding" && `${streamingAgentStep.agent_name} is responding...`}
              {streamingAgentStep.step === "selected" && `Selected ${streamingAgentStep.agent_name}`}
              {streamingAgentStep.step === "completed" && `${streamingAgentStep.agent_name} completed`}
              {streamingAgentStep.step === "synthesizing" && "Synthesizing responses..."}
            </span>
          </div>
        )}

        {/* Streaming message */}
        {hasStreamingActivity && (
          <MessageBubble
            message={{
              id: "streaming",
              session_id: "",
              role: "assistant",
              content: streamingContent,
              agent_id: streamingAgentStep?.agent_id || undefined,
              created_at: new Date().toISOString(),
              reasoning: streamingReasoning
                ? [{ type: "thinking", content: streamingReasoning }]
                : undefined,
            }}
            toolCalls={streamingToolCalls}
            toolRound={streamingToolRound}
            isStreaming
          />
        )}

        {/* Initial loading dots (before any streaming data arrives) */}
        {isStreaming && !hasStreamingActivity && (
          <MessageBubble
            message={{
              id: "loading",
              session_id: "",
              role: "assistant",
              content: "",
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-px" />
      </div>

      <ScrollButton visible={showScrollButton} onClick={scrollToBottom} />
    </div>
  )
}
