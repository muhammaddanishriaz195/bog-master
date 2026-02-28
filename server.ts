import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("ab_testing.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS ab_tests (
    id TEXT PRIMARY KEY,
    post_id TEXT,
    target_url TEXT,
    title_a TEXT,
    title_b TEXT,
    title_c TEXT,
    clicks_a INTEGER DEFAULT 0,
    clicks_b INTEGER DEFAULT 0,
    clicks_c INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

// Blogger API setup
const blogger = google.blogger("v3");

app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/blogger"],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);
    
    // In a real app, you'd store tokens in a session/DB
    // For this demo, we'll just send a success message
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/api/blogger/publish", async (req, res) => {
  const { title, content, labels, status, tokens } = req.body;
  const blogId = process.env.BLOGGER_BLOG_ID;

  if (!blogId) {
    return res.status(400).json({ error: "BLOGGER_BLOG_ID is not configured" });
  }

  try {
    const client = new google.auth.OAuth2();
    client.setCredentials(tokens);

    const response = await blogger.posts.insert({
      auth: client,
      blogId: blogId,
      requestBody: {
        title: title,
        content: content,
        labels: labels,
      },
      isDraft: status === "DRAFT",
    });

    const postData = response.data;
    const { alternative_titles } = req.body;

    if (alternative_titles && alternative_titles.length >= 2 && postData.url) {
      const testId = Math.random().toString(36).substring(2, 15);
      const stmt = db.prepare(`
        INSERT INTO ab_tests (id, post_id, target_url, title_a, title_b, title_c)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        testId,
        postData.id,
        postData.url,
        title,
        alternative_titles[0] || "",
        alternative_titles[1] || ""
      );
      
      // Add tracking info to response
      (postData as any).ab_test_id = testId;
      (postData as any).tracking_urls = [
        `${process.env.APP_URL}/api/ab-test/click/${testId}/0`,
        `${process.env.APP_URL}/api/ab-test/click/${testId}/1`,
        `${process.env.APP_URL}/api/ab-test/click/${testId}/2`,
      ];
    }

    res.json({ success: true, data: postData });
  } catch (error: any) {
    console.error("Blogger API error:", error);
    res.status(500).json({ error: error.message || "Failed to publish to Blogger" });
  }
});

app.get("/api/ab-test/click/:testId/:index", (req, res) => {
  const { testId, index } = req.params;
  const idx = parseInt(index);
  
  try {
    const test = db.prepare("SELECT target_url FROM ab_tests WHERE id = ?").get(testId) as any;
    if (!test) return res.status(404).send("Test not found");

    const column = idx === 0 ? "clicks_a" : idx === 1 ? "clicks_b" : "clicks_c";
    db.prepare(`UPDATE ab_tests SET ${column} = ${column} + 1 WHERE id = ?`).run(testId);

    res.redirect(test.target_url);
  } catch (error) {
    console.error("Tracking error:", error);
    res.status(500).send("Error tracking click");
  }
});

app.get("/api/ab-test/results", (req, res) => {
  try {
    const results = db.prepare("SELECT * FROM ab_tests ORDER BY created_at DESC").all();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
