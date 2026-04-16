import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || "cyber-rider-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    httpOnly: true 
  }
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 1. Get Google Auth URL
app.get("/api/auth/google/url", (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ url });
});

// 2. Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // Store tokens in session
    (req as any).session.tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
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
    console.error("OAuth Error:", error);
    res.status(500).send("Authentication failed");
  }
});

// 3. Check Auth Status
app.get("/api/auth/google/status", (req, res) => {
  const tokens = (req as any).session.tokens;
  res.json({ isAuthenticated: !!tokens });
});

// 4. Backup to Google Drive
app.post("/api/backup/google-drive", async (req, res) => {
  const tokens = (req as any).session.tokens;
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated with Google" });
  }

  const { data, fileName } = req.body;
  
  try {
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Search for existing backup file
    const response = await drive.files.list({
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFile = response.data.files?.[0];

    if (existingFile) {
      // Update existing file
      await drive.files.update({
        fileId: existingFile.id!,
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(data, null, 2),
        },
      });
      res.json({ message: "Backup updated successfully", fileId: existingFile.id });
    } else {
      // Create new file
      const fileMetadata = {
        name: fileName,
        mimeType: 'application/json',
      };
      const media = {
        mimeType: 'application/json',
        body: JSON.stringify(data, null, 2),
      };
      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });
      res.json({ message: "Backup created successfully", fileId: file.data.id });
    }
  } catch (error) {
    console.error("Drive Backup Error:", error);
    res.status(500).json({ error: "Failed to backup to Google Drive" });
  }
});

// Vite middleware setup
async function startServer() {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
