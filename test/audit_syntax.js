const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const scripts = content.match(/<script[\s\S]*?<\/script>/gi) || [];
  console.log(`Checking ${path.basename(filePath)}: ${scripts.length} scripts found.`);
  scripts.forEach((s, idx) => {
    const m = s.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return;
    const typeMatch = s.match(/type=["']([^"']+)["']/i);
    if (typeMatch && typeMatch[1] === 'application/json') {
      try {
        JSON.parse(m[1]);
        console.log(`  - Script ${idx} (JSON Data): VALID`);
      } catch(err) {
        console.error(`  - Script ${idx} (JSON Data) ERROR:`, err.message);
      }
    } else {
      try {
        new Function(m[1]);
        console.log(`  - Script ${idx} (JavaScript): VALID`);
      } catch(err) {
        console.error(`  - Script ${idx} (JavaScript) SYNTAX ERROR:`, err.message);
      }
    }
  });
}

checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/index.html');
checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/admin.html');
checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/bali/index.html');
checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/medan/index.html');
checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/makassar/index.html');
checkFile('/Users/muhammadkhairizkibudiman/Projects/layar-diklat-bali/ciawi/index.html');
