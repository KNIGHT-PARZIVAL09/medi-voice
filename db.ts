import Database from 'better-sqlite3';
import { RiskLevel } from './types.ts';

const db = new Database('healthcare.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY,
    name TEXT,
    specialty TEXT,
    image TEXT,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patientName TEXT,
    patientEmail TEXT,
    doctorId TEXT,
    doctorName TEXT,
    date TEXT,
    time TEXT,
    status TEXT,
    summary TEXT,
    riskLevel TEXT,
    transcript TEXT,
    notes TEXT,
    prescription TEXT,
    whiteboardData TEXT
  );
`);

// Ensure columns exist
try { db.exec("ALTER TABLE doctors ADD COLUMN password TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN notes TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN prescription TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN whiteboardData TEXT"); } catch (e) {}

// Seed doctors if empty
const doctorCount = db.prepare('SELECT COUNT(*) as count FROM doctors').get() as { count: number };
if (doctorCount.count === 0) {
  const insert = db.prepare('INSERT INTO doctors (id, name, specialty, image, password) VALUES (?, ?, ?, ?, ?)');
  insert.run('1', 'Dr. Sarah Wilson', 'Cardiologist', 'https://picsum.photos/seed/dr1/200/200', 'heart123');
  insert.run('2', 'Dr. James Chen', 'Neurologist', 'https://picsum.photos/seed/dr2/200/200', 'brain456');
  insert.run('3', 'Dr. Elena Rodriguez', 'General Practitioner', 'https://picsum.photos/seed/dr3/200/200', 'clinic789');
  insert.run('4', 'Dr. Michael Brown', 'Pediatrician', 'https://picsum.photos/seed/dr4/200/200', 'kids000');
} else {
  // Update existing doctors with passwords
  db.prepare('UPDATE doctors SET password = ? WHERE id = ?').run('heart123', '1');
  db.prepare('UPDATE doctors SET password = ? WHERE id = ?').run('brain456', '2');
  db.prepare('UPDATE doctors SET password = ? WHERE id = ?').run('clinic789', '3');
  db.prepare('UPDATE doctors SET password = ? WHERE id = ?').run('kids000', '4');
}

export default db;
