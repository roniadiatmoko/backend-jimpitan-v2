const fs = require('fs');
const path = require('path');

const srcDir = 'E:\\jimpitan';
const dstDir = 'D:\\jimpitan';

console.log(`Starting sync from ${srcDir} to ${dstDir}...`);

let fileCount = 0;
let dirCount = 0;

function copyRecursive(src, dst) {
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst, { recursive: true });
    dirCount++;
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    // Skip node_modules, .git, and baileys_auth_info
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'baileys_auth_info') {
        console.log(`Skipping directory: ${srcPath}`);
        continue;
      }
      copyRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      // Copy file
      fs.copyFileSync(srcPath, dstPath);
      fileCount++;
    }
  }
}

// 1. Copy files (excluding node_modules)
copyRecursive(srcDir, dstDir);
console.log(`Copied ${fileCount} files across ${dirCount} directories.`);

// 2. Clean up any existing node_modules in destination if present
const dstBackendNm = path.join(dstDir, 'backend', 'node_modules');
if (fs.existsSync(dstBackendNm)) {
  console.log('Removing old node_modules in D:\\jimpitan\\backend...');
  fs.rmSync(dstBackendNm, { recursive: true, force: true });
  console.log('Removed D:\\jimpitan\\backend\\node_modules');
}

const dstFrontendNm = path.join(dstDir, 'frontend', 'node_modules');
if (fs.existsSync(dstFrontendNm)) {
  console.log('Removing old node_modules in D:\\jimpitan\\frontend...');
  fs.rmSync(dstFrontendNm, { recursive: true, force: true });
  console.log('Removed D:\\jimpitan\\frontend\\node_modules');
}

console.log('Sync to D:\\ completed successfully!');
