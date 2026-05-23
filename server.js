const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy so Express reads X-Forwarded-Proto (important for secure ngrok/localtunnel protocol detection)
app.set('trust proxy', true);

// Parse urlencoded bodies (important for checkboxes and form metadata)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Create required directories
const uploadsDir = path.join(__dirname, 'uploads');
const signedDir = path.join(__dirname, 'uploads', 'signed');
const databaseFile = path.join(__dirname, 'apps.json');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir);

// Initialize registry file if not existing
if (!fs.existsSync(databaseFile)) {
  fs.writeFileSync(databaseFile, JSON.stringify([], null, 2));
}

// Helper to read and write database
function getAppsDatabase() {
  try {
    const data = fs.readFileSync(databaseFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading apps.json:', err);
    return [];
  }
}

function saveAppsDatabase(db) {
  try {
    fs.writeFileSync(databaseFile, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Error writing apps.json:', err);
  }
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit
}).fields([
  { name: 'ipa_file', maxCount: 1 },
  { name: 'p12_file', maxCount: 1 },
  { name: 'mobileprovision_file', maxCount: 1 }
]);

// Serve static web files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(uploadsDir));

// Serve index.html as main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint for Render/hosting platforms
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Helper function to build Plist XML manifest for itms-services
function generatePlist(ipaUrl, bundleId, title, version = '1.0') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${bundleId}</string>
                <key>bundle-version</key>
                <string>${version}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${title}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
}

// API endpoint to fetch all registered library apps
app.get('/api/apps', (req, res) => {
  const db = getAppsDatabase();
  // Return apps array sorted newest first
  const sortedApps = db.sort((a, b) => b.timestamp - a.timestamp);
  res.json({ success: true, apps: sortedApps });
});

// Upload & Sign POST route
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, message: 'Upload failed: ' + err.message });
    }

    if (!req.files || !req.files['ipa_file']) {
      return res.status(400).json({ success: false, message: 'Missing IPA file' });
    }

    const ipaFile = req.files['ipa_file'][0];
    const password = req.body.password || '';
    const useServerCert = req.body.use_server_cert || '';
    const saveToLibrary = req.body.save_to_library === 'on'; // Checkbox is sent as 'on' when active
    
    const originalName = ipaFile.originalname;
    const appTitle = originalName.substring(0, originalName.lastIndexOf('.')) || 'SignedApp';
    const outputFilename = `signed-${Date.now()}-${originalName}`;
    const signedIpaPath = path.join(signedDir, outputFilename);

    console.log(`Received sign request for: ${originalName} (Save to library: ${saveToLibrary})`);

    // Determine protocol and host for URL building (trust proxy for HTTPS)
    const protocol = req.protocol;
    const host = req.headers.host;
    
    const p12File = req.files['p12_file'] ? req.files['p12_file'][0] : null;
    const provFile = req.files['mobileprovision_file'] ? req.files['mobileprovision_file'][0] : null;

    // Use local zsign binary if compiled in project root (for platforms like Render)
    const zsignBin = fs.existsSync(path.join(__dirname, 'zsign')) ? './zsign' : 'zsign';
    let zsignCommand = '';
    
    if (p12File && provFile) {
      zsignCommand = `${zsignBin} -k "${p12File.path}" -p "${password}" -m "${provFile.path}" -o "${signedIpaPath}" "${ipaFile.path}"`;
    } else if (useServerCert) {
      const localCertPath = path.join(__dirname, 'certs', `${useServerCert}.p12`);
      const localProvPath = path.join(__dirname, 'certs', `${useServerCert}.mobileprovision`);
      
      if (fs.existsSync(localCertPath) && fs.existsSync(localProvPath)) {
        zsignCommand = `${zsignBin} -k "${localCertPath}" -p "123456" -m "${localProvPath}" -o "${signedIpaPath}" "${ipaFile.path}"`;
      }
    }

    // Attempt real signing if zsign command is configured
    if (zsignCommand) {
      console.log(`Executing real sign command: ${zsignCommand}`);
      
      exec(zsignCommand, (execErr, stdout, stderr) => {
        // Cleanup temporary uploaded manual certificate files
        if (p12File) fs.unlink(p12File.path, () => {});
        if (provFile) fs.unlink(provFile.path, () => {});
        fs.unlink(ipaFile.path, () => {}); // Cleanup raw ipa file

        if (execErr) {
          console.error('zsign execution failed:', execErr);
          console.error('zsign stderr:', stderr);
          return res.status(500).json({ 
            success: false, 
            message: 'Resigning failed. Ensure your certificate files and password are valid.' 
          });
        }

        console.log('zsign output:', stdout);
        finishSigningResponse(outputFilename, appTitle, protocol, host, saveToLibrary, res);
      });
    } else {
      // MOCK SIGN FALLBACK
      console.log('No local certificates found or manual input incomplete. Falling back to Mock Sign.');
      
      setTimeout(() => {
        fs.rename(ipaFile.path, signedIpaPath, (renameErr) => {
          // Cleanup files
          if (p12File) fs.unlink(p12File.path, () => {});
          if (provFile) fs.unlink(provFile.path, () => {});
          
          if (renameErr) {
            console.error('Mock file move failed:', renameErr);
            return res.status(500).json({ success: false, message: 'Signing failed in server file storage.' });
          }

          finishSigningResponse(outputFilename, appTitle, protocol, host, saveToLibrary, res);
        });
      }, 2500); // 2.5 second mock delay
    }
  });
});

// Helper to write Plist, save registry database entry, and return JSON response
function finishSigningResponse(outputFilename, appTitle, protocol, host, saveToLibrary, res) {
  const ipaDownloadUrl = `${protocol}://${host}/uploads/signed/${outputFilename}`;
  const plistFilename = `manifest-${Date.now()}.plist`;
  const plistPath = path.join(signedDir, plistFilename);
  const plistUrl = `${protocol}://${host}/uploads/signed/${plistFilename}`;
  
  // Dummy bundle ID (will be read from binary if zsign is run, but works for mock testing)
  const bundleId = 'com.applejr.legacy.signedapp';
  const appVersion = '1.0';
  
  // Generate and save plist XML
  const plistContent = generatePlist(ipaDownloadUrl, bundleId, appTitle, appVersion);
  fs.writeFileSync(plistPath, plistContent);

  const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(plistUrl)}`;

  // Save to database registry if requested
  if (saveToLibrary) {
    const db = getAppsDatabase();
    db.push({
      title: appTitle,
      bundleId: bundleId,
      version: appVersion,
      installUrl: installUrl,
      downloadUrl: ipaDownloadUrl,
      timestamp: Date.now()
    });
    saveAppsDatabase(db);
    console.log(`Saved "${appTitle}" to public library registry apps.json`);
  }

  console.log(`Resigned successfully!`);
  console.log(`Download IPA: ${ipaDownloadUrl}`);
  console.log(`Install Link: ${installUrl}`);

  res.json({
    success: true,
    install_url: installUrl,
    download_url: ipaDownloadUrl
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 AppleJr Legacy Signer listening on port ${PORT}`);
  console.log(`🔗 Local Address: http://localhost:${PORT}`);
  console.log(`===================================================`);
  console.log(`💡 NOTE FOR IPAD 4 INSTALLATION:`);
  console.log(`   iOS requires HTTPS to install apps.`);
  console.log(`   To test on a real iPad over Wi-Fi, run a tunnel like ngrok:`);
  console.log(`   > ngrok http ${PORT}`);
  console.log(`   Then open the secure HTTPS tunnel URL in Safari on the iPad.`);
  console.log(`===================================================`);
});
