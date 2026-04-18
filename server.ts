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

// Essential for AI Studio / Proxied environments
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || "cyber-rider-secret",
  resave: false,
  saveUninitialized: true,
  proxy: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

const getRedirectUri = (req?: express.Request) => {
  let appUrl = process.env.APP_URL;
  
  if (!appUrl && req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    appUrl = `${protocol}://${host}`;
  }
  
  if (!appUrl) return "";
  
  // Ensure no trailing slash
  const cleanUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  return `${cleanUrl}/auth/google/callback`;
};

// Lazy initialize oauth2Client
const getOAuth2Client = (req: express.Request) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    getRedirectUri(req)
  );
};

// Helper to get tokens from session OR header (fallback for iframe/cookie issues)
const getTokens = (req: express.Request) => {
  const sessionTokens = (req as any).session.tokens;
  if (sessionTokens) {
    console.log("Tokens found in session.");
    return sessionTokens;
  }

  const headerTokens = req.headers['x-google-tokens'];
  if (headerTokens && typeof headerTokens === 'string') {
    try {
      console.log("Tokens found in X-Google-Tokens header.");
      return JSON.parse(headerTokens);
    } catch (e) {
      console.error("Error parsing X-Google-Tokens header:", e);
      return null;
    }
  }
  
  console.log("No tokens found in session or headers.");
  return null;
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 1. Get Google Auth URL
app.get("/api/auth/google/url", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ 
      error: "CREDENTIALS_MISSING",
      redirectUri: getRedirectUri(req),
      message: "Google API Credentials are not configured in AI Studio Secrets."
    });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    res.json({ url, redirectUri: getRedirectUri(req) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    // Store tokens in session
    (req as any).session.tokens = tokens;
    const tokensJson = JSON.stringify(tokens);
    
    res.send(`
      <html>
        <body style="background: #0a0a0a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; border: 1px solid #333; padding: 40px; border-radius: 20px; background: #111;">
            <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
            <h2 style="margin-bottom: 10px; color: #00f3ff;">Authentication Successful!</h2>
            <p style="color: #888; font-size: 14px;">গুগল ড্রাইভ সফলভাবে সংযুক্ত হয়েছে। এই উইন্ডোটি অটোমেটিক বন্ধ হয়ে যাবে।</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_SUCCESS',
                  tokens: ${tokensJson}
                }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("OAuth Error:", error);
    res.status(500).send(`
      <html>
        <body style="background: #0a0a0a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px;">
          <div style="text-align: center; border: 1px solid #ff0055; padding: 40px; border-radius: 20px; background: #111; max-width: 500px;">
            <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
            <h2 style="margin-bottom: 10px; color: #ff0055;">Authentication Failed</h2>
            <p style="color: #ccc; font-size: 14px; line-height: 1.6;">
              ${error.message || "Unknown error during authentication."}
              <br/><br/>
              <span style="color: #888;">টিপস: আপনি কি Client Secret দিতে ভুলে গেছেন? আপনার গুগল ক্লাউড কনসোল থেকে Secret আইডিটি কপি করে 'Manual API Setup'-এ দিন।</span>
            </p>
            <button onclick="window.close()" style="margin-top: 30px; background: #333; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

// 3. Check Auth Status
app.get("/api/auth/google/status", (req, res) => {
  const tokens = getTokens(req);
  res.json({ isAuthenticated: !!tokens });
});

// 4. Set Session from Client Tokens (Persistence)
app.post("/api/auth/google/session", (req, res) => {
  const { tokens } = req.body;
  if (!tokens) return res.status(400).json({ error: "No tokens provided" });
  (req as any).session.tokens = tokens;
  
  // Explicitly save session to ensure it persists in MemoryStore before responding
  req.session.save((err) => {
    if (err) {
      console.error("Session save error:", err);
      return res.status(500).json({ error: "Session save failed" });
    }
    res.json({ status: "Session restored" });
  });
});

// 5. Backup to Google Drive
app.post("/api/backup/google-drive", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated with Google" });
  }

  const { data, fileName } = req.body;
  
  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);
    
    // Listen for token refreshes
    let refreshedTokens: any = null;
    oauth2Client.on('tokens', (newTokens) => {
      refreshedTokens = { ...tokens, ...newTokens };
      (req as any).session.tokens = refreshedTokens;
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Search for existing backup file
    const response = await drive.files.list({
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existingFile = response.data.files?.[0];
    let result: any = {};

    if (existingFile) {
      // Update existing file
      const updateRes = await drive.files.update({
        fileId: existingFile.id!,
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(data, null, 2),
        },
      });
      result = { message: "Backup updated successfully", fileId: existingFile.id };
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
      result = { message: "Backup created successfully", fileId: file.data.id };
    }

    if (refreshedTokens) {
      result.newTokens = refreshedTokens;
    }
    
    res.json(result);
  } catch (error: any) {
    console.error("Drive Backup Error:", error);
    if (error.code === 401 || (error.response && error.response.status === 401)) {
      return res.status(401).json({ error: "গুগল ড্রাইভ অথেন্টিকেশন এক্সপায়ার হয়েছে। দয়া করে পুনরায় কানেক্ট করুন।" });
    }
    if (error.code === 403 || (error.response && error.response.status === 403)) {
      return res.status(403).json({ error: "গুগল ড্রাইভ পারমিশন ইরর! দয়া করে আপনার ড্রাইভ স্টোরেজ চেক করুন।" });
    }
    res.status(500).json({ error: "ব্যাকআপ করতে সমস্যা হয়েছে: " + (error.message || "Unknown Error") });
  }
});

// 5. Restore from Google Drive
app.get("/api/backup/google-drive/restore", async (req, res) => {
  const tokens = getTokens(req);
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated with Google" });
  }

  const { fileName } = req.query;
  
  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    // Listen for token refreshes
    let refreshedTokens: any = null;
    oauth2Client.on('tokens', (newTokens) => {
      refreshedTokens = { ...tokens, ...newTokens };
      (req as any).session.tokens = refreshedTokens;
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Search for backup file
    const response = await drive.files.list({
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id, name, size, modifiedTime)',
      spaces: 'drive',
    });

    const existingFile = response.data.files?.[0];

    if (!existingFile) {
      return res.status(404).json({ error: "Backup file not found" });
    }

    // Download file content
    const fileContent = await drive.files.get({
      fileId: existingFile.id!,
      alt: 'media',
    });

    const result: any = { 
      data: fileContent.data,
      info: {
        size: existingFile.size,
        modifiedTime: existingFile.modifiedTime
      }
    };

    if (refreshedTokens) {
      result.newTokens = refreshedTokens;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Drive Restore Error:", error);
    if (error.code === 401 || (error.response && error.response.status === 401)) {
      return res.status(401).json({ error: "গুগল ড্রাইভ অথেন্টিকেশন এক্সপায়ার হয়েছে। দয়া করে পুনরায় কানেক্ট করুন।" });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: "আপনার গুগল ড্রাইভে কোনো ব্যাকআপ ফাইল পাওয়া যায়নি।" });
    }
    res.status(500).json({ error: "রিস্টোর করতে সমস্যা হয়েছে: " + (error.message || "Unknown Error") });
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
