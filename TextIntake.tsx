import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, Loader2, X, Mic } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface TextIntakeProps {
  appointmentId: string;
  onComplete: (transcript: string) => void;
  onCancel: () => void;
  onSwitchToVoice?: () => void;
}

export function TextIntake({ onComplete, onCancel, onSwitchToVoice }: TextIntakeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const systemInstruction = `You are an AI Healthcare Assistant working for a hospital appointment system. Your job is to understand their health concerns, and collect important information before their appointment with the doctor.

Follow this conversation flow:
1. Start the conversation politely. Example: "Hello, I am the AI healthcare assistant. I will ask a few questions to help the doctor understand your condition before your appointment."
2. Ask for basic patient information: Patient full name, Age, Main health problem or symptoms, How long they have had the symptoms, Severity of the problem (mild, moderate, severe).
3. Ask follow-up questions to better understand the condition (e.g., fever, cough, pain, breathing difficulty, when symptoms started, medications taken).
4. After collecting the information, confirm the appointment. Example: "Thank you. Your appointment has been recorded. The doctor will review your information before the consultation."
5. Generate a short structured summary for the doctor. Format the summary exactly like this:
Patient Name:
Age:
Main Symptoms:
Duration of Symptoms:
Severity Level:
Additional Notes:

Possible Concern:

6. Be polite, clear, and ask one question at a time.
7. If the patient gives unclear answers, ask them to clarify.
8. Do not provide medical diagnosis. Only collect information and summarize it for the doctor.`;

  useEffect(() => {
    const initChat = async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return;

      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
        },
      });
      chatRef.current = chat;

      // Initial greeting
      setIsLoading(true);
      try {
        const response = await chat.sendMessage({ message: "Hello, please start the intake process." });
        setMessages([{ role: 'model', text: response.text }]);
      } catch (err) {
        console.error("Chat init error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initChat();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !chatRef.current || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userMessage });
      const modelResponse = response.text;
      setMessages(prev => [...prev, { role: 'model', text: modelResponse }]);

      // Check if the model has confirmed the appointment and generated the summary
      if (modelResponse.includes("Patient Name:") && modelResponse.includes("Possible Concern:")) {
        // Wait a bit so the user can see the final message
        setTimeout(() => {
          const fullTranscript = messages.map(m => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.text}`).join('\n') + `\nAssistant: ${modelResponse}`;
          onComplete(fullTranscript);
        }, 3000);
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xl">
      <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Healthcare Assistant</h3>
            <p className="text-[10px] text-slate-400">Text-based Intake</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchToVoice && (
            <button 
              onClick={onSwitchToVoice}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 mr-2"
              title="Switch to Voice Assistant"
            >
              <Mic size={12} />
              Voice Mode
            </button>
          )}
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${
              m.role === 'user' 
                ? 'bg-emerald-600 text-white rounded-tr-none' 
                : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'
            }`}>
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                <Markdown>{m.text}</Markdown>
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 rounded-tl-none shadow-sm">
              <Loader2 className="animate-spin text-emerald-500" size={18} />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
