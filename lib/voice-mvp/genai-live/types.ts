// Minimal types borrowed from Google's live-api-web-console (Apache-2.0).
import type { GoogleGenAIOptions } from '@google/genai'

export type LiveClientOptions = GoogleGenAIOptions & { apiKey: string }

export type StreamingLog = {
  date: Date
  type: string
  count?: number
  // keep message loosely typed to avoid pulling all upstream types
  message: any
}

