// src/ChatWindow.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function ChatWindow({ sessionId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (sessionId) {
      fetchMessages();
    }
  }, [sessionId]);

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data);
    }
  }

  if (!sessionId) {
    return <div style={{ padding: '20px' }}>左の履歴から会話を選んでください</div>;
  }

  return (
    <div style={{ flex: 1, padding: '20px' }}>
      {messages.map(msg => (
        <div key={msg.id} style={{ marginBottom: '10px' }}>
          <b>{msg.role}:</b> {msg.content}
        </div>
      ))}
    </div>
  );
}
