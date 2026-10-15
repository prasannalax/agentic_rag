import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleSend = async (e, queryOverride) => {
    if (e) e.preventDefault();
    const userQuery = queryOverride || input;
    if (!userQuery.trim() || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setLoading(true);
    setStatus('Searching local database...');

    try {
      // Changed from 'http://localhost:5000/api/chat' to relative path '/api/chat'
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = { role: 'assistant', content: '', source: '' };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const payload = line.replace('data: ', '').trim();
          if (payload === '[DONE]') continue;

          const data = JSON.parse(payload);
          if (data.status) setStatus(data.status);
          if (data.text) {
            assistantMsg.content += data.text;
            assistantMsg.source = data.source;

            setMessages(prev => {
              const updated = [...prev];
              if (updated[updated.length - 1]?.role === 'assistant') {
                updated[updated.length - 1] = { ...assistantMsg };
                return updated;
              }
              return [...updated, { ...assistantMsg }];
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      setStatus('Error connecting to backend.');
    } finally {
      setStatus('');
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Background Ambient Orbs */}
      <div className="glow-orb orb-1"></div>
      <div className="glow-orb orb-2"></div>

      <header className="app-header">
        <div className="brand-badge">
          <span className="pulse-dot"></span> AGENTIC ENGINE
        </div>
        <h1>Agentic RAG Assistant</h1>
        <p className="subtitle">
          Intelligent routing with local vector storage & Live DuckDuckGo fallback
        </p>
      </header>

      <main className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="hero-icon">🔍</div>
            <h3>How can I assist your research?</h3>
            <p>Select a quick prompt or type your query below to begin.</p>
            
            <div className="suggestion-grid">
              <button 
                className="suggestion-card"
                onClick={() => handleSend(null, "What is our home office equipment allowance?")}
              >
                <span className="card-badge green">Vector DB</span>
                <span className="card-text">"What is our home office equipment allowance?"</span>
              </button>

              <button 
                className="suggestion-card"
                onClick={() => handleSend(null, "What is the latest world news today?")}
              >
                <span className="card-badge orange">MCP Fallback</span>
                <span className="card-text">"What is the latest world news today?"</span>
              </button>
            </div>
          </div>
        )}

        <div className="message-list">
          {messages.map((m, i) => (
            <div key={i} className={`message-row ${m.role}`}>
              <div className="avatar">
                {m.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-bubble">
                <div className="content message-content">
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content || ''}
                    </ReactMarkdown>
                  )}
                </div>

                {m.source && (
                  <div className="source-tag">
                    {m.source === 'internal_kb' ? (
                      <span className="badge kb-badge">
                        🟢 Source: Internal Knowledge Base
                      </span>
                    ) : (
                      <span className="badge web-badge">
                        🌐 Source: DuckDuckGo Web Search (MCP)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {status && (
            <div className="status-indicator">
              <span className="spinner"></span>
              <span>{status}</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      <form className="input-bar" onSubmit={handleSend}>
        <div className="input-wrapper">
          <input
            type="text"
            value={input}
            placeholder="Ask anything across local docs or the live web..."
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            <span>Send</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}