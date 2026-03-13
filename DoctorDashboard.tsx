import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, FileText, Clipboard, Send, AlertTriangle, CheckCircle2, PenTool } from 'lucide-react';
import { Appointment, RiskLevel, Doctor } from './types.ts';
import { Whiteboard } from './components/Whiteboard.tsx';
import ReactMarkdown from 'react-markdown';
import { generatePrescription } from './services/geminiService.ts';

export default function DoctorDashboard({ doctor }: { doctor: Doctor }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedApp, setSelectedApp] = useState<Appointment | null>(null);
  const [notes, setNotes] = useState("");
  const [prescription, setPrescription] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/appointments')
      .then(res => res.json())
      .then(data => {
        // Filter appointments for this specific doctor
        const filtered = data.filter((app: Appointment) => app.doctorId === doctor.id);
        setAppointments(filtered);
      });
  }, [doctor.id]);

  // Sync notes and prescription when selectedApp changes
  useEffect(() => {
    if (selectedApp) {
      setNotes(selectedApp.notes || "");
      setPrescription(selectedApp.prescription || "");
      setRecipientEmail(selectedApp.patientEmail || "");
    } else {
      setNotes("");
      setPrescription("");
      setRecipientEmail("");
    }
  }, [selectedApp?.id]);

  // Debounced save for notes and prescription
  useEffect(() => {
    if (!selectedApp) return;
    
    const timer = setTimeout(async () => {
      const updates: any = {};
      let hasUpdates = false;

      if (notes !== (selectedApp.notes || "")) {
        updates.notes = notes;
        hasUpdates = true;
      }

      if (prescription !== (selectedApp.prescription || "")) {
        updates.prescription = prescription;
        hasUpdates = true;
      }

      if (hasUpdates) {
        setIsSaving(true);
        try {
          await fetch(`/api/appointments/${selectedApp.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          // Update local state to reflect the save
          setAppointments(prev => prev.map(app => 
            app.id === selectedApp.id ? { ...app, ...updates } : app
          ));
        } finally {
          setIsSaving(false);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [notes, prescription, selectedApp?.id]);

  const handleGeneratePrescription = async () => {
    if (!selectedApp) return;
    setIsGenerating(true);
    try {
      const p = await generatePrescription(selectedApp.patientName, selectedApp.summary || "General checkup", notes);
      setPrescription(p);
      // Save prescription immediately
      await fetch(`/api/appointments/${selectedApp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescription: p })
      });
      setAppointments(prev => prev.map(app => 
        app.id === selectedApp.id ? { ...app, prescription: p } : app
      ));
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        alert("The AI service is currently at its limit. Please try again in a few minutes or tomorrow if the daily limit was reached.");
      } else {
        console.error(error);
        alert("Failed to generate prescription. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteConsultation = async () => {
    if (!selectedApp) return;
    
    // Update appointment status
    await fetch(`/api/appointments/${selectedApp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: 'completed',
        notes,
        prescription
      })
    });

    // Send email to doctor
    try {
      if (!recipientEmail || !recipientEmail.includes('@')) {
        alert("Please provide a valid recipient email address.");
        return;
      }

      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
          <h2 style="color: #0f172a;">Consultation Completed</h2>
          <p style="color: #64748b;">Here is the prescription for <strong>${selectedApp.patientName}</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <h3 style="color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Prescription</h3>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; font-family: monospace; white-space: pre-wrap;">
            ${prescription}
          </div>
          <h3 style="color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 20px;">Clinical Notes</h3>
          <div style="color: #334155; font-size: 14px;">
            ${notes}
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
            Sent from Digital Clinic Command Center.
          </p>
        </div>
      `;

      const emailResponse = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail || 'hrydaynachane7@gmail.com',
          subject: `Prescription: ${selectedApp.patientName}`,
          html: emailHtml
        })
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.warn("Email sending failed:", errorData.error);
        alert("Consultation completed, but email could not be sent. Please ensure SENDGRID_API_KEY or RESEND_API_KEY is configured in Settings.");
      }
    } catch (err) {
      console.error("Failed to send email:", err);
    }

    setSelectedApp(null);
    setNotes("");
    setPrescription("");
    fetch('/api/appointments')
      .then(res => res.json())
      .then(data => {
        const filtered = data.filter((app: Appointment) => app.doctorId === doctor.id);
        setAppointments(filtered);
      });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Welcome, {doctor.name}</h1>
          <p className="text-slate-500 mt-2">{doctor.specialty} Command Center • AI-prioritized queue.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your Patients</p>
            <p className="text-2xl font-bold text-slate-900">{appointments.length} Total</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Patient Queue */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-semibold text-slate-700">Patient Queue</h2>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">Live</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {appointments.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-start gap-4 ${selectedApp?.id === app.id ? 'bg-emerald-50/50 border-l-4 border-emerald-500' : ''}`}
                >
                  <div className={`mt-1 p-2 rounded-lg ${
                    app.riskLevel === RiskLevel.CRITICAL ? 'bg-rose-100 text-rose-600' :
                    app.riskLevel === RiskLevel.HIGH ? 'bg-orange-100 text-orange-600' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {app.riskLevel === RiskLevel.CRITICAL || app.riskLevel === RiskLevel.HIGH ? <AlertTriangle size={18} /> : <User size={18} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-slate-900">{app.patientName}</h3>
                      <span className="text-[10px] font-mono text-slate-400">{app.time}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{app.summary || "Awaiting intake..."}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        app.riskLevel === RiskLevel.CRITICAL ? 'bg-rose-100 text-rose-700' :
                        app.riskLevel === RiskLevel.HIGH ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {app.riskLevel}
                      </span>
                      {app.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-500" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Consultation Area */}
        <div className="lg:col-span-8 space-y-6">
          {selectedApp ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">{selectedApp.patientName}</h2>
                    <p className="text-slate-500">Appointment ID: {selectedApp.id}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                      <FileText size={20} />
                    </button>
                    <button className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                      <Clipboard size={20} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <section>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AI Intake Summary</h3>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-700 leading-relaxed">
                        {selectedApp.summary ? (
                          <ReactMarkdown>{selectedApp.summary}</ReactMarkdown>
                        ) : (
                          <p className="italic text-slate-400">No intake summary available yet.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Consultation Notes</h3>
                        {isSaving && (
                          <span className="text-[10px] text-emerald-500 font-medium animate-pulse flex items-center gap-1">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                            Saving...
                          </span>
                        )}
                      </div>
                      <textarea 
                        className="w-full h-40 p-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none"
                        placeholder="Type your clinical notes here..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                      />
                    </section>
                  </div>

                  <div className="space-y-6">
                    <Whiteboard roomId={selectedApp.id} />
                    
                    <section>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Digital Prescription</h3>
                        <div className="flex items-center gap-3">
                          {isSaving && (
                            <span className="text-[10px] text-emerald-500 font-medium animate-pulse flex items-center gap-1">
                              <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                              Saving...
                            </span>
                          )}
                          <button 
                            onClick={handleGeneratePrescription}
                            disabled={isGenerating}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                          >
                            {isGenerating ? "GENERATING..." : "AI GENERATE"}
                          </button>
                        </div>
                      </div>
                      <textarea 
                        className="w-full h-40 p-4 bg-emerald-50/30 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs resize-none font-mono"
                        placeholder="Prescription will appear here..."
                        value={prescription}
                        onChange={e => setPrescription(e.target.value)}
                      />

                      <section className="mt-6">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Recipient Email</h3>
                        <input 
                          type="email"
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                          placeholder="Enter recipient email..."
                          value={recipientEmail}
                          onChange={e => setRecipientEmail(e.target.value)}
                        />
                      </section>

                      <button 
                        onClick={handleCompleteConsultation}
                        className="w-full mt-4 py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                      >
                        <Send size={18} />
                        Complete & Send Prescription
                      </button>
                    </section>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-[600px] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <User size={48} />
              </div>
              <p className="font-medium">Select a patient from the queue to begin consultation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
