import React, { useState } from 'react';

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userQuery = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setLoading(true);
    setStatus('Searching local database...');

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
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
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>Agentic RAG with DuckDuckGo MCP Fallback</h2>

      <div style={{
        border: '1px solid #e0e0e0',
        borderRadius: '10px',
        padding: '20px',
        minHeight: '420px',
        background: '#fafafa',
        marginBottom: '16px'
      }}>
        {messages.length === 0 && (
          <p style={{ color: '#888' }}>
            Try asking:
            <br />• <em>"What is our home office equipment allowance?"</em> (Tests local vector DB)
            <br />• <em>"What is the latest world news today?"</em> (Tests DuckDuckGo fallback)
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '16px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{
              display: 'inline-block',
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '10px',
              textAlign: 'left',
              background: m.role === 'user' ? '#2563eb' : '#ffffff',
              color: m.role === 'user' ? '#ffffff' : '#1e293b',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

              {m.source && (
                <div style={{ marginTop: '8px', fontSize: '11px', borderTop: '1px solid #eee', paddingTop: '6px' }}>
                  {m.source === 'internal_kb' ? (
                    <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                      🟢 Source: Internal Knowledge Base
                    </span>
                  ) : (
                    <span style={{ color: '#ea580c', fontWeight: 'bold' }}>
                      🌐 Source: DuckDuckGo Web Search (MCP)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {status && (
          <div style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic', marginTop: '10px' }}>
            ⏳ {status}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px' }}>
        <input
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          value={input}
          placeholder="Ask a question..."
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          style={{
            padding: '12px 24px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
          disabled={loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}