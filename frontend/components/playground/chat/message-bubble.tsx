"use client"

import { useCallback, useState } from "react"
import { Copy, Check, Brain, Loader2, ThumbsUp, ThumbsDown, Bot, FileText } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { usePlaygroundStore } from "@/stores/playground-store"
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message"
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
} from "@/components/ai-elements/chain-of-thought"
import { Tool } from "@/components/ai-elements/tool"
import { Sources, extractSourcesFromToolCalls } from "@/components/ai-elements/sources"
import { ResearchProgress } from "@/components/ai-elements/research-progress"
import type { Message as MessageType, ToolCall, ToolRound } from "@/types/playground"

interface MessageBubbleProps {
  message: MessageType
  isStreaming?: boolean
  toolCalls?: ToolCall[]
  toolRound?: ToolRound | null
}

export function MessageBubble({ message, isStreaming, toolCalls, toolRound }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)
  const mode = usePlaygroundStore((s) => s.mode)
  const agents = usePlaygroundStore((s) => s.agents)

  // Resolve agent name for team messages
  const agentName = !isUser && message.agent_id && mode === "team"
    ? agents.find((a) => a.id === message.agent_id)?.name
    : undefined

  const handleCopy = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.content])

  const handleFeedback = useCallback((type: "up" | "down") => {
    setFeedback((prev) => (prev === type ? null : type))
  }, [])

  const activeCalls = toolCalls || message.tool_calls || []
  const reasoningText = message.reasoning?.map((r) => r.content).join("\n") || ""
  const sources = !isUser && !isStreaming
    ? extractSourcesFromToolCalls(activeCalls)
    : []

  return (
    <Message from={isUser ? "user" : "assistant"}>
      <MessageContent>
        {/* Agent name badge (team mode) */}
        {agentName && (
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="size-3 text-blue-500" />
            <span className="text-[11px] font-medium text-blue-500">{agentName}</span>
          </div>
        )}

        {/* Reasoning / Chain of Thought */}
        {reasoningText && (
          <ChainOfThought>
            <ChainOfThoughtStep defaultOpen={isStreaming}>
              <ChainOfThoughtTrigger
                leftIcon={
                  isStreaming ? (
                    <Loader2 className="size-4 animate-spin text-blue-500" />
                  ) : (
                    <Brain className="size-4 text-muted-foreground" />
                  )
                }
              >
                {isStreaming ? "Thinking..." : "Thought process"}
              </ChainOfThoughtTrigger>
              <ChainOfThoughtContent>
                <ChainOfThoughtItem className="whitespace-pre-wrap italic max-h-60 overflow-y-auto">
                  {reasoningText}
                </ChainOfThoughtItem>
              </ChainOfThoughtContent>
            </ChainOfThoughtStep>
          </ChainOfThought>
        )}

        {/* Research progress indicator (only show from round 2+) */}
        {isStreaming && toolRound && toolRound.round > 1 && (
          <ResearchProgress round={toolRound.round} maxRounds={toolRound.max_rounds} />
        )}

        {/* Tool calls */}
        {activeCalls.length > 0 && (
          <div className="space-y-2">
            {activeCalls.map((tc) => (
              <Tool
                key={tc.id}
                name={tc.name}
                state={tc.status === "completed" ? "completed" : tc.status === "error" ? "error" : "running"}
                input={tc.arguments}
                output={tc.result}
              />
            ))}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att, i) => (
              att.file_type === "image" ? (
                <img
                  key={i}
                  src={att.data || att.url}
                  alt={att.filename}
                  className="max-h-48 rounded-lg border border-border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => {
                    const src = att.data || att.url
                    if (src) window.open(src, "_blank")
                  }}
                />
              ) : (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs"
                >
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate max-w-40">{att.filename}</span>
                </div>
              )
            ))}
          </div>
        )}

        {/* Message content */}
        {message.content ? (
          isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : isStreaming ? (
            <p className="text-sm whitespace-pre-wrap">
              {message.content}
              <span className="inline-block h-4 w-0.5 bg-foreground animate-pulse ml-0.5 align-middle" />
            </p>
          ) : (
            <MessageResponse>{message.content}</MessageResponse>
          )
        ) : null}

        {/* Sources from tool calls */}
        {sources.length > 0 && <Sources sources={sources} />}

        {/* Streaming cursor when no content yet */}
        {isStreaming && !message.content && activeCalls.length === 0 && !reasoningText && (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </MessageContent>

      {/* Actions (assistant messages only, not while streaming) */}
      {!isUser && !isStreaming && message.content && (
        <MessageActions>
          <MessageAction tooltip="Copy" onClick={handleCopy}>
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Check className="size-3.5 text-emerald-500" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Copy className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </MessageAction>
          <MessageAction
            tooltip="Helpful"
            onClick={() => handleFeedback("up")}
            className={feedback === "up" ? "text-green-500 hover:text-green-500" : ""}
          >
            <ThumbsUp className="size-3.5" />
          </MessageAction>
          <MessageAction
            tooltip="Not helpful"
            onClick={() => handleFeedback("down")}
            className={feedback === "down" ? "text-red-500 hover:text-red-500" : ""}
          >
            <ThumbsDown className="size-3.5" />
          </MessageAction>
        </MessageActions>
      )}

      {/* Metadata */}
      {message.metadata && !isStreaming && !isUser && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
          {message.metadata.model && <span>{message.metadata.model}</span>}
          {message.metadata.tokens_used && (
            <span>{message.metadata.tokens_used.total} tokens</span>
          )}
          {message.metadata.latency_ms && (
            <span>{(message.metadata.latency_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </Message>
  )
}
