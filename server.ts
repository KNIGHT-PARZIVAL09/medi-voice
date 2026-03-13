import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import db from "./src/db.ts";
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';

// Lazy initialize Resend
let resend: Resend | null = null;
function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Lazy initialize SendGrid
let sendgridInitialized = false;
function initSendGrid() {
  if (!sendgridInitialized && process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    sendgridInitialized = true;
  }
  return sendgridInitialized;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/doctors", (req, res) => {
    const doctors = db.prepare('SELECT id, name, specialty, image FROM doctors').all();
    res.json(doctors);
  });

  app.post("/api/doctor-login", (req, res) => {
    const { password } = req.body;
    const doctor = db.prepare('SELECT id, name, specialty, image FROM doctors WHERE password = ?').get(password);
    if (doctor) {
      res.json({ success: true, doctor });
    } else {
      res.status(401).json({ success: false, error: "Invalid password" });
    }
  });

  app.get("/api/appointments", (req, res) => {
    const appointments = db.prepare("SELECT * FROM appointments ORDER BY CASE riskLevel WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, date, time").all();
    res.json(appointments);
  });

  app.post("/api/appointments", (req, res) => {
    const { patientName, patientEmail, doctorId, doctorName, date, time } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO appointments (id, patientName, patientEmail, doctorId, doctorName, date, time, status, riskLevel)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'LOW')
    `).run(id, patientName, patientEmail, doctorId, doctorName, date, time);
    res.json({ id });
  });

  app.patch("/api/appointments/:id", (req, res) => {
    const { id } = req.params;
    const { summary, riskLevel, transcript, status, notes, prescription, whiteboardData } = req.body;
    
    const updates: string[] = [];
    const params: any[] = [];

    if (summary !== undefined) { updates.push('summary = ?'); params.push(summary); }
    if (riskLevel !== undefined) { updates.push('riskLevel = ?'); params.push(riskLevel); }
    if (transcript !== undefined) { updates.push('transcript = ?'); params.push(transcript); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (prescription !== undefined) { updates.push('prescription = ?'); params.push(prescription); }
    if (whiteboardData !== undefined) { updates.push('whiteboardData = ?'); params.push(whiteboardData); }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    res.json({ success: true });
  });

  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html } = req.body;
    
    // Try SendGrid first
    if (process.env.SENDGRID_API_KEY) {
      try {
        initSendGrid();
        await sgMail.send({
          to,
          from: process.env.SENDGRID_FROM_EMAIL || 'onboarding@resend.dev', // Fallback for demo
          subject,
          html,
        });
        return res.json({ success: true, service: 'sendgrid' });
      } catch (err: any) {
        console.error("SendGrid error:", err.response?.body || err);
        // Fall through to Resend if SendGrid fails
      }
    }

    // Try Resend
    const resendClient = getResend();
    if (resendClient) {
      try {
        const { data, error } = await resendClient.emails.send({
          from: 'onboarding@resend.dev',
          to: [to],
          subject: subject,
          html: html,
        });

        if (error) {
          console.error("Resend error:", error);
          return res.status(400).json({ error });
        }

        return res.json({ success: true, data, service: 'resend' });
      } catch (err) {
        console.error("Resend exception:", err);
      }
    }

    return res.status(503).json({ 
      error: "Email service not configured. Please set SENDGRID_API_KEY or RESEND_API_KEY in settings." 
    });
  });
  
  app.delete("/api/appointments", (req, res) => {
    db.prepare('DELETE FROM appointments').run();
    res.json({ success: true });
  });

  app.delete("/api/appointments/:id", (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // WebSocket for Whiteboard
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const roomId = url.searchParams.get("roomId") || "default";

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(ws);

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());
      // Broadcast to others in the same room
      rooms.get(roomId)?.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    });

    ws.on("close", () => {
      rooms.get(roomId)?.delete(ws);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
