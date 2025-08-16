// src/Sidebar.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function Sidebar({ onSelectSession }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
    } else {
      setSessions(data);
    }
  }

  return (
    <div style={{ width: '250px', background: '#f4f4f4', padding: '10px' }}>
      <h3>会話履歴</h3>
      {sessions.map(session => (
        <div
          key={session.id}
          style={{ padding: '8px', cursor: 'pointer' }}
          onClick={() => onSelectSession(session.id)}
        >
          {session.title || '新しい会話'}  
          <br />
          <small>{new Date(session.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
