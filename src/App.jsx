import React, { useEffect, useRef, useState } from "react"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://ai-music-assistant.vercel.app/api/query"

export default function App() {
  const [messages, setMessages] = useState([
    { id: "hello", role: "assistant", content: "Describe letras, look o género para encontrar artistas." }
  ])
  const [input, setInput] = useState("")
  const [image, setImage] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollerRef = useRef(null)

  useEffect(() => {
    if (!scrollerRef.current) return
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages])

  function addMessage(msg) {
    setMessages((m) => [...m, { id: crypto.randomUUID(), ...msg }])
  }

  function updateLastAssistant(content) {
    setMessages((m) => {
      const copy = [...m]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], content }
          break
        }
      }
      return copy
    })
  }

  function onPickImage(e) {
    const file = e.target.files?.[0]
    if (file) setImage(file)
  }

  async function onSend() {
    if (!input.trim() && !image) return
    const userText = input.trim()
    setInput("")

    addMessage({ role: "user", content: userText || "[Imagen]" })
    addMessage({ role: "assistant", content: "" })

    const form = new FormData()
    if (userText) form.append("query", userText)
    if (image) form.append("image", image)

    setIsStreaming(true)
    try {
      const res = await fetch(BACKEND_URL, { method: "POST", body: form })
      if (!res.ok || !res.body) {
        updateLastAssistant("Hubo un error. Intenta de nuevo.")
        setIsStreaming(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        updateLastAssistant(acc)
      }
    } catch (e) {
      updateLastAssistant("No pude conectar con el servidor.")
    } finally {
      setIsStreaming(false)
      setImage(null)
    }
  }

  function onChip(text) {
    setInput(text)
  }

  return (
    <div className="w-[360px] h-[560px] bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-4 pt-3 pb-2 border-b border-white/10">
        <div className="text-sm uppercase tracking-wide text-white/60">AI Artist Finder</div>
        <div className="text-lg font-semibold">Descubre artistas por letras, look o género</div>
      </header>

      <div className="px-3 py-2 flex gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-sm transition"
          onClick={() => onChip("Busco artista con letras melancólicas y guitarra acústica")}
        >
          Letras
        </button>
        <button
          className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-sm transition"
          onClick={() => onChip("Artista de estética gótica Y2K, maquillaje oscuro")}
        >
          Estética
        </button>
        <button
          className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-sm transition"
          onClick={() => onChip("Quiero algo tipo synth-pop femenino, 2010s")}
        >
          Género
        </button>
      </div>

      <div ref={scrollerRef} className="scroll-area flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-white/10 text-white rounded-bl-sm")
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-white/10 text-white rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
              <span className="typing-dots"><i></i><i></i><i></i></span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/10 grid grid-cols-[auto,1fr,auto] gap-2 items-center">
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-sm cursor-pointer">
          <input className="hidden" type="file" accept="image/*" onChange={onPickImage} />
          <span className="i-ph-image text-lg" />
          <span>{image ? "Imagen lista ✓" : "Subir"}</span>
        </label>

        <input
          className="w-full px-3 py-2 rounded-xl bg-white/[0.06] focus:bg-white/[0.09] outline-none border border-white/10 focus:border-white/20 text-sm placeholder:text-white/40"
          placeholder="Escribe tu consulta..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <button
          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
          onClick={onSend}
          disabled={isStreaming}
        >
          {isStreaming ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  )
}
