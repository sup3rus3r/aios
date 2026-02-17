"use client"

import { X, FileText } from "lucide-react"
import type { FileUIPart } from "ai"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input"

interface ChatInputProps {
  onSend: (message: string, files?: FileUIPart[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

function AttachmentPreview() {
  const { files, remove } = usePromptInputAttachments()
  if (files.length === 0) return null

  return (
    <PromptInputHeader>
      <div className="flex flex-wrap gap-2 px-1 pt-1">
        {files.map((file) => {
          const isImage = file.mediaType.startsWith("image/")
          return (
            <div
              key={file.id}
              className="relative group flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs"
            >
              {isImage ? (
                <img
                  src={file.url}
                  alt={file.filename || "attachment"}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <FileText className="size-4 text-muted-foreground shrink-0" />
              )}
              <span className="max-w-30 truncate text-muted-foreground">
                {file.filename || "file"}
              </span>
              <button
                type="button"
                onClick={() => remove(file.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            </div>
          )
        })}
      </div>
    </PromptInputHeader>
  )
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const status = isStreaming ? "streaming" as const : "ready" as const

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <PromptInput
          accept="image/*,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          maxFiles={10}
          maxFileSize={20 * 1024 * 1024}
          onSubmit={({ text, files }) => {
            const trimmed = text.trim()
            if ((!trimmed && files.length === 0) || disabled) return
            onSend(trimmed, files.length > 0 ? files : undefined)
          }}
        >
          <AttachmentPreview />
          <PromptInputTextarea
            placeholder={disabled ? "Select an agent to start..." : "Ask anything..."}
            disabled={disabled}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Attach files" />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <span className="text-[10px] text-muted-foreground">
                Shift + Enter for new line
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              disabled={disabled}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
