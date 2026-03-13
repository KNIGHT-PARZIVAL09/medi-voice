import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Mic, MicOff, PhoneOff, Loader2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils.ts';

interface VoiceAgentProps {
  appointmentId: string;
  onComplete: (transcript: string) => void;
  onSwitchToText?: () => void;
}

export const VoiceAgent: React.FC<VoiceAgentProps> = ({ appointmentId, onComplete, onSwitchToText }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("Ready to initiate");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);

  const startSession = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);
    setTranscript("");
    setStatus("Initializing AURA systems...");
    
    try {
      // Ensure AudioContext is created/resumed on user gesture
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      
      setStatus("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      setStatus("Connecting to neural network...");
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key missing. Please check your environment configuration.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: `You are an AI Healthcare Assistant working for a hospital appointment system. Your job is to speak with patients on a voice call, understand their health concerns, and collect important information before their appointment with the doctor.

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
8. Do not provide medical diagnosis. Only collect information and summarize it for the doctor.`,
        },
        callbacks: {
          onopen: () => {
            console.log("AURA: Connection established.");
            setStatus("Systems online. AURA active.");
            setIsConnected(true);
            setIsConnecting(false);
            nextStartTimeRef.current = 0;
            startAudioCapture();
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  playAudio(part.inlineData.data);
                }
                if (part.text) {
                  setTranscript(prev => prev + "\nAURA: " + part.text);
                }
              }
            }
            if (message.serverContent?.interrupted) {
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("AURA: Connection closed.");
            if (isConnected) {
              stopSession();
            } else {
              setStatus("Connection failed or closed prematurely.");
              setIsConnecting(false);
              setIsConnected(false);
            }
          },
          onerror: (err) => {
            console.error("AURA Error:", err);
            setError("Neural link interrupted. Please try again.");
            setIsConnecting(false);
            setIsConnected(false);
          }
        }
      });
      sessionRef.current = session;
    } catch (err: any) {
      console.error("AURA: Failed to initialize:", err);
      setError(err.message || "Failed to initialize AURA.");
      setIsConnecting(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    }
  };

  const startAudioCapture = async () => {
    try {
      const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
      const processor = audioContextRef.current!.createScriptProcessor(2048, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current!.destination);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const uint8 = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Data = btoa(binary);
        
        if (sessionRef.current && isConnected) {
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };
      
      setIsRecording(true);
    } catch (err) {
      console.error("AURA: Audio capture failed:", err);
      setError("Microphone link failed.");
      stopSession();
    }
  };

  const playAudio = async (base64Data: string) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x7FFF;
      }
      
      const buffer = ctx.createBuffer(1, floatData.length, 16000);
      buffer.getChannelData(0).set(floatData);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.05; // Reduced buffer for lower latency
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buffer.duration;
    } catch (e) {
      console.error("AURA: Playback error:", e);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Don't close audioContext globally, just stop recording
    setIsConnected(false);
    setIsRecording(false);
    onComplete(transcript);
  };

  return (
    <div className="relative flex flex-col items-center justify-center p-12 space-y-8 bg-slate-900 rounded-[2rem] text-white overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
      
      <button 
        onClick={() => onComplete("")}
        className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
      >
        <Plus className="rotate-45" size={24} />
      </button>

      <div className="relative">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.button
              key="start"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={startSession}
              disabled={isConnecting}
              className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {isConnecting ? <Loader2 className="animate-spin" /> : <Mic size={32} />}
            </motion.button>
          ) : (
            <motion.button
              key="stop"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={stopSession}
              className="w-24 h-24 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20 hover:bg-rose-400 transition-colors"
            >
              <PhoneOff size={32} />
            </motion.button>
          )}
        </AnimatePresence>
        
        {isRecording && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-4 border-2 border-emerald-500 rounded-full"
          />
        )}
      </div>

      <div className="text-center space-y-4">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">
            {isConnected ? "AURA Online" : isConnecting ? "Initializing..." : "Initiate AURA Scan"}
          </h3>
          <p className={cn(
            "text-sm max-w-xs transition-colors mx-auto",
            error ? "text-rose-400" : "text-slate-400"
          )}>
            {error || status || "Click the icon to begin your pre-consultation assessment."}
          </p>
        </div>

        {!isConnected && !isConnecting && onSwitchToText && (
          <button 
            onClick={onSwitchToText}
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-1 mx-auto transition-colors"
          >
            <MicOff size={12} />
            Prefer to text? Switch to Text Assistant
          </button>
        )}
      </div>

      {transcript && (
        <div className="w-full max-h-32 overflow-y-auto bg-slate-800/50 p-4 rounded-xl text-xs font-mono text-slate-300">
          {transcript}
        </div>
      )}
    </div>
  );
};
