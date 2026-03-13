import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Stethoscope, ChevronRight, Plus, Activity, AlertCircle, Mic, Trash2, MessageSquare } from 'lucide-react';
import { Doctor, Appointment, RiskLevel } from './types.ts';
import { VoiceAgent } from './components/VoiceAgent.tsx';
import { TextIntake } from './components/TextIntake.tsx';
import { analyzePatientIntake } from './services/geminiService.ts';

export default function PatientDashboard() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [activeIntake, setActiveIntake] = useState<string | null>(null);
  const [intakeMode, setIntakeMode] = useState<'voice' | 'text'>('voice');
  const [activeModal, setActiveModal] = useState<'insurance' | null>(null);
  const [bookingForm, setBookingForm] = useState({
    patientName: '',
    patientEmail: '',
    date: '',
    time: ''
  });

  useEffect(() => {
    fetch('/api/doctors').then(res => res.json()).then(setDoctors);
    fetch('/api/appointments').then(res => res.json()).then(setAppointments);
  }, []);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) return;

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...bookingForm,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name
      })
    });
    const data = await res.json();
    setShowBooking(false);
    fetch('/api/appointments').then(res => res.json()).then(setAppointments);
    setActiveIntake(data.id);
  };

  const handleIntakeComplete = async (transcript: string) => {
    if (!activeIntake) return;
    
    try {
      const analysis = await analyzePatientIntake(transcript);
      
      await fetch(`/api/appointments/${activeIntake}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          summary: analysis.summary,
          riskLevel: analysis.riskLevel
        })
      });
      
      setActiveIntake(null);
      fetch('/api/appointments').then(res => res.json()).then(setAppointments);
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        alert("The AI service is currently at its limit. Please try again in a few minutes or tomorrow if the daily limit was reached.");
      } else {
        alert("An error occurred while analyzing the intake. Please try again.");
      }
      setActiveIntake(null);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetch('/api/appointments').then(res => res.json()).then(setAppointments);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleClearAllAppointments = async () => {
    try {
      const res = await fetch('/api/appointments', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear');
      setAppointments([]);
    } catch (err) {
      console.error('Clear error:', err);
    }
  };

  const handleDownloadRecords = () => {
    const patientApps = appointments.filter(a => a.patientEmail === bookingForm.patientEmail || !bookingForm.patientEmail);
    if (patientApps.length === 0) {
      alert("No records found to download.");
      return;
    }

    const records = patientApps
      .map(a => `
Date: ${a.date} ${a.time}
Doctor: ${a.doctorName}
Summary: ${a.summary || 'N/A'}
Prescription: ${a.prescription || 'N/A'}
-----------------------------------------
`).join('\n');

    const blob = new Blob([`Medical Records for ${bookingForm.patientName || 'Patient'}\n\n${records}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medical_records_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const insuranceInfo = {
    provider: "Blue Cross Blue Shield",
    policyNumber: "BCBS-99283-X1",
    groupNumber: "GRP-0012",
    expiry: "2027-12-31"
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Patient Portal</h1>
          <p className="text-slate-500 mt-2">Manage your healthcare journey and appointments.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
          <Activity size={16} />
          System Active
        </div>
      </header>

      {activeIntake && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={intakeMode === 'voice' ? "bg-slate-900 rounded-3xl p-1" : ""}
        >
          {intakeMode === 'voice' ? (
            <VoiceAgent 
              appointmentId={activeIntake} 
              onComplete={handleIntakeComplete} 
              onSwitchToText={() => setIntakeMode('text')}
            />
          ) : (
            <TextIntake 
              appointmentId={activeIntake} 
              onComplete={handleIntakeComplete} 
              onCancel={() => setActiveIntake(null)}
              onSwitchToVoice={() => setIntakeMode('voice')}
            />
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Stethoscope size={20} className="text-slate-400" />
                Available Doctors
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {doctors.map(doc => (
                <motion.div 
                  key={doc.id}
                  whileHover={{ y: -4 }}
                  className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => {
                    setSelectedDoctor(doc);
                    setShowBooking(true);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <img src={doc.image} alt={doc.name} className="w-16 h-16 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">{doc.name}</h3>
                      <p className="text-sm text-slate-500">{doc.specialty}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Calendar size={20} className="text-slate-400" />
                Your Appointments
              </h2>
              {appointments.length > 0 && (
                <button 
                  onClick={handleClearAllAppointments}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-3">
              {appointments.filter(a => a.patientEmail === bookingForm.patientEmail || !bookingForm.patientEmail).map(app => (
                <div key={app.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{app.doctorName}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {app.date}</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {app.time}</span>
                      </div>
                    </div>
                  </div>
                    <div className="flex items-center gap-3">
                      {app.status === 'scheduled' && !app.transcript && (
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => { setIntakeMode('voice'); setActiveIntake(app.id); }}
                            className="text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition-colors flex items-center justify-center gap-1 w-full"
                          >
                            <Mic size={12} />
                            Voice Assistant
                          </button>
                          <button 
                            onClick={() => { setIntakeMode('text'); setActiveIntake(app.id); }}
                            className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors flex items-center justify-center gap-1 w-full"
                          >
                            <MessageSquare size={12} />
                            Text Assistant
                          </button>
                        </div>
                      )}
                      {app.transcript && (
                        <button 
                          onClick={async () => {
                            await fetch(`/api/appointments/${app.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ transcript: null, summary: null, riskLevel: RiskLevel.LOW })
                            });
                            fetch('/api/appointments').then(res => res.json()).then(setAppointments);
                          }}
                          className="text-[10px] text-slate-400 hover:text-rose-500 transition-colors flex items-center gap-1"
                          title="Delete intake data and redo"
                        >
                          <Trash2 size={10} />
                          Redo Intake
                        </button>
                      )}
                      {app.riskLevel !== RiskLevel.LOW && (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          app.riskLevel === RiskLevel.CRITICAL ? 'bg-rose-100 text-rose-700' :
                          app.riskLevel === RiskLevel.HIGH ? 'bg-orange-100 text-orange-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {app.riskLevel} Risk
                        </span>
                      )}
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                        {app.status}
                      </span>
                      <button 
                        onClick={() => handleDeleteAppointment(app.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Delete Appointment"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                </div>
              ))}
              {appointments.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <p className="text-slate-400">No appointments scheduled yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-emerald-600 text-white p-6 rounded-3xl shadow-lg shadow-emerald-600/20">
            <h3 className="text-lg font-semibold mb-2">Health Tip</h3>
            <p className="text-emerald-50 text-sm leading-relaxed">
              Regular check-ups can help find problems before they start. They also can help find problems early, when your chances for treatment and cure are better.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-3xl border border-slate-200">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={handleDownloadRecords}
                className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group"
              >
                <span className="text-sm font-medium">Download Records</span>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-600" />
              </button>
              <button 
                onClick={() => setActiveModal('insurance')}
                className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group"
              >
                <span className="text-sm font-medium">Insurance Details</span>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showBooking && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h2 className="text-2xl font-bold mb-6">Book Appointment</h2>
            <form onSubmit={handleBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Your Name</label>
                <input 
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={bookingForm.patientName}
                  onChange={e => setBookingForm({...bookingForm, patientName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email Address</label>
                <input 
                  required
                  type="email"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={bookingForm.patientEmail}
                  onChange={e => setBookingForm({...bookingForm, patientEmail: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
                  <input 
                    required
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={bookingForm.date}
                    onChange={e => setBookingForm({...bookingForm, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Time</label>
                  <input 
                    required
                    type="time"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={bookingForm.time}
                    onChange={e => setBookingForm({...bookingForm, time: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowBooking(false)}
                  className="flex-1 py-3 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 font-semibold bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative"
          >
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Plus className="rotate-45 text-slate-400" size={20} />
            </button>

            <div className="space-y-6">
              <div className="flex items-center gap-3 text-emerald-600">
                <Activity size={24} />
                <h2 className="text-2xl font-bold">Insurance Details</h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Provider</p>
                  <p className="font-semibold text-slate-900">{insuranceInfo.provider}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Policy #</p>
                    <p className="font-semibold text-slate-900">{insuranceInfo.policyNumber}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Group #</p>
                    <p className="font-semibold text-slate-900">{insuranceInfo.groupNumber}</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Expiry Date</p>
                  <p className="font-semibold text-slate-900">{insuranceInfo.expiry}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
