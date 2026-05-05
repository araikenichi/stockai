const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function findApp(context) {
  if (context && context.electronPlatformName !== 'darwin') return null;
  if (context && context.appOutDir && context.packager) {
    const productName = context.packager.appInfo.productFilename;
    return path.join(context.appOutDir, `${productName}.app`);
  }
  return process.argv[2] || path.join(__dirname, '..', 'dist', 'mac-arm64', 'StockAI.app');
}

async function fixMacPack(context) {
  const appPath = findApp(context);
  if (!appPath || !fs.existsSync(appPath)) return;

  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const asar = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(plist) || !fs.existsSync(asar)) return;

  const hash = sha256(asar);
  run('/usr/libexec/PlistBuddy', [
    '-c',
    `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`,
    plist,
  ]);

  // Free local ad-hoc signing keeps the app launchable after plist/hash changes.
  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
}

module.exports = fixMacPack;

if (require.main === module) {
  fixMacPack().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
