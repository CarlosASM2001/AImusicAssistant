import React, { useEffect, useRef, useState } from "react"

const BACKEND_URL = "https://tu-backend.vercel.app/api/query"

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
    <div className="popup">
      <header className="header">
        <div className="title">AI Artist Finder</div>
        <div className="subtitle">Chat para descubrir artistas</div>
      </header>

      <div className="chips">
        <button onClick={() => onChip("Busco artista con letras melancólicas y guitarra acústica")}>Letras</button>
        <button onClick={() => onChip("Artista de estética gótica Y2K, maquillaje oscuro")}>Estética</button>
        <button onClick={() => onChip("Quiero algo tipo synth-pop femenino, 2010s")}>Género</button>
      </div>

      <div ref={scrollerRef} className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`row ${m.role}`}>
            <div className={`bubble ${m.role}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="row assistant">
            <div className="bubble assistant">
              <span className="typing">
                <i></i><i></i><i></i>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <label className="file">
          <input type="file" accept="image/*" onChange={onPickImage} />
          {image ? "Imagen lista ✓" : "Subir imagen"}
        </label>
        <input
          className="input"
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
        <button className="send" onClick={onSend} disabled={isStreaming}>
          {isStreaming ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  )
}

