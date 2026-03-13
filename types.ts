import { GoogleGenAI } from "@google/genai";

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL"
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  image: string;
}

export interface Appointment {
  id: string;
  patientName: string;
  patientEmail: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  summary?: string;
  riskLevel: RiskLevel;
  transcript?: string;
  notes?: string;
  prescription?: string;
  whiteboardData?: string;
}

export interface WhiteboardState {
  lines: any[];
}
