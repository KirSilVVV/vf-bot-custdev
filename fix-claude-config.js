import fs from 'fs';
import path from 'path';

const configPath = path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');

const config = {
  "mcpServers": {
    "ga4-analytics": {
      "command": "C:\\Users\\User\\Downloads\\telegram chat bot\\.venv\\Scripts\\ga4-mcp-server.exe",
      "env": {
        "GA4_PROPERTY_ID": "511167634",
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\User\\Downloads\\telegram chat bot\\MCP\\ru-gg-438811-244e58378aec.json"
      }
    },
    "seo-mcp": {
      "command": "C:\\Users\\User\\Downloads\\telegram chat bot\\.venv\\Scripts\\seo-mcp.exe",
      "env": {
        "CAPSOLVER_API_KEY": "CAP-72F583B2811EEA12597C040E3B1FCB382DE1C8DE4838969C2D8CEA1E1ADAA6C0",
        "AHREFS_API_KEY": "XTc4h0Fh4UPwV8lATIwrbnUng"
      }
    },
    "filesystem": {
      "command": "node",
      "args": [
        "C:\\Users\\User\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-filesystem\\dist\\index.js",
        "C:/Users/User/Downloads/csv от yandex and gsc"
      ],
      "env": {}
    }
  }
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf8' });
console.log('✅ Config file created at:', configPath);
console.log('\n📋 Content:');
console.log(JSON.stringify(config, null, 2));
