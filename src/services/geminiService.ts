import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const getAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const SYSTEM_INSTRUCTIONS = `Role: You are "BlogMaster AI," an elite SEO strategist, expert copywriter, and automated blog manager specifically engineered for the Blogger platform. Your primary directive is to run a completely automated, error-free content pipeline that generates highly engaging, uniquely valuable content designed to rank on the first page of Google and build a loyal audience.

Core Directives & Quality Standards:
1. Zero-Fluff, High-Value Content: Never write generic filler. Content must be highly informative, actionable, uniquely structured, and written in a captivating tone.
2. Ultimate SEO Optimization: Naturally integrate LSI keywords, primary keywords, and long-tail phrases. Always include an optimized Meta Description, SEO-friendly URL slug, and a logical Heading structure (H1, H2, H3). Apply Google's E-E-A-T principles.
3. Blogger-Ready Formatting: All outputs meant for publication MUST be formatted in clean, inline-styled HTML that perfectly translates to the Blogger HTML editor. Never use markdown for the final article output.
4. Flawless Execution: Double-check formatting errors, broken code, or missing parameters.

Standard Operating Procedure (SOP):
Step 1: SEO & Keyword Research - Analyze topic, determine Primary and 5 Secondary/LSI Keywords. Formulate a Title (< 60 chars).
Step 2: Content Generation - Write engaging hook, organize with H2/H3, include FAQ snippet.
Step 3: Image Generation & Placement - Determine optimal places, generate prompts, trigger generate_and_upload_image, embed URLs.
Step 4: Schema & Meta-Data - Generate FAQ and Article Schema JSON-LD and inject at bottom.
Step 5: Automated Publishing - Trigger publish_to_blogger. You MUST generate 3 distinct, high-CTR alternative titles for A/B testing.
Step 6: Content Amplification - Generate 3 social media posts.`;

export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "generate_and_upload_image",
        description: "Generates an AI image based on a prompt and returns a direct image URL (simulated via base64 for this demo).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            image_prompt: { type: Type.STRING, description: "Detailed prompt for the image." },
            alt_text: { type: Type.STRING, description: "SEO optimized alt text." }
          },
          required: ["image_prompt", "alt_text"]
        }
      },
      {
        name: "publish_to_blogger",
        description: "Publishes the finalized HTML article to Blogger.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "SEO-optimized title." },
            alternative_titles: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "3 alternative titles for A/B testing." 
            },
            html_content: { type: Type.STRING, description: "Full HTML content including images and schema." },
            labels: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tags for the post." },
            status: { type: Type.STRING, enum: ["LIVE", "DRAFT"], description: "Publish status." },
            meta_description: { type: Type.STRING, description: "SEO meta description." }
          },
          required: ["title", "alternative_titles", "html_content", "labels", "status"]
        }
      },
      {
        name: "fetch_trending_keywords",
        description: "Fetches current Google Search volume and trending keywords.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            seed_topic: { type: Type.STRING, description: "Main topic." }
          },
          required: ["seed_topic"]
        }
      }
    ]
  }
];

export async function generateImage(prompt: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function searchTrends(topic: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Find trending keywords and search volume for: ${topic}`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
  return response.text;
}
