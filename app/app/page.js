'use client';

import { useState, useRef, useEffect } from 'react';
import './globals.css';

// =================== DATA ===================

const CATEGORY_TILES = [
  {
    id: 'diagnostic',
    title: "J'ai eu connaissance d'un diagnostic pour un élève",
    color: '#9b59b6',
    boussoleUrl: 'https://lms.inclusive.tralalere.com/boussole/explore/4687',
  },
  {
    id: 'competences-psychosociales',
    title: "Je souhaite explorer par compétences psychosociales",
    color: '#5bc0de',
    boussoleUrl: 'https://lms.inclusive.tralalere.com/boussole/explore/4711',
  },
  {
    id: 'difficulte-observee',
    title: "J'ai observé une difficulté chez un élève",
    color: '#e74c5c',
    boussoleUrl: 'https://lms.inclusive.tralalere.com/boussole/explore/4686',
  },
  {
    id: 'question-organisationnelle',
    title: "J'ai une question organisationnelle ou administrative",
    color: '#6c3dab',
    boussoleUrl: 'https://lms.inclusive.tralalere.com/boussole/explore/4709',
  },
  {
    id: 'adaptations-pedagogiques',
    title: "J'ai une question relative aux adaptations pédagogiques",
    color: '#e8a838',
    boussoleUrl: 'https://lms.inclusive.tralalere.com/boussole/explore/4710',
  },
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  text: `Bonjour ! Je suis l'assistant de la Boussole de l'Inclusion.\n\nDécrivez-moi la situation que vous observez chez votre élève ou votre enfant, et je vous aiderai à identifier des pistes et à trouver des ressources adaptées.`,
  resources: [],
  quickReplies: [],
};

// Map resource types to visual config
const RESOURCE_TYPE_CONFIG = {
  "Conseils d'experts": { icon: "\u{1F4A1}", color: "#e8a838", colorLight: "#fef3e0" },
  "Conseils pratiques": { icon: "\u{1F527}", color: "#e8a838", colorLight: "#fef3e0" },
  "Parcours pédagogique": { icon: "\u{1F393}", color: "#2a9d8f", colorLight: "#e6f5f3" },
  "Parcours d'autoformation": { icon: "\u{1F4DA}", color: "#6c63ff", colorLight: "#eeedff" },
  "Kit pédagogique": { icon: "\u{1F4CB}", color: "#1a365d", colorLight: "#e8edf4" },
  "Collection": { icon: "\u{1F4E6}", color: "#e76f51", colorLight: "#fde8e3" },
};

function getResourceConfig(type) {
  return RESOURCE_TYPE_CONFIG[type] || { icon: "\u{1F4C4}", color: "#718096", colorLight: "#f0f4f8" };
}

function groupResourcesByType(resources) {
  const grouped = {};
  for (const res of resources) {
    const type = res.type || "Autre";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(res);
  }
  return grouped;
}

// =================== COMPASS ICON ===================

function CompassIcon() {
  return (
    <div className="welcome-compass-icon">{'\u{1F9ED}'}</div>
  );
}

// =================== MAIN COMPONENT ===================

export default function Home() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const hasChatStarted = messages.length > 1;

  useEffect(() => {
    if (hasChatStarted) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, hasChatStarted]);

  const sendMessage = async (text) => {
    const userMessage = text || input.trim();
    if (!userMessage || isLoading) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const newMessages = [...messages, { role: 'user', text: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      const data = await res.json();
      setMessages([...newMessages, {
        role: 'assistant',
        text: data.text || data.response,
        resources: data.resources || [],
        quickReplies: data.quickReplies || [],
      }]);
    } catch (err) {
      setMessages([...newMessages, {
        role: 'assistant',
        text: "Désolé, une erreur s'est produite. Veuillez réessayer.",
        resources: [],
        quickReplies: ["Réessayer", "Poser une autre question"],
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const quickReplies = (!isLoading && lastAssistantMsg?.quickReplies?.length > 0)
    ? lastAssistantMsg.quickReplies
    : [];

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-inner">
          <div className="header-icon">{'\u{1F9ED}'}</div>
          <div>
            <h1>
              Boussole de l&apos;Inclusion
              <span className="poc-badge">POC</span>
            </h1>
            <p className="subtitle">Assistant de repérage des difficultés d&apos;apprentissage</p>
          </div>
        </div>
      </header>

      {/* =================== WELCOME VIEW =================== */}
      {!hasChatStarted && (
        <>
          {/* Category tiles */}
          <div className="tiles-section">
            <div className="tiles-label">Explorer les thématiques :</div>
            <div className="tiles-grid">
              {CATEGORY_TILES.map((cat, i) => (
                <div
                  key={cat.id}
                  className="category-tile"
                  style={{ '--tile-color': cat.color, '--tile-index': i }}
                  onClick={() => sendMessage(cat.title)}
                >
                  <div className="tile-top">
                    <span className="tile-title">{cat.title}</span>
                    <span className="tile-arrow">{'\u2197'}</span>
                  </div>
                  <a
                    href={cat.boussoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tile-external-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Voir sur la Boussole {'\u2192'}
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Animated speech bubble */}
          <div className="welcome-view">
            <div className="speech-bubble">
              <CompassIcon />
              <p><strong>Bonjour !</strong> Je suis l&apos;assistant de la Boussole de l&apos;Inclusion.</p>
              <p>Choisissez une thématique ci-dessus, ou décrivez-moi directement la situation que vous observez {'\u{1F447}'}</p>
            </div>
          </div>
        </>
      )}

      {/* =================== CHAT VIEW =================== */}
      {hasChatStarted && (
        <div className="chat-area">
          {messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="message-avatar assistant-avatar">{'\u{1F9ED}'}</div>
              )}

              <div className="message-column">
                <div className={`message-bubble ${msg.role}`}>
                  {msg.text}
                </div>

                {msg.role === 'assistant' && msg.resources && msg.resources.length > 0 && (
                  <div className="resources-section">
                    <div className="resources-label">Ressources recommandées :</div>
                    <div className="resources-grid">
                      {Object.entries(groupResourcesByType(msg.resources)).map(([type, items]) => {
                        const config = getResourceConfig(type);
                        return items.map((res, j) => (
                          <div
                            key={`${type}-${j}`}
                            className="resource-card"
                            style={{
                              '--resource-color': config.color,
                              '--resource-bg': config.colorLight,
                            }}
                          >
                            <div className="resource-type-badge" style={{ background: config.color }}>
                              <span className="resource-type-icon">{config.icon}</span>
                              <span>{type}</span>
                            </div>
                            <div className="resource-title">{res.title}</div>
                            {res.description && (
                              <div className="resource-description">{res.description}</div>
                            )}
                            {res.url && (
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="resource-link"
                                style={{ color: config.color }}
                              >
                                Voir la ressource {'\u2192'}
                              </a>
                            )}
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="message-avatar user-avatar">{'\u{1F464}'}</div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-avatar assistant-avatar">{'\u{1F9ED}'}</div>
              <div className="message-column">
                <div className="message-bubble assistant">
                  <div className="typing-indicator">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      )}

      {/* Quick replies */}
      {quickReplies.length > 0 && (
        <div className="quick-replies">
          {quickReplies.map((reply, i) => (
            <button
              key={i}
              className="quick-reply-btn"
              onClick={() => sendMessage(reply)}
              disabled={isLoading}
            >
              {reply}
              <span className="quick-reply-arrow">{'\u2191'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={handleKeyDown}
            placeholder="Exprimez-vous naturellement. Ex: Mon élève a du mal à lire..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            aria-label="Envoyer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
        <div className="disclaimer">
          Cet outil propose des pistes de repérage. Il ne remplace en aucun cas un diagnostic médical ou paramédical.
        </div>
      </div>
    </div>
  );
}
