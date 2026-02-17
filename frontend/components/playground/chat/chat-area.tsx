"use client"

import { usePlaygroundStore } from "@/stores/playground-store"
import { useSession } from "next-auth/react"
import { MessageList } from "./message-list"
import { ChatInput } from "./chat-input"
import { ChatSuggestions } from "./chat-suggestions"
import { streamChat } from "@/lib/stream"
import { createSession } from "@/app/api/playground"
import { Bot } from "lucide-react"
import type { Message, FileAttachment } from "@/types/playground"
import type { FileUIPart } from "ai"

export function ChatArea() {
  const { data: authSession } = useSession()
  const mode = usePlaygroundStore((s) => s.mode)
  const selectedAgentId = usePlaygroundStore((s) => s.selectedAgentId)
  const selectedTeamId = usePlaygroundStore((s) => s.selectedTeamId)
  const selectedSessionId = usePlaygroundStore((s) => s.selectedSessionId)
  const setSelectedSession = usePlaygroundStore((s) => s.setSelectedSession)
  const agents = usePlaygroundStore((s) => s.agents)
  const messages = usePlaygroundStore((s) => s.messages)
  const addMessage = usePlaygroundStore((s) => s.addMessage)
  const isStreaming = usePlaygroundStore((s) => s.isStreaming)
  const setIsStreaming = usePlaygroundStore((s) => s.setIsStreaming)
  const streamingContent = usePlaygroundStore((s) => s.streamingContent)
  const setStreamingContent = usePlaygroundStore((s) => s.setStreamingContent)
  const appendStreamingContent = usePlaygroundStore((s) => s.appendStreamingContent)
  const streamingReasoning = usePlaygroundStore((s) => s.streamingReasoning)
  const setStreamingReasoning = usePlaygroundStore((s) => s.setStreamingReasoning)
  const appendStreamingReasoning = usePlaygroundStore((s) => s.appendStreamingReasoning)
  const streamingToolCalls = usePlaygroundStore((s) => s.streamingToolCalls)
  const setStreamingToolCalls = usePlaygroundStore((s) => s.setStreamingToolCalls)
  const upsertStreamingToolCall = usePlaygroundStore((s) => s.upsertStreamingToolCall)
  const streamingAgentStep = usePlaygroundStore((s) => s.streamingAgentStep)
  const setStreamingAgentStep = usePlaygroundStore((s) => s.setStreamingAgentStep)
  const streamingToolRound = usePlaygroundStore((s) => s.streamingToolRound)
  const setStreamingToolRound = usePlaygroundStore((s) => s.setStreamingToolRound)
  const setAbortController = usePlaygroundStore((s) => s.setAbortController)
  const abortController = usePlaygroundStore((s) => s.abortController)
  const setSessions = usePlaygroundStore((s) => s.setSessions)
  const sessions = usePlaygroundStore((s) => s.sessions)
  const teams = usePlaygroundStore((s) => s.teams)

  const entityId = mode === "agent" ? selectedAgentId : selectedTeamId
  const hasEntity = !!entityId

  const sendMessage = async (content: string, files?: FileUIPart[]) => {
    if (!authSession?.accessToken || !entityId || isStreaming) return

    let sessionId = selectedSessionId

    // Create session if needed
    if (!sessionId) {
      try {
        const newSession = await createSession(authSession.accessToken, {
          entity_type: mode,
          entity_id: entityId,
          title: content.slice(0, 50),
        })
        sessionId = newSession.id
        setSelectedSession(sessionId)
        setSessions([newSession, ...sessions])
      } catch (err) {
        console.error("Failed to create session:", err)
        return
      }
    }

    // Convert FileUIPart[] to FileAttachment[] for the message + request
    const attachments: FileAttachment[] | undefined = files?.map((f) => ({
      filename: f.filename || "file",
      media_type: f.mediaType,
      file_type: f.mediaType.startsWith("image/") ? "image" as const : "document" as const,
      data: f.url,
    }))

    // Add user message
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content,
      attachments,
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)

    // Start streaming
    const controller = new AbortController()
    setAbortController(controller)
    setIsStreaming(true)
    setStreamingContent("")
    setStreamingReasoning("")
    setStreamingToolCalls([])
    setStreamingAgentStep(null)
    setStreamingToolRound(null)

    try {
      await streamChat(
        authSession.accessToken,
        sessionId,
        content,
        (chunk) => appendStreamingContent(chunk),
        (toolCall) => {
          upsertStreamingToolCall(toolCall)
        },
        (reasoning) => appendStreamingReasoning(reasoning.content),
        (message) => {
          addMessage(message)
          setStreamingContent("")
          setStreamingReasoning("")
          setStreamingToolCalls([])
          setStreamingAgentStep(null)
          setStreamingToolRound(null)
        },
        (error) => {
          console.error("Stream error:", error)
          addMessage({
            id: `error-${Date.now()}`,
            session_id: sessionId!,
            role: "assistant",
            content: `Error: ${error}`,
            created_at: new Date().toISOString(),
          })
        },
        (step) => setStreamingAgentStep(step),
        (round) => setStreamingToolRound(round),
        controller.signal,
        attachments,
      )
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Chat error:", err)
      }
    } finally {
      setIsStreaming(false)
      setAbortController(null)
      setStreamingAgentStep(null)
      setStreamingToolRound(null)
    }
  }

  const stopStreaming = () => {
    abortController?.abort()
    setIsStreaming(false)
    setStreamingAgentStep(null)
    // Save whatever was streamed so far
    const content = usePlaygroundStore.getState().streamingContent
    if (content) {
      addMessage({
        id: `stopped-${Date.now()}`,
        session_id: selectedSessionId || "",
        role: "assistant",
        content,
        created_at: new Date().toISOString(),
      })
      setStreamingContent("")
      setStreamingReasoning("")
    }
  }

  if (!hasEntity) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted">
          <Bot className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">AIos</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Select an agent from the sidebar to start a conversation, or create a new one.
          </p>
        </div>
      </div>
    )
  }

  const selectedAgent = mode === "agent" ? agents.find((a) => a.id === selectedAgentId) : undefined
  const selectedTeam = mode === "team" ? teams.find((t) => t.id === selectedTeamId) : undefined
  const teamAgents = selectedTeam
    ? agents.filter((a) => selectedTeam.agent_ids.includes(a.id))
    : undefined

  const showSuggestions = hasEntity && messages.length === 0 && !isStreaming && !selectedSessionId

  return (
    <div className="flex flex-col h-full min-h-0">
      {showSuggestions ? (
        <ChatSuggestions
          agent={selectedAgent}
          team={selectedTeam}
          teamAgents={teamAgents}
          mode={mode}
          onSelect={sendMessage}
        />
      ) : (
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          streamingToolCalls={streamingToolCalls}
          streamingAgentStep={streamingAgentStep}
          streamingToolRound={streamingToolRound}
          isStreaming={isStreaming}
        />
      )}
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={!hasEntity}
      />
    </div>
  )
}
