import React, { useState } from 'react';
import PatientDashboard from './PatientDashboard.tsx';
import DoctorDashboard from './DoctorDashboard.tsx';
import { User, Stethoscope, Activity, Lock, ArrowRight, LogOut } from 'lucide-react';
import { Doctor } from './types.ts';

function DoctorLogin({ onLogin }: { onLogin: (doctor: Doctor) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch('/api/doctor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.doctor);
      } else {
        setError("Invalid password. Please try again.");
      }
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl">
      <div className="flex flex-col items-center text-center space-y-4 mb-8">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Doctor Access</h2>
          <p className="text-slate-500">Enter your secure password to access the portal.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
          <input 
            type="password"
            autoFocus
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}
        <button 
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
        >
          {isLoading ? "Verifying..." : "Access Dashboard"}
          <ArrowRight size={18} />
        </button>
      </form>
      
      <div className="mt-8 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">Authorized Medical Personnel Only</p>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<'patient' | 'doctor'>('patient');
  const [loggedInDoctor, setLoggedInDoctor] = useState<Doctor | null>(null);

  const handleLogout = () => {
    setLoggedInDoctor(null);
    setView('patient');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Activity size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight">MediVoice AI</span>
          </div>
          
          <div className="flex items-center gap-4">
            {!loggedInDoctor ? (
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setView('patient')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'patient' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <User size={16} />
                  Patient
                </button>
                <button 
                  onClick={() => setView('doctor')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'doctor' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Stethoscope size={16} />
                  Doctor
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-200">
                  <img src={loggedInDoctor.image} alt={loggedInDoctor.name} className="w-8 h-8 rounded-full border border-slate-200" />
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-slate-900 leading-none">{loggedInDoctor.name}</p>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">{loggedInDoctor.specialty}</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="py-8">
        {view === 'patient' ? (
          <PatientDashboard />
        ) : (
          loggedInDoctor ? (
            <DoctorDashboard doctor={loggedInDoctor} />
          ) : (
            <DoctorLogin onLogin={setLoggedInDoctor} />
          )
        )}
      </main>

      <footer className="border-t border-slate-200 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <Activity size={16} />
            <span className="font-bold text-sm">MediVoice AI</span>
          </div>
          <div className="flex gap-8 text-xs font-medium text-slate-400 uppercase tracking-widest">
            <a href="#" className="hover:text-slate-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Support</a>
          </div>
          <p className="text-xs text-slate-400">© 2026 MediVoice AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
