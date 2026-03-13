import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzePatientIntake(transcript: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following patient intake transcript and provide a structured summary and risk assessment.
      
      The transcript should contain a summary at the end. If it does, use that information.
      The summary should follow this format:
      Patient Name:
      Age:
      Main Symptoms:
      Duration of Symptoms:
      Severity Level:
      Additional Notes:
      
      Possible Concern:

      Transcript:
      ${transcript}
      
      Return the response in JSON format with fields:
      - summary: A structured medical summary following the format above.
      - riskLevel: One of "LOW", "MEDIUM", "HIGH", "CRITICAL".
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            riskLevel: { 
              type: Type.STRING,
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
            }
          },
          required: ["summary", "riskLevel"]
        }
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw error;
  }
}

export async function generatePrescription(patientName: string, concerns: string, notes: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a professional digital prescription based on the following:
      Patient: ${patientName}
      Concerns: ${concerns}
      Doctor's Notes: ${notes}
      
      Include:
      - Medication name and dosage
      - Frequency
      - Duration
      - Special instructions
      `,
    });

    return response.text || "Prescription generation failed.";
  } catch (error: any) {
    console.error("Gemini Prescription Error:", error);
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error("QUOTA_EXCEEDED");
    }
    return "Failed to generate prescription due to service limits. Please try again later.";
  }
}
