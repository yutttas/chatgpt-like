// src/App.js
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';

export default function App() {
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar onSelectSession={setSelectedSessionId} />
      <ChatWindow sessionId={selectedSessionId} />
    </div>
  );
}
