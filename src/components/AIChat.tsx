import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, User, X, Minimize2, Maximize2, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIChatProps {
  logs: any[];
  settings: any;
  onClose: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({ logs, settings, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: `স্বাগতম ${settings.userName}! আমি আপনার ডেলিভারি অ্যাসিস্ট্যান্ট। আপনার আজকের পারফরম্যান্স বা স্যালারি নিয়ে কোনো প্রশ্ন আছে?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      setMessages(prev => [...prev, { role: 'model', text: "দুঃখিত, Gemini API Key সেট করা নেই। দয়া করে সেটিংস থেকে কি (Key) সেট করুন।" }]);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `
        You are "DEL-PRO AI", a futuristic delivery assistant for a rider named ${settings.userName}.
        The rider's current role is ${settings.userRole}.
        Their monthly target is ${settings.target} deliveries.
        Current logs for this month: ${JSON.stringify(logs)}.
        
        Guidelines:
        1. Respond in Bengali (mostly) with a futuristic, helpful, and encouraging tone.
        2. Analyze the logs to provide specific insights if asked.
        3. If the rider is behind target, give them a "Commander's Pep Talk".
        4. Keep responses concise and formatted for a mobile screen.
        5. Use emojis like 🚀, 🤖, 🎯, 💰.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const aiText = response.text || "দুঃখিত বস, আমার সিস্টেমে একটু সমস্যা হচ্ছে। আবার চেষ্টা করবেন?";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      if (error?.message?.includes('403') || error?.message?.includes('permission')) {
        setMessages(prev => [...prev, { role: 'model', text: "API পারমিশন এরর! দয়া করে আপনার Google AI Studio সেটিংস চেক করুন।" }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', text: "কানেকশন লস্ট! দয়া করে আপনার ইন্টারনেট চেক করুন।" }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: isMinimized ? 'calc(100% - 60px)' : 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-[120] bg-bg-dark flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-surface/50 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center">
            <Bot className="w-6 h-6 text-neon-blue" />
          </div>
          <div>
            <h3 className="font-display font-bold text-white leading-none">DEL-PRO AI</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              <span className="text-[10px] text-neon-green font-bold uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            {isMinimized ? <Maximize2 className="w-5 h-5 text-text-dim" /> : <Minimize2 className="w-5 h-5 text-text-dim" />}
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-dim" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                  msg.role === 'user' 
                    ? 'bg-neon-purple/10 border-neon-purple/30 text-neon-purple' 
                    : 'bg-neon-blue/10 border-neon-blue/30 text-neon-blue'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-neon-purple text-white rounded-tr-none shadow-[0_0_20px_rgba(188,19,254,0.2)]'
                    : 'bg-surface border border-white/5 text-[#d1d1d1] rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-white/5 text-text-dim text-sm italic">
                প্রসেসিং হচ্ছে...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-surface/50 backdrop-blur-xl border-t border-white/5 shrink-0">
        <div className="relative">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="AI কে কিছু জিজ্ঞাসা করুন..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-5 pr-14 py-4 text-sm outline-none focus:border-neon-blue/50 transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 bottom-2 w-10 bg-neon-blue text-black rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[10px] text-center text-text-dim mt-3 uppercase tracking-widest font-bold">
          Powered by Gemini 3 Flash
        </p>
      </div>
    </motion.div>
  );
};
