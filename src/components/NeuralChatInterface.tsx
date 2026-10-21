import React, { useState } from 'react';
import { MessageSquare, X, Send, Bot, Sparkles } from 'lucide-react';
import { SovereignHexDiamond } from './SovereignHexDiamond';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface NeuralChatInterfaceProps {
  currentUser?: any;
  onOpenAuth?: () => void;
}

export const NeuralChatInterface: React.FC<NeuralChatInterfaceProps> = ({ currentUser, onOpenAuth }) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'agent',
      text: 'ApexMind Engine active. How can I assist with your zero-copy data routing or compute provisioning today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');

    // Dynamic anti-loop agent response dispatch
    setTimeout(() => {
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: `Received prompt: "${userMsg.text}". Orchestrating zero-trust execution pipeline across active compute nodes.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 600);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-[#0b1422] p-4 border border-[#43e4ff] text-[#43e4ff] shadow-[0_0_20px_rgba(67,228,255,0.3)] transition-all hover:scale-105 hover:bg-[#12314a] cursor-pointer"
        aria-label="Open ApexMind Concierge"
      >
        <SovereignHexDiamond size={24} className="h-6 w-6" />
        <span className="font-mono text-sm font-semibold tracking-wider text-white uppercase">ApexMind</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[580px] w-[380px] flex-col rounded-xl border border-[#1e3852] bg-[#050912] shadow-[0_0_30px_rgba(5,9,18,0.85)] backdrop-blur-md">
      {/* Header with Custom Apex Brand Symbol and Explicit Close X Button */}
      <div className="flex items-center justify-between border-b border-[#1e3852] bg-[#0b1422] px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-3">
          <SovereignHexDiamond size={24} className="h-6 w-6" />
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wide text-white uppercase">ApexMind Sovereign AI</h3>
            <span className="flex items-center gap-1.5 text-[10px] text-[#55e39b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#55e39b] animate-pulse" />
              Swarm Orchestrator Active
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-[#12314a] hover:text-[#43e4ff] transition-colors cursor-pointer"
          aria-label="Close Chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${
                msg.sender === 'user'
                  ? 'bg-[#12314a] text-white border border-[#1e3852]'
                  : 'bg-[#0b1422] text-gray-200 border border-[#1e3852]/60 shadow-[0_0_10px_rgba(67,228,255,0.05)]'
              }`}
            >
              {msg.sender === 'agent' && (
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-mono text-[#43e4ff]">
                  <Sparkles className="h-3 w-3" />
                  <span>ApexMind Agent</span>
                </div>
              )}
              <p className="leading-relaxed text-xs">{msg.text}</p>
            </div>
            <span className="mt-1 text-[10px] text-gray-500 font-mono">{msg.timestamp}</span>
          </div>
        ))}
      </div>

      {/* Input Control */}
      <form onSubmit={handleSendMessage} className="border-t border-[#1e3852] p-3 bg-[#0b1422] rounded-b-xl">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Command ApexMind agent..."
            className="w-full rounded-lg bg-[#050912] border border-[#1e3852] py-2 pl-3 pr-10 text-xs text-white placeholder-gray-500 focus:border-[#43e4ff] focus:outline-none focus:ring-1 focus:ring-[#43e4ff]"
          />
          <button
            type="submit"
            className="absolute right-1.5 rounded-md p-1.5 text-[#43e4ff] hover:bg-[#12314a] transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
